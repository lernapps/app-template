// The contract of a quiz's scoring, as the engine and the end-to-end tests of every quiz consume it: what counts as
// the right answer to each type of question, how a typed number is read, and the score of a set of answers.
import { describe, expect, test } from "vite-plus/test";
import { isComplete, isCorrect, parseNumber, score, shuffled, type Question } from "../runtime/quiz/quiz.ts";

const base = {
  text: "Frage",
  explanation: "Erklärung",
  links: [{ title: "Mehr", url: "https://de.wikipedia.org/wiki/Bruch" }],
};
const option = (text: string, correct: boolean) => ({ text, correct, info: `über ${text}` });

const single: Question = {
  ...base,
  id: "single",
  type: "single-choice",
  options: [option("a", false), option("b", true), option("c", false)],
};
const multiple: Question = {
  ...base,
  id: "multiple",
  type: "multiple-choice",
  options: [option("a", true), option("b", false), option("c", true)],
};
const trueFalse: Question = {
  ...base,
  id: "true-false",
  type: "true-false",
  answer: false,
};
const length: Question = { ...base, id: "number", type: "number", answer: 3, tolerance: 0.05, unit: "m" };
const exact: Question = { ...base, id: "exact", type: "number", answer: 0.3, tolerance: 0 };
const ordering: Question = { ...base, id: "ordering", type: "ordering", items: ["eins", "zwei", "drei"] };
const matching: Question = {
  ...base,
  id: "matching",
  type: "matching",
  pairs: [
    { left: "km", right: "Kilometer" },
    { left: "cm", right: "Zentimeter" },
  ],
};

describe("a right answer counts, a wrong one does not", () => {
  test.each([
    ["single choice", single, 1, 0],
    ["multiple choice: exactly the correct options", multiple, [0, 2], [0]],
    ["multiple choice: a wrong option too", multiple, [2, 0], [0, 1, 2]],
    ["true/false", trueFalse, false, true],
    ["number within the tolerance", length, "3,04", "3,06"],
    ["number with its unit and a point", length, "2.95 m", "2,9 m"],
    ["number, exact, with decimal rounding", exact, "0,3", "0,31"],
    ["ordering", ordering, [0, 1, 2], [1, 0, 2]],
    ["matching", matching, [0, 1], [1, 0]],
  ] as const)("%s", (_name, question, right, wrong) => {
    expect(isCorrect(question, right)).toBe(true);
    expect(isCorrect(question, wrong)).toBe(false);
  });

  test("an answer of the wrong shape does not count", () => {
    expect(isCorrect(single, [1])).toBe(false);
    expect(isCorrect(trueFalse, "false")).toBe(false);
    expect(isCorrect(length, 3)).toBe(false);
    expect(isCorrect(ordering, [0, 1])).toBe(false);
  });
});

describe("a typed number", () => {
  test.each([
    ["3", 3],
    ["3,5", 3.5],
    ["3.5", 3.5],
    [" -0,25 ", -0.25],
    ["−2", -2],
    ["1 000", 1000],
    [",5", 0.5],
  ])("%j reads as %d", (input, value) => {
    expect(parseNumber(input)).toBe(value);
  });

  test.each(["", "drei", "3,5,1", "3e2", "3 cm"])("%j is not a number", (input) => {
    expect(parseNumber(input, "m")).toBeUndefined();
  });

  test("a number that is not one is no answer yet, not a wrong one", () => {
    expect(isComplete(length, "drei")).toBe(false);
    expect(isComplete(length, "3")).toBe(true);
  });
});

describe("completeness", () => {
  test("ordering and matching need every place", () => {
    expect(isComplete(ordering, [0, -1, 2])).toBe(false);
    expect(isComplete(matching, [1, 0])).toBe(true);
  });

  test("multiple choice needs at least one option", () => {
    expect(isComplete(multiple, [])).toBe(false);
  });
});

test("the score counts the questions answered right; unanswered ones count as wrong", () => {
  const questions = [single, multiple, trueFalse, length, ordering, matching];
  const answers = new Map<string, number | readonly number[] | boolean | string>([
    ["single", 1],
    ["multiple", [0]],
    ["true-false", false],
    ["number", "3"],
    ["ordering", [0, 1, 2]],
  ]);
  expect(score(questions, answers)).toBe(4);
});

test("the same seed gives the same order, another seed another one", () => {
  expect(shuffled(8, 42)).toEqual(shuffled(8, 42));
  expect(shuffled(8, 42)).not.toEqual(shuffled(8, 43));
  expect([...shuffled(8, 42)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
});
