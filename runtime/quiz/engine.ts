// The quiz engine in the browser (@lernapps/app-templates/quiz). The build has rendered every question into the page
// (render.ts); the engine turns that page into a quiz: one question at a time in an order given by the seed in the
// address (?seed=<number>); after each answer, right or wrong, the background of every option with the right ones
// and the learner's choice marked, the explanation and further reading; the score and the solutions at the end. A deep
// link (#frage-<id>) opens its question. Nothing is stored, except the last result on the device when the bank asks
// for it (rememberLastResult), through the storage of @lernapps/tooling. An app's src/main.ts is
//
//   import "@lernapps/app-templates/quiz/style.css";
//   import { startQuiz } from "@lernapps/app-templates/quiz";
//   startQuiz();
import { announce, moveFocus } from "@lernapps/tooling/a11y";
import { translator } from "@lernapps/tooling/i18n";
import { createStorage } from "@lernapps/tooling/storage";
import de from "./messages/de.json" with { type: "json" };
import { hash, isComplete, isCorrect, shuffled, type Answer, type Question } from "./quiz.ts";
import type { QuizData } from "./render.ts";

export * from "./quiz.ts";
export type { QuizData } from "./render.ts";

const t = translator(de);
const SEED = "seed";

interface LastResult {
  score: number;
  total: number;
}

const isLastResult = (value: unknown): value is LastResult =>
  typeof value === "object" &&
  value !== null &&
  "score" in value &&
  "total" in value &&
  typeof value.score === "number" &&
  typeof value.total === "number";

/** The seed in the address; a new one, written into the address, when there is none. */
function seedOf(location: Location): number {
  const url = new URL(location.href);
  const given = Number(url.searchParams.get(SEED));
  if (Number.isInteger(given) && given > 0) return given;
  const seed = 1 + Math.floor(Math.random() * 999_999);
  url.searchParams.set(SEED, String(seed));
  history.replaceState(history.state, "", url);
  return seed;
}

/** The learner's answer as the form holds it; undefined when nothing is given yet. */
function readAnswer(question: Question, form: HTMLFormElement): Answer | undefined {
  const checked = [...form.querySelectorAll<HTMLInputElement>("input:checked")].map((input) => input.value);
  switch (question.type) {
    case "single-choice":
      return checked[0] === undefined ? undefined : Number(checked[0]);
    case "multiple-choice":
      return checked.map(Number);
    case "true-false":
      return checked[0] === undefined ? undefined : checked[0] === "true";
    case "number":
      return form.querySelector<HTMLInputElement>("input")?.value ?? "";
    case "ordering":
    case "matching": {
      const key = question.type === "ordering" ? "item" : "left";
      const answer: number[] = [];
      for (const select of form.querySelectorAll<HTMLSelectElement>(`select[data-${key}]`)) {
        answer[Number(select.dataset[key])] = select.value === "" ? -1 : Number(select.value);
      }
      return answer;
    }
  }
}

/** The indices of the options the learner chose, for the question types with options. */
function chosenOptions(question: Question, answer: Answer): number[] {
  if (question.type !== "single-choice" && question.type !== "multiple-choice") return [];
  return typeof answer === "number" ? [answer] : typeof answer === "object" ? [...answer] : [];
}

