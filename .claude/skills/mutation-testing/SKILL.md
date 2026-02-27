---
name: mutation-testing
description: Run mutation testing on a Clojure namespace, generate tests to kill surviving mutations, and open draft PRs with Linear issue tracking.
---

# Mutation Testing Skill

This skill runs mutation testing end-to-end: generates a coverage report, groups functions, shells out to `claude -p` to write tests, verifies mutations are killed, and creates draft PRs with Linear issues.

## Prerequisites

- A running nREPL connected to the Metabase dev environment
- `LINEAR_API_KEY` environment variable set with a valid Linear personal API key
- `gh` CLI authenticated with GitHub
- `claude` CLI available on PATH

## Reference Files

- `dev/src/dev/coverage.clj` — mutation testing engine (generates reports, runs mutations)
- `dev/src/dev/mutation_testing.clj` — orchestration, Linear API, PR helpers

## Invocation

The argument is a Clojure namespace, optionally followed by a base branch:

```
/mutation-testing metabase.lib.order-by
/mutation-testing metabase.lib.order-by --base-branch release-x.52.x
/mutation-testing metabase.lib.order-by --project-id abc-123
/mutation-testing metabase.lib.order-by --base-branch release-x.52.x --project-id abc-123
```

- `--base-branch`: defaults to the value in config (set via `set-config!`), or `"master"` if not configured.
- `--project-id`: if provided, issues are added to this existing Linear project instead of creating a new one.

## Steps

### 1. Parse arguments

Parse `$ARGUMENTS` to extract:
- **namespace** (required) — the first positional argument
- **`--base-branch`** (optional) — if present, the next argument is the base branch name
- **`--project-id`** (optional) — if present, the next argument is an existing Linear project ID

### 2. Load and configure

```clojure
(require '[dev.mutation-testing :as mut-test] :reload)
(require '[dev.coverage :as cov] :reload)
```

If this is the first invocation (or the REPL was restarted), set up the Linear team:

```clojure
(mut-test/list-teams!)
(mut-test/set-config! {:team-id "<id>"})
```

### 3. Run

```clojure
(mut-test/run! '<target-ns>)
;; Or with options:
(mut-test/run! '<target-ns> {:base-branch "release-x.52.x"})
(mut-test/run! '<target-ns> {:project-id "abc-123"})
(mut-test/run! '<target-ns> {:base-branch "release-x.52.x" :project-id "abc-123"})
```

Pass the opts map with `:base-branch` and/or `:project-id` if those flags were provided in the arguments.

This will:
1. Generate a baseline mutation testing report
2. Create a Linear project for the namespace
3. Group functions by coverage relationships
4. For each group: create branch → invoke Claude to write tests → verify → retry if needed → commit & push → create Linear issue → create draft PR
5. Print a summary with PR links

### 4. Handle failures

If a group fails mid-processing, `run!` catches the error and continues to the next group. To retry a single group manually:

```clojure
;; Get the parsed namespace info
(def parsed (mut-test/parse-namespace '<target-ns>))

;; Run coverage to get the data
(def coverage-results (cov/test-namespace (:target-ns parsed) [(:test-ns parsed)]))

;; Group and find the one you want
(def groups (mut-test/group-functions coverage-results))

;; Process just that group
(mut-test/process-group! parsed (nth groups <index>))
```

### 5. Verify the prompt (dry run)

To inspect what Claude will see without invoking it:

```clojure
(def parsed (mut-test/parse-namespace '<target-ns>))
(def coverage-results (cov/test-namespace (:target-ns parsed) [(:test-ns parsed)]))
(def groups (mut-test/group-functions coverage-results))
(println (mut-test/build-test-prompt
           (merge (select-keys parsed [:target-ns :test-ns :source-path :test-path])
                  (select-keys (first groups) [:fn-names :mutations]))))
```

## Configuration

- **Team ID**: Set once per REPL session via `(mut-test/list-teams!)` and `(mut-test/set-config! {:team-id "..."})`
- **Project ID**: Set automatically when `run!` calls `create-project-for-namespace!`
- **Base Branch**: Defaults to `"master"`. Override via `(mut-test/set-config! {:base-branch "release-x.52.x"})` or pass `{:base-branch "..."}` as the second arg to `run!`
- **Project ID**: If set (via `set-config!` or `run!` opts), `run!` reuses the existing Linear project instead of creating a new one
