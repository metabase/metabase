# Fake Sync Ralph Loop - Work Log

## Goal
Make `remark-test` pass using fake sync for Redshift (no network sync calls).

## Acceptance Criteria
- `remark-test` passes with `(tx/use-fake-sync? :redshift)` returning `true`
- Test uses `mt/mbql-query users` which requires fake-synced Tables/Fields

---

## Context Dump (pre-iteration)

### The Problem
Redshift sync takes ~10 minutes per test run due to network RTT to AWS. The insight is that we already know what sync results should be - they're defined in the `dbdef` (DatabaseDefinition). Instead of calling `sync-database!` which queries Redshift's metadata, we can directly insert Table/Field rows from the dbdef.

### Current Implementation Status
The branch `fake-sync-redshift` has the core structure in place:

1. **`test/metabase/test/data/interface.clj`** - Added `use-fake-sync?` multimethod (default: false)

2. **`test/metabase/test/data/impl/get_or_create.clj`** - Added fake sync functions:
   - `insert-fake-table!` - creates Table rows from dbdef
   - `insert-fake-field!` - creates Field rows from dbdef
   - `insert-pk-field!` - creates the auto-generated PK field
   - `resolve-fk-relationships!` - second pass to link FKs
   - `fake-sync-database!` - orchestrates the above

3. **`modules/drivers/redshift/test/metabase/test/data/redshift.clj`** - Opts in with `(defmethod tx/use-fake-sync? :redshift [_] true)`

### Current Blocker: Cyclic Dependency

When trying to load the test, we get:
```
Cyclic load dependency:
[ /metabase/test/data ]
  ->/metabase/test/data/sql
  ->/metabase/test/data/impl/get_or_create
  ->/metabase/test/data/impl
  ->[ /metabase/test/data ]
  ->/metabase/query_processor/test_util
  ->/metabase/actions/test_util
  ->/metabase/test
  ->/metabase/driver/redshift_test
```

**Root cause**: `get_or_create.clj` requires `metabase.test.data.sql` (aliased as `sql.tx`) for:
- `sql.tx/session-schema` - to get the schema name for tables
- `sql.tx/field-base-type->sql-type` - to map base types to database types

But `sql.clj` already requires `metabase.test.data` and `metabase.test.data.impl`, creating the cycle.

### Fix Approach
Use `requiring-resolve` to break the compile-time dependency:

```clojure
;; Instead of:
(sql.tx/session-schema driver)

;; Use:
((requiring-resolve 'metabase.test.data.sql/session-schema) driver)
```

This defers the require to runtime, after all namespaces are loaded.

### Key Files to Modify
- `test/metabase/test/data/impl/get_or_create.clj` - Remove `sql.tx` require, use `requiring-resolve`

### Test Command
```bash
clj-nrepl-eval -p 7888 --timeout 300000 <<'EOF'
(require '[metabase.driver.redshift-test :as rt] :reload-all)
(clojure.test/test-var #'rt/remark-test)
EOF
```

### What Might Fail After Fixing the Cycle
Once the cyclic dependency is fixed, the test might still fail due to:
1. Missing field metadata (e.g., `visibility_type`, `database_position`, `active`)
2. Incorrect type mappings
3. FK resolution issues
4. Schema name handling differences

---

## Iteration 1 - [pending]
### Tried
- (not started yet)
### Observed
-
### Hypothesis
-
### Next
- Fix cyclic dependency using `requiring-resolve` for `sql.tx` functions
