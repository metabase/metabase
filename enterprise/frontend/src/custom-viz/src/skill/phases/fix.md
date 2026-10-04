# Fix — apply verifier findings

Executor: subagent `custom-viz-fixer`. As a subagent, follow only this
file; ignore AGENTS.md and the orchestrator README.
Input: this round's findings; reads `.claude/build-statement.md`. Output:
edited `src/index.tsx` and a report.

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
3. Run Checks (`project.md`). An error your edit caused, at the code you
   edited → fix it. Anywhere else → report it, do not edit.

Rules:

- Edit only `src/index.tsx` and `.claude/fix-log.md`.
- In `src/index.tsx`, touch only the code a finding names and what its
  fix directly needs.
- No comments that explain a fix or argue the code is correct; the
  verifier reads the code cold.
- Never start the dev server.

Return: fixes applied, fixes skipped and why, logged code you undid and
the bug that may come back, questions needing a user decision.
