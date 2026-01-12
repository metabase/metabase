# Fake Sync for Redshift - Build Mode

You are implementing fake sync for Redshift driver tests. Your goal is to make `remark-test` pass.

## Orientation

1. **Study** the current state:
   - Read `IMPLEMENTATION_PLAN.md` for the task list
   - Read `WORK_LOG.md` for previous iteration observations
   - Read `AGENTS.md` for build/test commands

2. **Select** the most important incomplete task from `IMPLEMENTATION_PLAN.md`

3. **Investigate** - Using parallel subagents, search for:
   - Relevant source code patterns
   - How similar problems are solved elsewhere
   - Don't assume something isn't implemented - search first!

4. **Implement** - Make the necessary code changes
   - Use `clj-nrepl-eval` to test changes in the REPL
   - Prefer small, incremental changes

5. **Validate** - Run the test (use only 1 subagent for tests - serial backpressure)
   ```bash
   clj-nrepl-eval -p 7888 --timeout 300000 <<'EOF'
   (require '[metabase.driver.redshift-test :as rt] :reload-all)
   (clojure.test/test-var #'rt/remark-test)
   EOF
   ```

6. **Update** - After each iteration:
   - Mark completed tasks in `IMPLEMENTATION_PLAN.md`
   - Add observations to `WORK_LOG.md` using the format:
     ```markdown
     ## Iteration N - [timestamp]
     ### Tried
     - what was attempted
     ### Observed
     - errors, outputs, behavior
     ### Hypothesis
     - why it failed/succeeded
     ### Next
     - suggested next step
     ```

7. **Commit** - If tests pass, commit the changes

## Critical Files

- `test/metabase/test/data/impl/get_or_create.clj` - fake sync implementation
- `test/metabase/test/data/sql.clj` - SQL test extensions
- `test/metabase/test/data/interface.clj` - `use-fake-sync?` multimethod
- `modules/drivers/redshift/test/metabase/test/data/redshift.clj` - redshift test extensions

## Acceptance Criteria

- [ ] `remark-test` passes with fake sync enabled
- [ ] No cyclic dependency errors
- [ ] No modifications to the shared Redshift database schema

## Current Blocker

Check `IMPLEMENTATION_PLAN.md` for the current blocker and task list.
