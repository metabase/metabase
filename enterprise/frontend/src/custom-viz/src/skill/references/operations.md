# Operations

For the main agent only: dev server, Metabase connection, renaming, user
edits.

## Dev server

The user runs it in their own terminal and keeps it open: `npm run dev`
rebuilds `dist/` on save, serves it at `http://localhost:5174` (setup
landing page at `/`) and notifies Metabase over SSE at `/__sse`. Never
start or stop it yourself.

```bash
curl -sf http://localhost:5174/metabase-plugin.json -o /dev/null && echo up || echo down
lsof -ti :5174   # pid holding the port
```

**Check running:** down → ask the user to run `npm run dev` in a
terminal in the project folder and keep it open. Down while the port is
held → tell the user which process holds it (`lsof`).

`npm run build` produces `<name>-<version>.tgz` in the project root and
needs the dev server stopped (Ctrl+C in its terminal).

## Connecting Metabase

Requirements: Metabase with a Pro or Enterprise token. Dev mode also
needs it started with `MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED=true`,
which only works on a Metabase the user runs themselves (Metabase Cloud
can't load a dev server). No such instance → offer a local one:

```
docker run -d -p 3000:3000 \
  -e MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED=true \
  -e MB_PREMIUM_EMBEDDING_TOKEN=<token> \
  metabase/metabase-enterprise
```

Dev mode:

1. Open `<metabase>/admin/settings/custom-visualizations/development`
   and set the dev server URL to `http://localhost:5174`
   (`http://host.docker.internal:5174` when Metabase runs in Docker).
2. Open a question matching the data shape and pick the viz in the
   visualization picker, under Custom visualizations.

Live check, for the user once the viz shows: hover a mark, then move
off it — the tooltip disappears; click a mark — the drill menu opens;
switch to the dark theme — everything stays readable; put it on a
dashboard and resize the window — it keeps the card's size.

Packaged, on any Metabase with the token, Cloud included: open
`<metabase>/admin/settings/custom-visualizations`, Add a visualization,
upload the `.tgz`, then step 2.

Docs: https://www.metabase.com/docs/latest/developers-guide/custom-visualizations

## Renaming

Change together: `"name"` in `metabase-plugin.json`, `"name"` in
`package.json`, and `getName` in `src/index.tsx` when it returns a
display name. Never rename the project directory yourself — it is the
session's working directory; tell the user to stop the dev server,
rename it, and start the dev server again.

## User edits

Code written by you or your subagents this session, or changed by a
`.claude/fix-log.md` entry and still matching what the entry describes,
is yours; everything else in `src/index.tsx`
is the user's, including code this session has no memory of writing
(new session, after compaction). Never silently revert or rewrite user
code — show the diff and ask.
