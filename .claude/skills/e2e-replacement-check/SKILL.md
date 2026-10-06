---
name: e2e-replacement-check
description: Check a PR that replaces Cypress e2e tests with unit tests, or find the existing jest specs or deftests for a component or namespace before writing new ones. Works out what only the deleted e2e tests covered, breaks each of those places one at a time, runs the tests against each break, and reports the breaks no test notices as a table for the PR body. Use when a branch deletes or shrinks e2e tests and adds jest specs or deftests in their place.
---

# E2e replacement check

The instructions are in `.claude/skills/e2e-replacement-check/PROMPT.md`. Read it in full first. This skill follows it, with one difference: step 2 runs in a subagent.

If the user is asking you to replace e2e tests rather than check a finished PR, follow "Before writing replacement unit tests" in `PROMPT.md` for each component or namespace before you write a test, and extend the spec or test namespace it lists when there is one.

1. Run `node .claude/skills/e2e-replacement-check/check.mjs scope` from the repository root, with `--base <ref>` if the user names a base. If it reports no deleted or shrunk e2e tests, tell the user and stop.
2. Start one subagent with a prompt that says:
   - which checkout it's in, and the path of the `scope.json` the scope step wrote
   - to read `.claude/skills/e2e-replacement-check/PROMPT.md` and follow "2. Find what only the deleted tests protected" in it exactly, writing the breaks file and `protected.md` to the paths the scope step printed
   - not to run any tests

   Don't pass it this conversation's reasoning about the PR. If this session wrote the PR's tests, its view of what they cover is what's being checked.
3. When the subagent finishes, run `node .claude/skills/e2e-replacement-check/check.mjs run`. Add `--auto` only if the user asks for automatic mutants, and `--backend-limit <n>` only if they ask for more than 2 backend breaks. Don't start a second check while one is running.
4. Follow "4. Report" in `PROMPT.md`.

If a run is interrupted, the next run restores the files first. `node .claude/skills/e2e-replacement-check/check.mjs restore` does the same on its own.
