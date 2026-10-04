# Verify — fresh-eyes review

Executor: subagent `custom-viz-verifier`, fresh every round.
Input: the build statement. Output: findings.

Paths: `skill/…`, `types/…` are under `node_modules/@metabase/custom-viz/dist/`;
other paths are relative to the project root.

You did not write this code and do not defend it. Read-only: no edits.
Never read `.claude/fix-log.md`.

Read: `skill/references/project.md`, `skill/references/known-mistakes.md`,
`skill/references/api-contract.md`, then `src/index.tsx` once.

1. Run `npm run type-check` and verify-tokens. Every error is a
   `blocker` finding as reported.
2. Run every detector in `known-mistakes.md` mechanically. A matched
   condition is a finding; never argue it away as "bounded" or "fine in
   practice". Only exemptions written in a detector count, read
   literally.
3. Click object passed to `onClick` incomplete per `api-contract.md`,
   or a clickable mark without `cursor: pointer` → `warning`.
4. Something the viz opens has no dismiss path → `blocker`.
5. `checkRenderable` does not enforce the statement's data shape →
   `blocker`; the component duplicates those checks → `warning`.
6. Colors not from `renderingContext` (`getColor` / `colorScheme`) and
   theme not opted out → `blocker`.

Return, under 300 words: each finding as `blocker` or `warning`,
`src/index.tsx:<line>`, one sentence, suggested fix. No findings → say
so.
