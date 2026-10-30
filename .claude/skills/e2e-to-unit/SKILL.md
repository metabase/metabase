---
name: e2e-to-unit
description: Use when reducing Cypress coverage, auditing an E2E spec or folder for tests that can move to Jest, converting Cypress tests to Jest, splitting an E2E test into Jest and backend tests, or deleting an E2E test that other tests already cover.
---

# E2E to Unit

Move each Cypress `it()` to the cheapest test layer that keeps its real source of confidence. Judge each `it()`, and each claim inside it, on its own.

Verdicts: `convert` (new Jest test), `split` (Jest test plus backend test), `delete as already covered`, `keep E2E`.

## Investigate a test

1. Read the test, its hooks, and every helper it calls. Browser-only steps often hide in helpers.
2. List the actions and assertions. These also count as assertions:
   - an intercept that narrows the request (query, body, headers, or a non-default method)
   - a request body read through `cy.wait`
   - a response check (`response.statusCode`, `response.body`). Jest mocks the response, so this needs a backend test.

   An intercept that only spies or delays is setup.
3. One `it()` can hold several claims (for example two issue numbers). Give each claim its own verdict and proof.
4. Apply the hard gates (below).
5. Trace each assertion to the production code that causes it.
6. Search existing Jest and backend tests by issue number, symbol, assertion text, and literal values. Finish this before you write a test. Another E2E test counts as cover only if it stays, runs the same path on the real backend, and asserts the same thing.
7. Find the nearest Jest spec for the behavior owner and extend it. If none exists, create `<Owner>.unit.spec.ts(x)` with a `setup()` that takes `SetupOpts`.

## Hard gates

Keep the claim in Cypress if it depends on:

- ECharts, canvas, SVG geometry, chart coordinates, or tooltips
- real hover, focus, keyboard, drag, resize, scroll, or layout measurement
- viewport or responsive behavior
- computed CSS (jsdom does not apply CSS modules)
- browser history, the URL or route as the claim, clipboard, downloads, or printing. A click that only reaches a screen is setup.
- state carried from one screen to another
- a value that the backend defines and the frontend only reads (driver form fields, engine keys, setting keys). This is a backend gate.
- a real backend query, permission boundary, or save cycle. If a backend test can own it, the verdict is `split`.

Do not override a gate because a test is slow, flaky, or easy to mock.

## Nothing may be lost

List every real check of the E2E test, as its claim or on the side:

- a real save or request
- a real server response
- the URL or route
- a Snowplow event checked against its schema
- a real token or license activation
- the OSS build, when the test has the `@OSS` tag (Jest then needs a case with no enterprise plugin)

After the change, each one must still be checked by the new Jest test at the same boundary, by an existing Jest or backend test that you name, or by an E2E test that stays, which you name. If nothing covers a check, the `it()` stays. Mock data that only sets up the claim is not lost.

An E2E test that you name as cover is protected. Add it to `target/e2e-to-unit/covers.md`. Read that file before you move or delete any E2E test. Never move a protected test.

## Convert one test

0. **Save the start state.** `git status --short`, `git diff HEAD`, the type-check output, and the `Tests:` line of the Jest spec you will extend. Later checks must show nothing new. Copy each Jest spec or helper before its first edit to `target/e2e-to-unit/`.

1. **Write the Jest test** in the owner's spec. Reuse its `setup()` and its real store. Add new `setup()` options in the form it already has, with the old default.
   - **Title:** use the exact Cypress `it()` title. A Cypress `forEach` becomes `it.each` with `%s`. If the test goes to several specs, each one gets the same title. Two tests in one spec keep the title and add the part in parentheses, for example `"correctly displays models empty states (dismiss the banner)"`. Only a new positive control gets its own title.
   - **Structure:** keep the steps in the same order. If the Cypress test calls named flow helpers, write one Jest helper for each, with a close name. Lint requires a helper with assertions to start with `assert` or `expect`.
   - **Boundary:** assert what Cypress asserted, at the same boundary. If Cypress read a request body, read the body that the app sent from `fetchMock.callHistory`, not a callback argument. Parse JSON as `unknown`.
   - **Arguments:** call the code with the arguments that its production caller passes.
   - **Data:** use real API shapes (`details: null`, not `undefined`). Give mock entities distinct ids, and use distinct input values.
   - **Server mocks:** use helpers from `__support__/server-mocks`. If none fits, add one there. To hold a response back, let the helper accept a function that returns a promise.
   - **Pending state:** hold the response with `defer()` from `metabase/utils/promise`. Wait until the request was sent, read the element, resolve the request, then assert. Resolve every deferred before a claim assertion, so a mutant fails on an assertion, not on a timeout.
   - **Negative assertion:** add a positive control in the same setup that expects the opposite. Do not call `setup()` twice in one test.
   - **Enterprise:** if the code path is behind a `PLUGIN_*` hook or `enterprise/frontend`, set `token-features` with `createMockTokenFeatures` and call `setupEnterpriseOnlyPlugin("<plugin>")` before render. Without the plugin, a negative assertion can pass for the wrong reason.
   - **Components:** follow `frontend/CLAUDE.md`. Use `userEvent`, role and text queries, and `findBy*` or `waitFor`. Do not flush `fetchMock`.
   - Follow `typescript-write`: no casts, no `any`.
   - If the Cypress test checked a value that never appears in Jest, the claim is a browser gate (`keep E2E`), unless the Cypress assertion was negative or loose.

