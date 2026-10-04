# Ship — package the viz

Executor: main agent.
Input: the latest verification result, already accepted by the user,
and the findings the user chose to keep.
Output: `<name>-<version>.tgz` and upload instructions.

Read: `skill/references/operations.md`, `skill/references/project.md`.

1. Icon: ask once — the user replaces `public/assets/icon.svg`
   themselves, describes one for you to draw (per `project.md`, Files),
   or keeps the default.
2. Stop the dev server, then `npm run build`. Build fails → show the
   error verbatim and stop; no auto-recovery.
3. Hand off: the packaged steps from Connecting Metabase, plus the
   findings the user chose to ship with.
