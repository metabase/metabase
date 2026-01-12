# Fake Sync for Redshift - Implementation Plan

## Goal
Make `remark-test` pass using fake sync for Redshift (skip network sync calls).

## Tasks

- [ ] **Fix cyclic dependency** - `get_or_create.clj` requires `sql.tx` which creates a cycle
  - Move `session-schema` / `field-base-type->sql-type` calls to use `requiring-resolve`
  - Or extract needed multimethods to a lower-level namespace

- [ ] **Run remark-test** - Verify the cyclic dep is fixed, capture next error

- [ ] **Fix any missing metadata** - Sync normally sets fields we might be missing:
  - `visibility_type`
  - `database_position` vs `position`
  - `active` flag
  - Any driver-specific attributes

- [ ] **Verify FK resolution** - Ensure `resolve-fk-relationships!` works correctly

- [ ] **Test passes** - `remark-test` completes successfully with fake sync

## Critical Files

- `test/metabase/test/data/impl/get_or_create.clj:117-210` - fake sync implementation
- `test/metabase/test/data/sql.clj` - has `session-schema`, `field-base-type->sql-type`
- `test/metabase/test/data/interface.clj:515-534` - `use-fake-sync?` multimethod
- `modules/drivers/redshift/test/metabase/test/data/redshift.clj:318-322` - redshift opt-in

## Current Blocker

**Cyclic load dependency:**
```
metabase.test.data.sql
  → metabase.test.data.impl
  → metabase.test.data.impl.get-or-create
  → metabase.test.data.sql  ← CYCLE
```

The `get_or_create.clj` file requires `sql.tx` for:
- `sql.tx/session-schema` - to get the schema name for tables
- `sql.tx/field-base-type->sql-type` - to map base types to database types
