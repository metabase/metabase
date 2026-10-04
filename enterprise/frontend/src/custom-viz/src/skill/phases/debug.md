# Debug — fix reported misbehavior

Executor: main agent (needs the user dialog and the dev server).
Input: the user's symptom. Output: a targeted fix in `src/index.tsx`.

Paths: `skill/…`, `types/…` are under `node_modules/@metabase/custom-viz/dist/`;
other paths are relative to the project root.

Read: `skill/references/project.md` (Fix log rules apply),
`.claude/fix-log.md`, `skill/references/known-mistakes.md`,
`skill/references/sandbox-restrictions.md`,
`skill/references/api-contract.md`.

1. Run `npm run type-check` and verify-tokens; treat errors as fact.
2. Match the symptom against `known-mistakes.md` symptoms; a host
   console message against the messages in `sandbox-restrictions.md`;
   a Metabase error message against `checkRenderable` and setting
   defaults.
3. Read the relevant code and confirm the cause before editing.
4. Apply the smallest edit that fixes the cause; re-run step 1. Append a
   `debug` entry to `.claude/fix-log.md`.
5. Dev server not up (Dev server checks) → `npm run dev` in the
   background. Ask the user to confirm the fix after hot-reload.

Rules:

- Edit only `src/index.tsx`.
- Never silently revert edits the user made — show the diff and ask.
- Same symptom after two fixes → stop, report what was tried and the
  remaining hypotheses.

Return: cause, change made, whether the user confirmed.
