---
name: mutation-testing
description: Run mutation testing on a Clojure namespace, generate tests to kill surviving mutations, and open draft PRs with Linear issue tracking.
---

# Mutation Testing Skill

This skill runs mutation testing on a target namespace, writes tests to kill surviving mutations, and creates draft PRs with Linear issues for each function.

## Prerequisites

- A running nREPL connected to the Metabase dev environment
- `LINEAR_API_KEY` environment variable set with a valid Linear personal API key
- `gh` CLI authenticated with GitHub

## Reference Files

- `dev/src/dev/coverage.clj` — mutation testing tool (generates reports, runs mutations)
- `dev/src/dev/mutation_testing.clj` — Linear API client and PR template helpers
- `mutation-testing-report.lib.card.md` — example report from the pilot

## Invocation

The argument is a Clojure namespace, e.g.:

```
/mutation-testing metabase.lib.order-by
```

## Workflow

### Step 1: Parse the namespace

From the argument (e.g., `metabase.lib.order-by`), derive:
- **Test namespace**: append `-test` (e.g., `metabase.lib.order-by-test`)
- **Short name**: the last segment (e.g., `order-by`)
- **Source path**: `src/metabase/lib/order_by.cljc` (replace `-` with `_` in path segments)
- **Test path**: `test/metabase/lib/order_by_test.cljc`

### Step 2: Set up Linear and load tools

```clojure
(require '[dev.coverage :as cov] :reload)
(require '[dev.mutation-testing :as mut-test] :reload)
```

If this is the first invocation (or the REPL was restarted), set up the Linear team:

```clojure
;; Find the team
(mut-test/list-teams!)
;; Set team ID from the output
(mut-test/set-config! {:team-id "<team-id>"})
```

If config is already set from a previous invocation, skip this.

### Step 3: Generate baseline report and create Linear project

```clojure
(cov/generate-report
  '<target-ns>
  ['<test-ns>]
  "mutation-testing-report.lib.<short-name>.before.md")
```

Read the generated report file. It has three sections:
- **Uncovered Functions** — never called by any test
- **Partially Covered Functions** — called but with surviving mutations
- **Fully Covered Functions** — all mutations killed

Then create a Linear project for this namespace (uses report stats in the description):

```clojure
(mut-test/create-project-for-namespace!
  "<target-ns>"
  "mutation-testing-report.lib.<short-name>.before.md")
;; => {:project-id "...", :name "Mutation Testing: metabase.lib.order-by"}
;; Automatically sets :project-id in config for subsequent create-issue! calls
```

### Step 4: Process each uncovered/partially-covered function

For each function that is uncovered or has surviving mutations:

#### 4a. Create a branch

```clojure
(mut-test/create-branch! "<target-ns>" "<fn-name>")
;; => "mutation-testing/lib.order-by/orderable-columns"
```

#### 4b. Read context

- Read the source function from the source file
- Read the full test file to understand existing test patterns, helpers, and metadata providers used
- If the function is private, identify which public function(s) call it

#### 4c. Write tests

Generate the **simplest tests** that kill the surviving mutations while still making semantic sense. Guidelines:

- **Never call private functions directly.** Always test through public API functions. Use the coverage data to identify which public functions exercise the private function.
- **Keep tests simple.** Each test should verify one meaningful behavior. Don't over-engineer tests just to chase mutation kills.
- **Follow existing patterns.** Match the style of the existing tests: same metadata providers, same helper functions, same assertion patterns.
- **Insert tests near related existing tests** for the same function, not at the end of the file. This minimizes merge conflicts between branches. If there are no existing tests for the function, find the most logical location based on the order of functions in the source file.

#### 4d. Verify mutations are killed

Use the REPL to check that the new tests kill the targeted mutations:

```clojure
;; Reload the test namespace to pick up new tests
(require '<test-ns> :reload)

;; Test mutations for the specific function
(cov/test-mutations
  '<target-ns>/<fn-name>
  ;; Set of test names that cover this function
  #{'<test-ns>/<test-name-1> '<test-ns>/<test-name-2>})
```

Check the `:survived` key in the result. If mutations still survive:
- Try writing additional tests
- If a mutation is truly unkillable (semantically equivalent), note it for the PR description
- If a mutation reveals dead/unreachable code, consider suggesting removal as a code improvement

#### 4e. Handle unkillable mutations and improvements

**Do NOT edit the source namespace just for documentation.** Instead:

- **Unkillable mutations**: Note them in the PR description with rationale
- **Code improvements** (dead code removal, expression simplification) that directly relate to surviving mutants:
  1. Make the change in the source file
  2. Verify all tests still pass with the change
  3. Note the file path, line range, and the improved code
  4. **Reset the change**: `git checkout -- <source-file>` — do NOT commit it
  5. After creating the PR, use `add-suggested-change!` to post the improvement as a GitHub suggested change (Step 4h)
  6. The reviewer decides whether to accept it

#### 4f. Commit and push

```clojure
;; Only commit the test file — never commit source changes for improvements
(mut-test/commit-and-push! "<target-ns>" "<fn-name>"
  ["test/metabase/lib/<short_name>_test.cljc"])
```

#### 4g. Create Linear issue and draft PR

```clojure
;; Create a Linear issue
(def issue (mut-test/create-issue-for-function! "<target-ns>" "<fn-name>"))
;; => {:identifier "QUE-1234", :url "https://linear.app/...", ...}

;; Create draft PR linked to the Linear issue
(def pr-url
  (mut-test/create-draft-pr!
    {:target-ns         "<target-ns>"
     :fn-name           "<fn-name>"
     :linear-identifier (:identifier issue)
     :mutations-before  5       ;; surviving mutations before this PR
     :tests-added       3       ;; number of new test functions
     :killed            ["Replace :asc with :asc__"
                         "Replace = with not="]
     :not-killed        [{:description "Replace nil with 0"
                          :rationale   "Default value is never reached"}]
     :suggested-changes ["Remove dead branch in cond (line 42)"]}))
;; => "https://github.com/metabase/metabase/pull/12345"
```

#### 4h. Add code improvement suggestions (if any)

If you identified code improvements in step 4e (and reset them), post each as a GitHub suggested change:

```clojure
(mut-test/add-suggested-change!
  {:pr-url     pr-url
   :path       "src/metabase/lib/<short_name>.cljc"
   :start-line 42    ;; first line of the code to replace
   :end-line   45    ;; last line of the code to replace
   :suggestion "(improved-code-here)"  ;; the replacement code
   :comment    "**Suggested improvement:** <description of the change and why it's related to the surviving mutant>"})
```

### Step 5: Return to master and repeat

```clojure
(mut-test/return-to-master!)
```

Repeat Step 4 for the next function.

### Step 6: Summary

Print a summary of what was done:
- Link to the Linear project for this namespace
- Number of functions processed
- Number of draft PRs created
- Number of mutations killed vs. unkillable
- List of test PRs with links
- List of mutation rule PRs with links (if any were created)

## Suggesting New Mutation Rules

If you notice patterns in surviving mutations that suggest the mutation testing tool should have additional rules (e.g., a common Clojure form that isn't being mutated), open a separate PR proposing additions to `dev.coverage/mutation-rules` with an explanation.

## Configuration

The `dev.mutation-testing` namespace reads `LINEAR_API_KEY` from the environment and stores team/project IDs in an atom.

- **Team ID**: Set once per REPL session via `(mut-test/list-teams!)` and `(mut-test/set-config! {:team-id "..."})` (Step 2)
- **Project ID**: Set automatically when `create-project-for-namespace!` is called (Step 3) — one project per namespace
