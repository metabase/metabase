# Metabot papercuts

Metabase reviews each finished Metabot turn and posts the papercuts it finds straight to the papercuts server one directory up, through `/api/reports`. That code, the `metabot-demo-break-search` switch and the tool-event changes are uncommitted in the demo checkout and land on this branch after the demo.

- `fixer.ts` has headless Claude Code fix new Metabot papercuts in a throwaway worktree, and opens a draft PR when someone comments `/pr` on the papercut. Without `--push` that step is a dry run.
- `demo/break.sh <throw|swallow|empty|off>` breaks the search tool, `demo/chat.sh "<question>"` asks Metabot a question, and `bin/nrepl-eval` evaluates Clojure in the running dev server.

`make up` starts the server on :8766 and the fixer in tmux, and `make reset` removes the Metabot papercuts from the server's database after a backup. Settings go in `.env` in this directory: `MB_API_KEY` for the local Metabase, `PAPERCUTS_SERVER` and `PAPERCUTS_TOKEN` for the server. `METABASE_REPO` defaults to `~/src/mb/metabase`, and `fixer.ts` runs the Claude desktop app's CLI unless `CLAUDE_BIN` is set.
