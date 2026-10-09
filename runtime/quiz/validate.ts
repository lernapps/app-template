// Validates a question bank at build time: against its JSON Schema (quiz.v1.schema.json), then what a schema
// cannot say (one correct option in a single choice, unique ids, ...). Each problem names the question and what to
// change, for the assistant that wrote the bank.
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import schema from "./quiz.v1.schema.json" with { type: "json" };
import type { Question, Quiz } from "./quiz.ts";

export const SCHEMA_URL = "https://lernapps.net/tooling/schemas/quiz.v1.schema.json";
export const RULE_URL = "https://lernapps.net/tooling/rules/#quiz-bank-valid";

const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile<Quiz>(schema);

/** `/questions/2/options/1/text` as `questions[2].options[1].text`, with the id of the question. */
function where(path: string, value: unknown): string {
  const parts = path.split("/").slice(1);
  const id = parts[0] === "questions" ? questionId(value, Number(parts[1])) : undefined;
  const readable = parts.map((part) => (/^\d+$/.test(part) ? `[${part}]` : `.${part}`)).join("");
  const at = readable === "" ? "the bank" : readable.slice(1);
  return id === undefined ? at : `${at} (question "${id}")`;
}

function questionId(value: unknown, index: number): string | undefined {
  if (typeof value !== "object" || value === null || !("questions" in value)) return undefined;
  const questions = value.questions;
  if (!Array.isArray(questions)) return undefined;
  const question: unknown = questions[index];
  if (typeof question !== "object" || question === null || !("id" in question)) return undefined;
  return typeof question.id === "string" ? question.id : undefined;
}

function schemaMessage(error: ErrorObject, value: unknown): string | undefined {
  const at = where(error.instancePath, value);
  switch (error.keyword) {
    // reported by the branch of the question's type, which says more
    case "if":
      return undefined;
    case "required":
      return `${at}: ${String(error.params["missingProperty"])} is missing`;
    case "additionalProperties":
      return `${at}: ${String(error.params["additionalProperty"])} is not allowed here`;
    case "unevaluatedProperties":
      return `${at}: ${String(error.params["unevaluatedProperty"])} is not allowed for this type of question`;
    case "enum":
      return `${at}: must be one of ${(error.params["allowedValues"] as unknown[]).join(", ")}`;
    case "pattern":
      return error.instancePath.endsWith("/id")
        ? `${at}: use lower-case letters, digits and hyphens, e.g. "brueche-kuerzen"`
        : `${at}: must not be empty`;
    default:
      return `${at}: ${error.message ?? "is invalid"}`;
  }
}

function duplicates(values: readonly string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

/** What the schema cannot say about one question. */
function questionProblems(question: Question, at: string): string[] {
  const problems: string[] = [];
  const twice = (what: string, values: readonly string[]) => {
    for (const value of duplicates(values)) problems.push(`${at}: the ${what} "${value}" appears twice`);
  };
  switch (question.type) {
    case "single-choice": {
      const correct = question.options.filter((option) => option.correct).length;
      if (correct !== 1) {
        problems.push(
          `${at}: a single-choice question needs exactly one correct option; it has ${correct}. Mark one option "correct": true, or make it "multiple-choice"`,
        );
      }
      twice(
        "option",
        question.options.map((option) => option.text),
      );
      break;
    }
    case "multiple-choice":
      if (!question.options.some((option) => option.correct)) {
        problems.push(`${at}: a multiple-choice question needs at least one correct option; it has none`);
      }
      twice(
        "option",
        question.options.map((option) => option.text),
      );
      break;
    case "ordering":
      twice("item", question.items);
      break;
    case "matching":
      twice(
        "left entry",
        question.pairs.map((pair) => pair.left),
      );
      twice(
        "right entry",
        question.pairs.map((pair) => pair.right),
      );
      break;
    case "true-false":
    case "number":
      break;
  }
  return problems;
}

/** The problems of a question bank; none when it is valid. */
export function problems(value: unknown): string[] {
  if (!validateSchema(value)) {
    const errors = validateSchema.errors ?? [];
    // a question of an unknown type: say that, not every property its type would not allow
    const unknownType = new Set(
      errors
        .filter((error) => error.keyword === "enum" && error.instancePath.endsWith("/type"))
        .map((error) => error.instancePath.slice(0, -"/type".length)),
    );
    return errors
      .filter((error) => !(error.keyword === "unevaluatedProperties" && unknownType.has(error.instancePath)))
      .flatMap((error) => schemaMessage(error, value) ?? []);
  }
  const ids = value.questions.map((question) => question.id);
  return [
    ...duplicates(ids).map((id) => `questions: the id "${id}" appears twice; each question needs its own id`),
    ...value.questions.flatMap((question, index) =>
      questionProblems(question, `questions[${index}] (question "${question.id}")`),
    ),
  ];
}

/** Reads a question bank from JSON text; throws an Error whose message lists every problem. */
export function parseBank(text: string, file: string): Quiz {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const found = problems(value);
  if (found.length > 0) {
    throw new Error(
      [
        `${file} is not a valid question bank (${RULE_URL}):`,
        ...found.map((problem) => `  - ${problem}`),
        `Fix the question bank as its schema says: ${SCHEMA_URL}`,
      ].join("\n"),
    );
  }
  return value as Quiz;
}
