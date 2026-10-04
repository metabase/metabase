# Fix — apply verifier findings

Executor: subagent `custom-viz-fixer`.
Input: this round's findings. Output: edited `src/index.tsx` and a
report.

Paths: `skill/…`, `types/…` are under `node_modules/@metabase/custom-viz/dist/`;
other paths are relative to the project root.

Read: `skill/references/project.md` (Fix log rules apply),
`skill/references/known-mistakes.md`,
`skill/references/sandbox-substitutes.md`, `.claude/fix-log.md`.

Steps:

1. Each `blocker`: read the surrounding code, apply the smallest edit
   that fixes the cause (one finding — one edit), append a `fix` entry.
   Reuse helpers earlier fixes introduced.
2. `warning`s: fix only when obvious and low-risk.
3. `npm run type-check` and verify-tokens; fix fallout, max two
   attempts.

Rules: edit only `src/index.tsx`; never start the dev server.

Return: fixes applied, fixes skipped and why, questions needing a user
decision.
