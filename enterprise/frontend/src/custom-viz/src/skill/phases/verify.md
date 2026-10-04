# Verify — fresh-eyes review

Executor: subagent `custom-viz-verifier`. As a subagent, follow only this
file; ignore AGENTS.md and the orchestrator README.
Input: none; reads `.claude/build-statement.md`. Output: findings.

You did not write this code and do not defend it. Read-only: no edits;
Bash runs only the Checks commands. Never read `.claude/fix-log.md` or
`.claude/accepted-findings.md`.

Read: `.claude/build-statement.md`, `skill/references/project.md`,
`skill/references/known-mistakes.md`, `skill/references/api-contract.md`,
`skill/references/sandbox-restrictions.md`,
`skill/references/sandbox-substitutes.md` (for suggested fixes), then
`src/index.tsx` once.

1. Run Checks (`project.md`) once, no fix attempts. Every error is a
   `blocker` finding as reported.
2. Run every detector in `known-mistakes.md` mechanically. A matched
   condition is a finding; never argue it away as "bounded" or "fine in
   practice". Only exemptions written in a detector count, read
   literally. Parts marked "Needs judgment" are the exception: decide
   them on the merits of the code.
3. Needs judgment: code verify-tokens cannot see (`any`-typed values,
   computed property names) that reaches a restriction in
   `sandbox-restrictions.md` → `blocker`.

Return, under 300 words: each finding as `blocker` or `warning`,
`src/index.tsx:<line>`, one sentence, suggested fix. No findings → say
so.
