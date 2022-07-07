---
title: Driver interface changelog
---

# Driver Interface Changelog

## Metabase 0.43.0

- The `:expressions` map in an MBQL query now uses strings as keys rather than keywords (see
  [#14647](https://github.com/metabase/metabase/issues/14647)). You only need to be concerned with this if you are
  accessing or manipulating this map directly. Drivers deriving from `:sql` implementing `->honeysql` for `[<driver>
  :expression]` may need to be updated. A utility function, `metabase.mbql.util/expression-with-name`, has been
  available since at least Metabase 0.35.0 and handles both types of keys. It is highly recommended that you use this
  function rather than accessing `:expressions` directly, as doing so can make your driver compatible with both 0.42.0
  and with 0.43.0 and newer.

- There is now a `describe-nested-field-columns` method under `sql-jdbc.sync` namespace which returns an instance of
  NestedFCMetadata. This is in order to allow JSON columns in Postgres and eventually other DB's which are usually
  ordinary RDBMS's but then sometimes they have a denormalized column with JSON or some other semantics. Given a table
  with denormalized columns which have nested field semantics (so, typed sub-fields which are still denormalized but
  stable in type between rows), return value should be a NestedFCMetadata, a map of flattened key paths to the
  detected sub-field. Field detection in syncing will then be enriched with those nested types. This is materially
  different from the way we do it for mongo because every kind of JSON column is different, but it's going to run
  every sync so it can't be too slow, even on enormous tables and enormous denormalized columns on those enormous tables.

## Metabase 0.42.0

Changes in Metabase 0.42.0 affect drivers that derive from `:sql` (including `:sql-jdbc`).
Non-SQL drivers likely will require no changes.

0.42.0 introduces several significant changes to the way the SQL query processor compiles and determines aliases for
MBQL `:field` clauses. For more background, see pull request
[#19384](https://github.com/metabase/metabase/pull/19384).

If you were manipulating Field or Table aliases, we consolidated a lot of overlapping vars and methods, which means you may need to delete deprecated method implementations.

### Significant changes

- The `metabase.driver.sql.query-processor/->honeysql` method for Field instances, e.g.

  ```clj
  (defmethod sql.qp/->honeysql [:my-driver (class Field)]
    [driver field]
    ...)
  ```

  is no longer invoked. All compilation is now handled by the MBQL `:field` clause method, e.g.

  ```clj
  (defmethod sql.qp/->honeysql [:my-driver :field]
    [driver field-clause]
    ...)
  ```

  If you were doing something special here, you'll need to move that special login into `[<driver> :field]` instead.
  (You may no longer need this special logic, however -- see below.)

- `:field`, `:expression`, and `:aggregation-options` clauses now contain information about what aliases you should
  use to refer to them on both the left-hand side and right-hand side of SQL `AS` or elsewhere in a query. See PR
  [#19610](https://github.com/metabase/metabase/pull/19610) for a detailed discussion about the new information,
  hereafter referred to as the /[#19610 information](https://github.com/metabase/metabase/pull/19610)/.

- If you have a custom implementation of `->honeysql` for `:field` or `(class Field)`: `->honeysql` methods for `:field` should use or replace the
  [#19610 information](https://github.com/metabase/metabase/pull/19610) rather than attempting to determine or
  override it in some other fashion.

### New methods

- `metabase.driver/escape-alias` (moved from `metabase.driver.sql.query-processor/escape-alias`, which was introduced
  in 0.41.0) is now used to generate the [#19610 information](https://github.com/metabase/metabase/pull/19610) and
  used consistently across the SQL QP code. If you need to transform generated Field aliases for any reason (such as
  escaping disallowed characters), implement this method.

- `metabase.driver.sql-jdbc.sync.interface/filtered-syncable-schemas` has been added, and will eventually replace
  `metabase.driver.sql-jdbc.sync.interface/syncable-schemas`.  It serves a similar purpose, except that it's also
  passed the inclusion and exclusion patterns (ex: `auth*,data*`) to further filter schemas that will be synced.

### Deprecated methods and vars

The following methods and vars are slated for removal in Metabase 0.45.0 unless otherwise noted.

- `metabase.driver/format-custom-field-name` is now unused. Implement `metabase.driver/escape-alias` instead.

- `metabase.driver.sql.query-processor/escape-alias` has been renamed to `metabase.driver/escape-alias`. Everything
  else is the same.

- `metabase.driver.sql.query-processor/field-clause->alias` no longer uses the optional parameter `unique-name-fn`.
  Aliases are now made unique automatically, after escaping them; implement `metabase.driver/escape-alias` if you need
  to do something special before they are made unique. (Unique aliases are also escaped a second time if you need to
  do something /really/ special.)

- `metabase.driver.sql.query-processor/field->alias`, which was deprecated in 0.41.0, is now unused in 0.42.0.
  Implementing this method no longer has any effect. Implement `metabase.driver/escape-alias` instead if you need to
  do something special; use the [#19610 information](https://github.com/metabase/metabase/pull/19610) if you need to escape the alias
  for one reason or another. This method is still slated for removal in Metabase 0.44.0.

- `metabase.driver.sql.query-processor/*field-options*` is now unused and is no longer bound automatically.  If you need field options for some reason, see our SQL Server driver for an example on how to create it.

- `metabase.driver.sql.query-processor/*table-alias*` is now unused and is no longer bound automatically. Use or
  override `:metabase.query-processor.util.add-alias-info/source-table` from the [#19610
  information](https://github.com/metabase/metabase/pull/19610) instead.

- `metabase.driver.sql.query-processor/*source-query*` is now unused and is no longer bound automatically. Use
  `metabase.driver.sql.query-processor/*inner-query*` instead, which is always bound, even if we aren't inside of a
  source query.

- `metabase.driver.sql.query-processor/field->identifier` is now unused. Implementing this method should no longer be
  necessary under any circumstances. Override `->honeysql` for `[<driver> :field]` and manipulate the [#19610
  information](https://github.com/metabase/metabase/pull/19610) if you need to do something special here.

- `metabase.driver.sql.query-processor/prefix-field-alias` is no longer used. Previously, it was made available to
  give drivers a chance to escape automatically generated aliases for joined Fields. This is no longer necessary,
  because `metabase.driver/escape-alias` is called on automatically generates aliases. Implement
  `metabase.driver/escape-alias` if you need to do something special.
- `metabase.driver.sql-jdbc.sync.interface/syncable-schemas` has been deprecated in favor of
  `metabase.driver.sql-jdbc.sync.interface/filtered-syncable-schemas` (see above). The existing default implementation
  of `syncable-schemas` currently calls `filtered-syncable-schemas` (with `nil` filters, i.e. the filtering operation
  is actually a no-op), but it will eventually be removed.

#### Removed Methods and Vars

- `metabase.mbql.schema/DatetimeFieldUnit`, deprecated in 0.39.0, is now removed.

## Older versions

Before 0.42.0, this information was tracked in our Wiki. You can find changes for versions before 0.42.0 in the
table below:

| Version | Wiki page |
|---------|-----------|
| 0.41.0 | [changes](https://github.com/metabase/metabase/wiki/What's-new-in-0.41.0-for-Metabase-driver-authors) |
| 0.40.0 | No changes. |
| 0.39.0 | No changes. |
| 0.38.0 | [changes](https://github.com/metabase/metabase/wiki/What's-new-in-0.38.0-for-Metabase-driver-authors) |
| 0.37.0 | [changes](https://github.com/metabase/metabase/wiki/What's-new-in-0.37.0-for-Metabase-driver-authors) |
| 0.36.0 | [changes](https://github.com/metabase/metabase/wiki/What's-new-in-0.36.0-for-Metabase-driver-authors) |
| 0.35.0 | [changes](https://github.com/metabase/metabase/wiki/What's-new-in-0.35.0-for-Metabase-driver-authors) |
