# data-app-template

A Metabase data app: a single-bundle React app, built with the Embedding SDK,
that Metabase serves at `/apps/<slug>` from the Git repository it syncs. This
directory is `data_apps/<slug>/` in that repository. Build and change it with a
coding agent and the Metabase data-app skills.

## Commands

```bash
npm run dev               # preview at http://localhost:5174, in the sandbox Metabase runs apps in
npm run typecheck         # type-checks src/ and vite.config.ts
npm run write-resources   # has Metabase regenerate the app's collection files under collections/data_apps/
npm run check-resources   # checks the app's collection files against its definitions, then validates the repository's Metabase YAML
npm run build             # builds dist/index.js, the bundle data_app.yaml's path names
```

`npm run dev` and `npm run write-resources` read `DATA_APP_MB_URL` and
`DATA_APP_MB_API_KEY` from the `.env.local` at the repository root;
`.env.local.example` lists them.
