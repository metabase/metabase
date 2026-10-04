# Fix — apply verifier findings

Executor: subagent `custom-viz-fixer`.
Input: this round's findings; `.claude/build-statement.md`. Output:
edited `src/index.tsx` and a report.

Paths: `skill/…`, `types/…`, `index.d.ts` are under
`node_modules/@metabase/custom-viz/dist/`; other paths are relative to
the project root.

Read: `.claude/build-statement.md`, `skill/references/project.md`,
`skill/references/fix-log-rules.md` (its rules apply), `.claude/fix-log.md`,
`skill/references/known-mistakes.md`, `skill/references/api-contract.md`,
`skill/references/sandbox-substitutes.md`; `types/*.d.ts` as a finding
needs.

Steps:

1. Each `blocker`: read the surrounding code, apply the smallest edit
   that fixes the cause (one finding — one edit), append a `fix` entry.
   Reuse helpers earlier fixes introduced.
2. `warning`s: fix only when obvious and low-risk.
3. `npm run type-check` and verify-tokens; fix fallout, max two
   attempts.

Rules: edit only `src/index.tsx` and `.claude/fix-log.md`; never start
the dev server.

Return: fixes applied, fixes skipped and why, questions needing a user
decision.
