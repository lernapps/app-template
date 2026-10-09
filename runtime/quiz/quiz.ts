// The question bank of a quiz about things to know (src/quiz.json, schema quiz.v1.schema.json) and what counts as
// a right answer. Used at build time (validation, rendering), in the browser (the engine) and by the end-to-end
// tests, so all three agree.

/** A link for further reading. */
export interface Link {
  title: string;
  url: string;
}

/** An option of a choice: `info` is background on the option itself, true whether or not it is the right answer. */
export interface Option {
  text: string;
  correct: boolean;
  info: string;
  link?: Link;
}

interface Base {
  id: string;
  text: string;
  /** Why the right answer is right; for types without options also their background. */
  explanation: string;
  links: Link[];
}

export interface SingleChoice extends Base {
  type: "single-choice";
  options: Option[];
}

export interface MultipleChoice extends Base {
  type: "multiple-choice";
  options: Option[];
}

export interface TrueFalse extends Base {
  type: "true-false";
  answer: boolean;
}

export interface NumberQuestion extends Base {
  type: "number";
  answer: number;
  tolerance: number;
  unit?: string;
}

/** `items` in the right order. */
export interface Ordering extends Base {
  type: "ordering";
  items: string[];
}

/** `pairs` as they belong together. */
export interface Matching extends Base {
  type: "matching";
  pairs: { left: string; right: string }[];
}

export type Question = SingleChoice | MultipleChoice | TrueFalse | NumberQuestion | Ordering | Matching;

export interface Quiz {
  title: string;
  intro: string;
  rememberLastResult?: boolean;
  questions: Question[];
  /** Where the facts come from. */
  sources?: { title: string; url?: string }[];
}

/**
 * A learner's answer, by the type of its question:
 * - single choice: the index of the chosen option;
 * - multiple choice: the indices of the chosen options;
 * - true/false: the choice;
 * - number: the text the learner typed;
 * - ordering: for each item (index in the right order), the place the learner gave it, from 0;
 * - matching: for each pair's left entry, the index of the pair whose right entry the learner chose.
 */
export type Answer = number | readonly number[] | boolean | string;

/** A number as a learner types it: comma or point as decimal sign, spaces, the unit after it. */
export function parseNumber(input: string, unit?: string): number | undefined {
  let text = input.trim();
  if (unit !== undefined && text.endsWith(unit)) text = text.slice(0, -unit.length);
  text = text.replace(/[\s ]/g, "").replace(",", ".");
  if (!/^[+\-−]?(\d+\.?\d*|\.\d+)$/.test(text)) return undefined;
  return Number(text.replace("−", "-"));
}

const isIndexList = (answer: Answer): answer is readonly number[] => Array.isArray(answer);

/** Whether `answer` is the right answer to `question`; an answer of the wrong shape is not. */
export function isCorrect(question: Question, answer: Answer): boolean {
  switch (question.type) {
    case "single-choice":
      return typeof answer === "number" && question.options[answer]?.correct === true;
    case "multiple-choice": {
      if (!isIndexList(answer)) return false;
      const chosen = new Set(answer);
      return question.options.every((option, index) => option.correct === chosen.has(index));
    }
    case "true-false":
      return answer === question.answer;
    case "number": {
      if (typeof answer !== "string") return false;
      const value = parseNumber(answer, question.unit);
      // a little slack for decimal rounding: 0.1 + 0.2 is within 0.3 ± 0
      return value !== undefined && Math.abs(value - question.answer) <= question.tolerance + 1e-9;
    }
    case "ordering":
      return isIndexList(answer) && answer.length === question.items.length && answer.every((place, i) => place === i);
    case "matching":
      return isIndexList(answer) && answer.length === question.pairs.length && answer.every((pair, i) => pair === i);
  }
}

/** Whether the learner has answered at all: something chosen, typed or placed everywhere. */
export function isComplete(question: Question, answer: Answer | undefined): answer is Answer {
  if (answer === undefined) return false;
  switch (question.type) {
    case "single-choice":
      return typeof answer === "number";
    case "multiple-choice":
      return isIndexList(answer) && answer.length > 0;
    case "true-false":
      return typeof answer === "boolean";
    case "number":
      return typeof answer === "string" && parseNumber(answer, question.unit) !== undefined;
    case "ordering":
    case "matching":
      return isIndexList(answer) && answer.every((value) => Number.isInteger(value) && value >= 0);
  }
}

/** The number of questions answered right; questions without an answer count as wrong. */
export function score(questions: readonly Question[], answers: ReadonlyMap<string, Answer>): number {
  return questions.filter((question) => {
    const answer = answers.get(question.id);
    return answer !== undefined && isCorrect(question, answer);
  }).length;
}

/** The right answer, as a learner would give it. */
export function rightAnswer(question: Question): Answer {
  switch (question.type) {
    case "single-choice":
      return question.options.findIndex((option) => option.correct);
    case "multiple-choice":
      return question.options.flatMap((option, index) => (option.correct ? [index] : []));
    case "true-false":
      return question.answer;
    case "number":
      return String(question.answer).replace(".", ",");
    case "ordering":
      return question.items.map((_item, index) => index);
    case "matching":
      return question.pairs.map((_pair, index) => index);
  }
}

/** A complete answer that is wrong, as a learner might give it. */
export function wrongAnswer(question: Question): Answer {
  switch (question.type) {
    case "single-choice":
      return question.options.findIndex((option) => !option.correct);
    case "multiple-choice": {
      const right = question.options.flatMap((option, index) => (option.correct ? [index] : []));
      const wrong = question.options.findIndex((option) => !option.correct);
      return wrong >= 0 ? [...right, wrong].sort((a, b) => a - b) : right.slice(1);
    }
    case "true-false":
      return !question.answer;
    case "number":
      return String(question.answer + question.tolerance + Math.max(1, Math.abs(question.answer))).replace(".", ",");
    case "ordering":
      return question.items.map((_item, index) => question.items.length - 1 - index);
    case "matching":
      return question.pairs.map((_pair, index) => (index + 1) % question.pairs.length);
  }
}

/** A small seeded random generator (mulberry32): the same seed gives the same order everywhere. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number from a text, to derive a seed per question. */
export function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

/** The indices 0..length-1 in an order given by `seed`. */
export function shuffled(length: number, seed: number): number[] {
  const next = random(seed);
  const order = Array.from({ length }, (_value, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j] ?? j, order[i] ?? i];
  }
  return order;
}

/**
 * The order in which the page shows the items of an ordering or the right entries of a matching question: mixed,
 * the same on every build, and never the right order itself.
 */
export function mixed(length: number, id: string): number[] {
  for (let attempt = 0; ; attempt++) {
    const order = shuffled(length, hash(`${id}#${attempt}`));
    if (length < 2 || order.some((value, index) => value !== index)) return order;
  }
}
