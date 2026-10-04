# Ship — package the viz

Executor: main agent.
Input: the latest verification result, already accepted by the user.
Output: `<name>-<version>.tgz` and upload instructions.

Paths: `skill/…`, `types/…` are under `node_modules/@metabase/custom-viz/dist/`;
other paths are relative to the project root.

Read: `skill/references/project.md`.

1. Icon: ask once — the user replaces `public/assets/icon.svg`
   themselves, describes one for you to draw (simple, single-color,
   `currentColor`), or keeps the default.
2. Stop the dev server, then `npm run build`. Build fails → show the
   error verbatim and stop; no auto-recovery.
3. Hand off: the packaged steps from Connecting Metabase, plus any
   warnings the user chose to ship with.
