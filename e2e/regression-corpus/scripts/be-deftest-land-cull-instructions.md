# BE deftest land-and-cull (backend, IMPLEMENTATION)

A prior FE reconstruction found this bug's fix lives in Clojure/ClojureScript (`.clj[c]`),
so its oracle is a **Clojure `deftest`**, not a jest test. Your job: **confirm (or write) a
discriminating deftest** guarding the fixed behavior, and **delete the redundant e2e repro**.
Product code must end **unchanged and correct** — you are NOT leaving the bug reintroduced.

Isolated git worktree. Never touch the main tree; never git reset/checkout broadly; **no `git stash`**.

## Running Clojure tests — IMPORTANT
Use `./bin/test-agent` from the worktree root. NEVER `clj -X:dev:test`.
```
./bin/test-agent :only '[metabase.lib.foo-test/some-test]'      # one deftest
./bin/test-agent :only '[metabase.lib.foo-test]'                # a namespace
```
It prints clean plain text. Runs take ~1–3 min (JVM boot + compile). Pure `metabase.lib.*`
(`.cljc`) tests need no app DB; tests using `mt/dataset`/`mt/with-temp` use the H2 test DB
the harness provides.

## Steps
1. `git show <fix_commit> --stat` and read the diff. Identify the `.clj[c]` product change and
   whether the SAME commit shipped a `deftest`. The FE report (if referenced) already named a
   candidate oracle — start there.
2. **Locate the oracle.** Find the `deftest` that asserts the FIXED behavior at the seam. It
   usually already exists (shipped with the fix). Confirm it's present on HEAD.
3. **Verify it PASSES on clean HEAD**: `./bin/test-agent :only '[ns/test]'` → 0 failures.
4. **Prove it discriminates**: apply a minimal semantic mutation reintroducing the bug to the
   product `.clj[c]` file → run the oracle → it FAILS (assertion failure, not a compile error)
   → **revert the mutation** (product code back to HEAD, `git diff` on product files empty).
   - If the existing deftest does NOT fail under the mutation (vacuous), WRITE a sharper
     `deftest` in the appropriate `test/.../*_test.clj[c]` ns that does discriminate, and use
     that as the oracle. Verify pass-clean/fail-mutant for the new one.
5. **Cull the e2e repro**: delete the block(s) titled `metabase#<issue>` / `describe("issue
   <n>")` in the named spec. If other tests remain, delete only this block + any now-unused
   imports/helpers, keeping the file lint-clean. If it was the only test, `git rm` it.
6. **Final check**: product `.clj[c]` UNCHANGED; the deftest oracle present + passing; the e2e
   repro removed. `git diff` on product code empty.

## If no discriminating deftest is possible
- If the behavior genuinely can't be pinned by a Clojure test (e.g. it's an integration/route
  concern with no unit seam), report `keep_e2e` + why, cull nothing.

## Report (end with)
1. **Outcome** — `landed` (deftest confirmed/written + e2e culled) / `keep_e2e (reason)`.
2. **Oracle** — deftest ns/name; whether pre-existing or newly written; PASS-on-HEAD result.
3. **Discrimination** — the mutation applied + FAIL result (then reverted).
4. **e2e culled** — spec path + block title(s) removed.
5. **git diff --stat** — confirm product `.clj[c]` untouched.
6. **Confidence** — why the deftest faithfully guards the fixed behavior.
