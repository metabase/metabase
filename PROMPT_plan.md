# Fake Sync for Redshift Tests

## Problem Definition

**Goal**: Speed up Redshift driver tests by eliminating slow network-based sync operations.

**Current Pain**:
- Redshift sync takes ~10 minutes per test run due to network RTT to AWS
- `sync-database!` makes multiple round-trips to introspect schema metadata
- Tests share a single Redshift cluster in CI (can't modify it!)
- Session schemas isolate test runs, but sync still hits the network

**Key Insight**:
We already know what the sync results should be - it's defined in the `dbdef` (DatabaseDefinition). The tables, fields, types, and FK relationships are all specified there. Instead of:
1. Creating tables in Redshift
2. Calling `sync-database!` which queries Redshift's metadata
3. Inserting Table/Field rows into app-db

We can:
1. Create tables in Redshift (still needed for query tests)
2. **Skip sync entirely** - directly insert Table/Field rows from the dbdef

## Current Implementation (PR #67603)

Your branch `fake-sync-redshift` already has the core structure:

### Files Changed:
1. **`test/metabase/test/data/interface.clj`**
   - Added `use-fake-sync?` multimethod (default: false)

2. **`test/metabase/test/data/impl/get_or_create.clj`**
   - Added `fake-sync-database!` function that:
     - `insert-fake-table!` - creates Table rows from dbdef
     - `insert-fake-field!` - creates Field rows from dbdef
     - `insert-pk-field!` - creates the auto-generated PK field
     - `resolve-fk-relationships!` - second pass to link FKs

3. **`modules/drivers/redshift/test/metabase/test/data/redshift.clj`**
   - Implemented `(defmethod tx/use-fake-sync? :redshift [_] true)`

## What's Working

The basic structure is in place:
- Tables get inserted with correct schema, name, display_name
- Fields get inserted with correct types from `sql.tx/field-base-type->sql-type`
- FKs get resolved in a second pass
- PK fields are auto-generated

## What Needs Verification/Fixing

1. **Run the tests** - See what actually fails
2. **Schema handling** - Uses `sql.tx/session-schema` which should work for Redshift
3. **Table naming** - Uses `tx/db-qualified-table-name` for the prefix pattern
4. **Field types** - Maps from `base-type` to `database-type` via driver multimethod
5. **Missing metadata?** - Sync normally sets additional fields we might be missing:
   - `fingerprint`, `last_analyzed` (analysis phase - probably not needed for tests)
   - `visibility_type`
   - `database_position` vs `position`
   - Any driver-specific field attributes?

## Acceptance Criteria

- [ ] `remark-test` passes with fake sync enabled (uses `mt/mbql-query users`)
- [ ] No modifications to the shared Redshift database (read-only for metadata)
- [ ] Test setup time significantly reduced (skip network sync calls)

## Target Test: `remark-test`

**Location**: `modules/drivers/redshift/test/metabase/driver/redshift_test.clj:66-104`

**Why this test**:
- Uses `(mt/mbql-query users {:limit 2000})` which loads the `test-data` dataset
- Dataset loading goes through `sync-newly-created-database!` → `fake-sync-database!`
- If Tables/Fields are inserted correctly, the query will work
- Tests the full flow: dbdef → fake sync → query execution

**What it validates**:
- Tables exist in app-db with correct schema/names
- Fields exist with correct names/types
- FKs are resolvable (uses `(mt/id :users :id)`)
- Queries can be generated and executed

## Workflow

1. **Checkout the branch**: `git checkout fake-sync-redshift`
2. **Run the test with REPL**:
   ```clojure
   (require '[metabase.driver.redshift-test :as redshift-test])
   (clojure.test/run-tests 'metabase.driver.redshift-test)
   ;; Or just remark-test:
   (clojure.test/test-var #'redshift-test/remark-test)
   ```
3. **Debug failures** - likely missing/incorrect metadata
4. **Fix fake-sync implementation** as needed
5. **Verify the test passes**

---

## Critical Files

- `test/metabase/test/data/impl/get_or_create.clj:117-210` - fake sync implementation
- `test/metabase/test/data/interface.clj:515-534` - `use-fake-sync?` multimethod
- `modules/drivers/redshift/test/metabase/test/data/redshift.clj:318-322` - redshift opt-in
- `src/metabase/sync/sync_metadata/tables.clj` - reference for what sync normally writes
- `src/metabase/sync/sync_metadata/fields.clj` - reference for field metadata


