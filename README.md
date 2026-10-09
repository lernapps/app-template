# app-templates

The templates of the archetypes of lernapps.net apps, one folder per archetype. The generator of
[lernapps/tooling](https://github.com/lernapps/tooling) copies a folder into a new app:

```bash
npx --package github:lernapps/tooling lernapps create --archetype quiz
```

It reads this repo at the commit pinned in `@lernapps/tooling` (`appTemplates` in its `package.json`), so templates
and presets change together, and adds what every app has: `AGENTS.md`, the plan file, the workflows, LICENSE and an
issue form for content errors. The logic stays in the package; a template holds only the thin files that refer to
the archetype's preset and the app's own content.

| Folder | Archetype | What the app supplies |
|---|---|---|
| [`quiz/`](quiz/) | a quiz: questions with options, feedback, score and solutions, readable without JavaScript | the question bank `src/quiz.json` ([schema](https://lernapps.net/tooling/schemas/quiz.v1.schema.json)) |

Each folder is a working app that passes `lernapps check` (workflow `check.yml`), and can be tried on its own:

```bash
cd quiz
npm ci
npm run dev        # the app at http://localhost:5173/
npx lernapps check # what the git hooks and CI run
```

A change to a template reaches new apps once the pin in lernapps/tooling moves to its commit on `main`. Renovate
(preset `github>lernapps/tooling`) keeps `@lernapps/tooling` in the templates current.

The architecture of the tooling, including the archetypes and the generator, is at
<https://lernapps.net/tooling/architecture/>; the rules for apps at <https://lernapps.net/tooling/rules/>.

## License

[MIT](LICENSE). Apps created from these templates start with MIT as well.
