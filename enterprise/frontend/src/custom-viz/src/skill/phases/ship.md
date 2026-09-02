# Ship — final verification and packaging

Enter only when the user signals they are done iterating.

## 1. Mandatory final verification

Always run the full three-level pipeline from the README — code may have
drifted during iteration, including edits the user made in their own
editor. Treat user edits as intent: never silently revert them. If
verification flags one, show the finding and ask — fix it, keep it, or
let the user edit.

Blockers → offer three paths: run the verify ⇄ fix loop (max 3 rounds,
fixer rules apply), go back to iterating, or ship anyway with the
findings listed in the final handoff.

## 2. Icon

The visualization picker shows `public/assets/icon.svg`. Ask once:
replace it themselves, describe it so you draw a simple single-color SVG
(use `currentColor` so it adapts to light/dark themes), or keep the
default.

## 3. Build the archive

Stop the dev server first — it keeps rewriting `dist/`:

```bash
lsof -ti :5174 | xargs kill 2>/dev/null || true
npm run build
```

This produces `<name>-<version>.tgz` in the project root. If the build
fails, surface the error verbatim and stop — no auto-recovery.

## 4. Handoff

Tell the user:

1. Admin → Custom visualizations → Add a visualization → upload the
   `.tgz`.
2. Open a question matching the data shape and pick the viz in the
   picker.

Include any unresolved warnings the user chose to ship with.
