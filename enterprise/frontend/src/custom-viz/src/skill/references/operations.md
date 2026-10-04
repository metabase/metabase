# Operations

For the main agent only: dev server, Metabase connection, renaming, user
edits.

## Dev server

- `npm run dev` — run in the background; rebuilds `dist/` on save, serves
  it at `http://localhost:5174` (setup landing page at `/`), notifies
  Metabase over SSE at `/__sse`. Rewrites `dist/` continuously.
- `npm run build` — produces `<name>-<version>.tgz` in the project root.
  Dev server must be stopped first.

```bash
lsof -ti :5174 || echo free
curl -sf http://localhost:5174/metabase-plugin.json -o /dev/null && echo up || echo down
lsof -ti :5174 | xargs kill 2>/dev/null || true   # stop
```

**Ensure running:** down → `npm run dev` in the background, wait a few
seconds, re-check. Port busy but down → kill the pid, restart, re-check.
Same failure twice → read the background process output, show the error
verbatim, stop restarting.

## Connecting Metabase

Dev mode:

1. Metabase runs with `MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED=true`.
2. Admin → Custom visualizations → Development → enable the dev server,
   URL `http://localhost:5174`.
3. Open a question matching the data shape, pick the viz in the
   visualization picker.

Packaged: Admin → Custom visualizations → Add a visualization → upload
the `.tgz`, then step 3.

## Renaming

Change together: `"name"` in `metabase-plugin.json`, `"name"` in
`package.json`, and `getName` in `src/index.tsx` when it returns a
display name. Never rename the project directory yourself — it is the
session's working directory; tell the user to rename it after stopping
the dev server. Dev server running → restart it after.

## User edits

Code written by you or your subagents this session is yours; everything
else in `src/index.tsx` is the user's. Never silently revert or rewrite
user code — show the diff and ask.
