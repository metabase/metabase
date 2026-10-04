# Debug — fix reported misbehavior

Executor: main agent (needs the user dialog and the dev server).
Input: the user's symptom. Output: a targeted fix in `src/index.tsx`.

Read: `.claude/build-statement.md`, `skill/references/project.md`,
`skill/references/operations.md`, `skill/references/fix-log-rules.md` (its
rules apply), `.claude/fix-log.md`, `skill/references/known-mistakes.md`,
`skill/references/sandbox-restrictions.md`.

Read on demand: `skill/references/api-contract.md` when the cause
involves host props or `checkRenderable`;
`skill/references/sandbox-substitutes.md` when the fix replaces a
blocked API.

1. Run Checks (`project.md`) once; treat errors as fact.
2. Match the symptom against `known-mistakes.md` symptoms; a host
   console message against the messages in `sandbox-restrictions.md`;
   a Metabase error message against `checkRenderable` and setting
   defaults.
3. Read the relevant code and confirm the cause before editing.
4. Apply the smallest edit that fixes the cause; run Checks. Append a
   `debug` entry to `.claude/fix-log.md`.
5. Fix alters the data shape, settings or opt-outs → update
   `.claude/build-statement.md`.
6. Dev server: Ensure running. Ask the user to confirm the fix after
   hot-reload.

Rules:

- Edit only `src/index.tsx`, `.claude/fix-log.md`,
  `.claude/build-statement.md`.
- User edits rules apply.
- Same symptom after two fixes → stop, report what was tried and the
  remaining hypotheses.

Return: cause, change made, whether the user confirmed.