/** Starts the quiz on the page the build rendered; does nothing on a page without one. */
export function startQuiz(root: Document = document): void {
  const dataElement = root.getElementById("quiz-data");
  const main = root.getElementById("quiz");
  if (!dataElement || !main) return;
  const { quiz, storage: storageName } = JSON.parse(dataElement.textContent ?? "{}") as QuizData;
  const storage = storageName === undefined ? undefined : createStorage(storageName);
  const seed = seedOf(root.location);
  const order = shuffled(quiz.questions.length, seed).flatMap((index) => quiz.questions[index] ?? []);
  const answers = new Map<string, Answer>();
  const list = main.querySelector<HTMLElement>(".quiz-questions");
  const progress = main.querySelector<HTMLElement>(".quiz-progress");
  const result = main.querySelector<HTMLElement>(".quiz-result");
  const solutions = main.querySelector<HTMLElement>(".quiz-solutions");
  if (!list || !progress || !result || !solutions) return;

  main.classList.add("quiz-running");
  solutions.hidden = true;
  progress.hidden = false;
  const items = new Map<string, HTMLElement>();
  for (const question of order) {
    const item = root.getElementById(`frage-${question.id}`);
    if (!item) continue;
    items.set(question.id, item);
    list.append(item); // in the order of the seed
    // the options of a choice in an order of their own, from the seed and the question
    const fieldset = item.querySelector("fieldset");
    if (fieldset && (question.type === "single-choice" || question.type === "multiple-choice")) {
      const labels = [...fieldset.querySelectorAll(".quiz-option")];
      for (const index of shuffled(labels.length, seed ^ hash(question.id))) {
        const label = labels[index];
        if (label) fieldset.append(label);
      }
    }
    const actions = item.querySelector<HTMLElement>(".quiz-actions");
    if (actions) actions.hidden = false;
  }

  const show = (index: number, focus: boolean) => {
    order.forEach((question, at) => {
      const item = items.get(question.id);
      if (item) item.hidden = at !== index;
    });
    result.hidden = true;
    solutions.hidden = true;
    progress.textContent = t("progress", { current: index + 1, total: order.length });
    const legend = items.get(order[index]?.id ?? "")?.querySelector<HTMLElement>("legend");
    if (focus && legend) moveFocus(legend);
  };

  const finish = () => {
    for (const item of items.values()) item.hidden = true;
    progress.hidden = true;
    const right = order.filter((question) => {
      const answer = answers.get(question.id);
      return answer !== undefined && isCorrect(question, answer);
    }).length;
    const scoreText = main.querySelector(".quiz-score");
    if (scoreText) scoreText.textContent = t("score", { score: right, total: order.length });
    const last = storage?.load("last-result", isLastResult);
    const lastText = main.querySelector<HTMLElement>(".quiz-last");
    if (lastText && last) {
      lastText.textContent = t("last", { score: last.score, total: last.total });
      lastText.hidden = false;
    }
    storage?.save("last-result", { score: right, total: order.length } satisfies LastResult);
    const restart = main.querySelector<HTMLAnchorElement>(".quiz-restart");
    if (restart) restart.href = `?${SEED}=${1 + ((seed * 7919) % 999_999)}`;
    result.hidden = false;
    solutions.hidden = false;
    moveFocus(result);
    announce(scoreText?.textContent ?? "");
  };

  order.forEach((question, index) => {
    const item = items.get(question.id);
    const form = item?.querySelector("form");
    const feedback = item?.querySelector<HTMLElement>(".quiz-feedback");
    const check = item?.querySelector<HTMLButtonElement>(".quiz-check");
    const next = item?.querySelector<HTMLButtonElement>(".quiz-next");
    if (!form || !feedback || !check || !next) return;
    const isLast = index === order.length - 1;
    if (isLast) next.textContent = t("toResult");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (answers.has(question.id)) return;
      const answer = readAnswer(question, form);
      if (!isComplete(question, answer)) {
        feedback.textContent = t("incomplete");
        feedback.className = "quiz-feedback";
        return;
      }
      answers.set(question.id, answer);
      const right = isCorrect(question, answer);
      feedback.className = `quiz-feedback ${right ? "quiz-right" : "quiz-wrong"}`;
      feedback.textContent = t(right ? "right" : "wrong");
      // every option's background, the right ones marked, the learner's choice marked too
      const reveal = item?.querySelector<HTMLElement>(".quiz-reveal");
      for (const index of chosenOptions(question, answer)) {
        const option = reveal?.querySelector<HTMLElement>(`[data-option="${index}"]`);
        if (!option) continue;
        option.classList.add("quiz-info-chosen");
        const badge = root.createElement("span");
        badge.className = "quiz-badge quiz-badge-chosen";
        badge.textContent = t("yourChoice");
        option.querySelector(".quiz-info-head")?.append(" ", badge);
      }
      if (reveal) reveal.hidden = false;
      for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
        control.disabled = true;
      }
      check.hidden = true;
      next.hidden = false;
      moveFocus(next);
    });
    next.addEventListener("click", () => {
      if (isLast) finish();
      else show(index + 1, true);
    });
  });

  const fromAddress = (focus: boolean) => {
    const hashId = decodeURIComponent(root.location.hash.slice(1));
    const index = order.findIndex((question) => `frage-${question.id}` === hashId);
    show(index >= 0 ? index : 0, focus || index >= 0);
  };
  globalThis.addEventListener("hashchange", () => fromAddress(true));
  fromAddress(false);
}
