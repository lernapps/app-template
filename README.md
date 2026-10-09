# app-templates

The archetypes of lernapps.net apps: one template folder per archetype, and at the root the package
`@lernapps/app-templates` with the runtime of each archetype that apps depend on.

## The templates

The generator of [lernapps/tooling](https://github.com/lernapps/tooling) copies a folder into a new app:

```bash
npx --package github:lernapps/tooling lernapps create --archetype quiz
```

It reads this repo at the commit pinned in `@lernapps/tooling` (`appTemplates` in its `package.json`) and makes the app
depend on the runtime of the same commit, so template and runtime always match. It adds what every app has:
`AGENTS.md`, the plan file, the workflows, LICENSE and an issue form for content errors.

| Folder | Archetype | What the app supplies |
|---|---|---|
| [`quiz/`](quiz/) | a quiz about things to know: questions with options, background knowledge on every option, links for further reading, score and solutions, readable without JavaScript | the question bank `src/quiz.json` |

A template holds only thin files: `vite.config.ts` composes the shared preset of `@lernapps/tooling` with the
archetype's build step, `src/main.ts` starts the runtime, `e2e/` runs the runtime's generic tests on the app's own
content.

## The runtime package

The repo root is the npm package `@lernapps/app-templates`, installed from git at a commit, like `@lernapps/tooling`
(`github:lernapps/app-templates#<commit>`); its `prepare` builds `dist/`. It ships only `dist/` and `runtime/`, not
the template folders. A new feature of an archetype reaches an app with a bump of this dependency.

| Export | What it is |
|---|---|
| `@lernapps/app-templates/quiz` | `startQuiz()`, the engine in the browser: one question at a time in the order of the seed in the address (`?seed=<n>`), deep links `#frage-<id>`; after each answer the background of every option, the right ones and the learner's choice marked, the explanation and further reading; score and solutions at the end. Also the scoring (`isCorrect`, `score`) and the types of the bank |
| `@lernapps/app-templates/quiz/plugin` | `quiz()`, the Vite build step: validates `src/quiz.json` against the schema and renders every question into `index.html` at `<!-- quiz -->` |
| `@lernapps/app-templates/quiz/e2e` | `quizTests()`: the Playwright tests of every quiz, for its own bank |
| `@lernapps/app-templates/quiz/style.css` | the quiz's look |
| `@lernapps/app-templates/quiz/quiz.v1.schema.json` | the JSON Schema of the question bank, also published at <https://lernapps.net/tooling/schemas/quiz.v1.schema.json> |

`@lernapps/tooling` (the shared preset and its helpers: texts, storage, accessibility) and Playwright are peer
dependencies: every app has them.

## Development

```bash
npm ci                                              # the runtime's build tools; builds dist/
npm install --no-save "$(node -p 'require("./quiz/package.json").devDependencies["@lernapps/tooling"]')"
npx vp check && npx vp test run                     # the runtime: format, lint, types, unit tests

cd quiz
npm install       # the template with the runtime of this checkout (file:.., installed as a copy: .npmrc)
npm run dev       # the app at http://localhost:5173/
npx lernapps check
```

After a change to the runtime, reinstall it in the template (`rm -rf node_modules/@lernapps/app-templates && npm
install`). The workflow `check.yml` runs both on every pull request. A change reaches new apps once the pin in
lernapps/tooling moves to its commit on `main`; Renovate (preset `github>lernapps/tooling`) moves existing apps.

## License

[MIT](LICENSE). Apps created from these templates start with MIT as well.
