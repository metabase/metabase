# Test — write the viz's tests from the statement

Executor: subagent `custom-viz-tester`. As a subagent, follow only this
file; ignore AGENTS.md and the orchestrator README.
Input: none; reads `.claude/build-statement.md`. Output:
`src/index.test.tsx` and a report.

Read: `.claude/build-statement.md`, `skill/references/testing.md`,
`skill/references/api-contract.md`.

Never read `src/index.tsx`: the tests check the statement, not the code.

1. Write `src/index.test.tsx` as `testing.md` says.
2. Run `npm test`.
3. A failure caused by the test itself (import, mock usage, a wrong
   expectation about the statement) → fix the test, run again. A
   failure where the viz breaks the statement → keep the test.

Rules:

- Edit only `src/index.test.tsx`.
- Never start the dev server.
- Run once and return: never wait for `src/index.tsx` to change; the
  orchestrator fixes the viz and re-runs the tests.

Return: what the tests cover, every failing test with its message, and
statement parts too vague to test.