2. **Run only the new test:** `bun run test-unit-keep-cljs --runInBand --runTestsByPath <spec> -t "<pattern>"`. The `Tests:` line must show only your test (and its control) ran. Also run `bunx oxfmt --write <spec>`, `bun run lint-oxlint -- <spec>`, and the type check now.

3. **Prove the test can fail.** Make at least 2 mutants in production code: a wrong value (a wrong key, operand, or `&&` for `||`) and a removed check or statement.
   - Make each mutation and each undo with the Edit tool, one exact string. Include one unchanged neighbor line.
   - Each mutant must fail on the claim's assertion, not in setup and not on a timeout.
   - After the undo, `git diff <file>` must match the diff saved before the mutation. Never use `git checkout <file>` or `git restore`.
   - If a mutant survives, find out why. An equivalent mutant gets a replacement. Otherwise fix the test.
   - For `.cljs` or `.cljc` code, run `bun run build-pure:cljs` after each mutation and each undo.
   - If you change the test after the mutants, run them again.

4. **Delete the Cypress test.** Save the original block first in `target/e2e-to-unit/row-<k>-cypress-original.txt`. Never weaken an assertion of a claim that stays. If another claim of the `it()` stays, remove only the moved claim's steps, and keep any earlier `should` or `cy.wait` that a kept assertion may need. Delete an empty `describe` and an empty spec. Delete a helper or import only when no caller is left anywhere in `e2e/`. Leave `e2e/support/timings.json`.

5. **Final checks**, after every mutant is undone:
   - `bunx oxfmt --write` and `bun run lint-oxlint --` on the changed files (not deleted ones)
   - the whole Jest spec, and every spec that imports a helper whose behavior you changed
   - the type check, compared with step 0
   - `typescript-review` on the diff
   - a Cypress run (see "Run a Cypress spec") if you changed a hook, a shared helper, or a test that stays. Deleting whole blocks needs only lint.
   - `git status` and `git diff HEAD`: no production file changed, no mutant left

6. **Report** the Jest test, each mutant and its result, and for each real check the test that still covers it. Do not commit or push unless the user asked.

## Delete a test that is already covered

1. Name the existing test that covers each part of the claim. A request check needs a covering test that reads the same request at the same boundary. Otherwise the row is `convert`.
2. Run that test, then prove it with mutants as in step 3 above, without editing it. If a mutant survives, the row becomes `convert` (or `split` for a backend test).
3. If the cover is another E2E test, quote its assertion and run it.
4. Do steps 4 to 6 of "Convert one test".

## Split a test

1. Write the Jest part for the frontend decision (steps 0 to 3 above). If the frontend only renders a server value, there is no Jest part.
2. Load `clojure-write`. Reuse an existing backend test if it makes the server claim, and prove it with backend mutants. Otherwise write one in the nearest backend test namespace, with a positive control. Run it with `clojure-eval` when one nREPL for this checkout exists, and reload the namespaces after each mutation and undo. Otherwise, and always in a worktree, use `./bin/test-agent :only '[<ns>/<test>]'`.
3. Keep the Cypress `it()` only for a seam with no other test, or for a claim with a browser gate. Then run it.
4. Do steps 5 and 6 of "Convert one test". Format and lint the Clojure file with `./bin/mage cljfmt-files` and `./bin/mage kondo`. Never commit.

## Report an audit

- **One spec:** a table with the `it()` title, behavior owner, browser and backend dependency, existing cover, verdict, destination, and confidence lost. Recommend a first candidate.
- **A folder:** every spec appears in one of two lists:
  1. Files with tests to move: the spec, then each test as `:<line> <short title>`, grouped by verdict. For Jest-only work, list only `convert` rows.
  2. Files with nothing to move, with the reason in a few words.

  Then totals by verdict. Put full rows in a file and give its path.

Triage search for each spec: `grep -nE 'realHover|realPress|echartsContainer|cartesianChartCircle|moveDnDKitElement|cy\.location|cy\.url|cy\.go\(|cy\.viewport|have\.css|getBoundingClientRect|updatePermissionsGraph|blockUserGroupPermissions|downloadAndAssert|clipboard|signInAs(NormalUser|ImpersonatedUser|SandboxedUser)|signIn\("|activateToken|expect.*SnowplowEvent' <spec>`. A hit is only a hint. Reject a test only when the hit is in its body, hook, or helper, and the gate is part of the claim. A permission hit points to `split`.

## Convert a whole folder

One spec gets one worktree, one branch, and one PR.

