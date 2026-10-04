# Iterate — live dev server + user feedback

Main agent only — a subagent's background processes die with it.

## Start the dev server

From the project root, in the background:

```bash
npm run dev
```

It rebuilds `dist/` on every save, serves it at **http://localhost:5174**
(a landing page with setup instructions at `/`), and notifies Metabase
over SSE at `/__sse` after each rebuild. Wait a few seconds, then confirm:

```bash
curl -sf http://localhost:5174/ -o /dev/null && echo up || echo down
```

Hand off to the user:

1. Metabase must be running with
   `MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED=true`.
2. Admin → Custom visualizations → Development → enable the dev server
   and set its URL to `http://localhost:5174`.
3. Open a question whose result matches the data shape and pick the viz
   in the visualization picker.

## Edit loop

- One user request — one focused edit to `src/index.tsx`; every save
  rebuilds and hot-reloads.
- After non-trivial edits, run `npm run type-check`.
- If the user quotes a Metabase-side error message, trace it to
  `checkRenderable` or settings defaults before guessing.
- Re-check requested → run the README verification pipeline.

## If the dev server misbehaves

Check the port and the server, then restart:

```bash
lsof -ti :5174 || echo free
curl -sf http://localhost:5174/metabase-plugin.json -o /dev/null && echo up || echo down
```

- Port busy but the server not answering → kill the pid, `npm run dev`
  again, re-check with curl.
- A restart that fails the same way twice → read the background process
  output and surface the error verbatim; do not loop on restarts.

## Done?

User signals done ("ship it", "build it", "looks good") →
`phases/ship.md`. Never run `npm run build` here.