1. **Set up.** List the specs with their `it()` counts. Leave out specs that an open PR already converts. Make a worktree at the base commit, and save the type check there as `target/e2e-to-unit/typecheck-baseline.txt`.
2. **Phase A: audit in parallel, read only.** Run the triage search. A spec where every test hits a backend-only gate (real login, SSO, email, git sync, a real external database, Snowplow) gets no agent and one line in the report. For each other spec, start a read-only audit agent, up to 8 at a time. Each returns a verdict for every `it()`, and for each `convert` row the files it will edit and the E2E tests it names as cover.
3. **Settle covers.** Merge all named covers into `covers.md`. A `convert` row that is a cover for another row stays in Cypress.
4. **Plan branches.** Name each branch `e2e-to-jest-<folder>-<spec name>`, for example `e2e-to-jest-admin-databases`. Two specs that edit the same Jest spec, helper, or server-mock file go in a stack: the second branch starts from the first branch after the first is done.
5. **Phase B: convert in parallel.** One worktree for each spec, up to 4 workers at a time. A stacked spec waits for the one below it. Each worker follows "Convert one test" for its rows only, with the phase A audit. It does not audit again. It uses the shared type-check baseline, and it touches no other Cypress spec.
6. **Check and commit.** In each worktree, run the changed Jest specs as whole files, and check that each named cover exists. Read each worker report critically: verify the covers it names. Commit one spec per branch only if the user asked for commits. Otherwise give the commands.
7. **Finish.**
   - Report a table: branch, tests moved, commit, and why the other tests stay.
   - For each branch, write the title to `pr-<branch>.title`, in the form `test: rework <spec name> e2e spec to jest` (no `.cy.spec.*`), and the body to `pr-<branch>.md` in the scratchpad.
   - Write one script, `open-<folder>-prs.sh`, in the scratchpad. It starts with `set -euo pipefail`. For each branch it runs `git push -u origin <branch>` and `gh pr create --head <branch> --base <base> --title "$(cat <title file>)" --body-file <body file>`. It opens a stacked PR after the PR below it, gets that PR's number with `gh pr view <base branch> --json number --jq .number`, and writes "This PR is stacked on #<number>" into a copy of the body. It prints `done` at the end.
   - Check the script with `bash -n`. Do not run it. Give the user the command with the absolute path.
   - Say that the edited Cypress specs did not run, and list them for CI.

## PR body

Sections, in this order:

1. **What moved:** each Cypress test and the Jest test that replaces it.
2. **Proof that the new tests catch the bug:** one sentence on what a mutant is, then a table with one row per mutant: Jest test | file and the code broken on purpose | check that failed.
3. **Does this PR lose any check?** Answer "No." first. Then list the mocked data, grouped by page or component: each endpoint and what it returns, and each mock setting or token feature. If the Cypress test already faked the same responses, say so. Then say what Jest cannot check, and for each real-server check, say what the kept test does and where the page reads the value (file name). Do not write a bare list of covers, because a reader takes it as a list of losses.
4. **Changes to the Cypress spec:** what was removed, that no hook, helper, or kept test changed, whether Cypress ran locally, and that CI runs the tests that stay.

Name each test or file as a permalink at the branch's pushed commit: `https://github.com/metabase/metabase/blob/<sha>/<path>#L<n>`, not a bare `:<line>`.

## Run a Cypress spec

- Use the `e2e-test` skill. A spec with `H.activateToken` needs `MB_EDITION=ee`.
- Reuse a backend on port 4000 only if it runs from this checkout, with the right edition. Do not kill a backend you did not start.
- If a kept test fails, fix only its setup inside the spec. Never remove a check. If it still fails, find out whether it failed before your change. If your change broke it, undo that row's Cypress edits and mark the row `skipped`.
- If a run is not possible (no tokens, no frontend build, a backend from another checkout, no Docker), undo the Cypress edit that needs the run and mark the row `skipped: Cypress run not possible (<reason>)`.

## Work in a worktree

- Link `node_modules` from the main checkout. Run `bun run build-pure:cljs` once before the first Jest run. Do not run `bun install` or `build:cljs`.
- Run the type check with its own build-info file: `./node_modules/typescript7/bin/tsc --noEmit --tsBuildInfoFile target/e2e-to-unit/tsbuildinfo`.
- Cypress cannot run in a worktree, because it has no frontend build.
- Run backend tests with `./bin/test-agent`.
- If the skill is not committed, read it from the main checkout path.

## Shell notes

- Keep work files in `target/e2e-to-unit/` (git ignores `target/`).
- In zsh, write paths literally and quote globs. A variable with several paths does not split into words.
- If a sandbox refuses a long command, write a script file and run it.
- A mutant can break lint or the type check. That is fine, because only Jest runs on a mutant.

## Examples

Read the example that matches your behavior owner before you write the test:

- [references/dashboard-example.md](references/dashboard-example.md): a thunk test that reads request bodies, and tests that stay in Cypress.
- [references/component-example.md](references/component-example.md): a component test of a pending state, with `defer()`.
- [references/split-example.md](references/split-example.md): a permission claim split into a backend test and a component test.
