---
title: Driver interface changelog
---

# Driver Interface Changelog

## Metabase 0.48.0

- The MBQL schema in `metabase.mbql.schema` now uses [Malli](https://github.com/metosin/malli) instead of
  [Schema](https://github.com/plumatic/schema). If you were using this namespace in combination with Schema, you'll
  want to update your code to use Malli instead.

- Another driver feature has been added: `:table-privileges`. This feature signals whether we can store
  the table-level privileges for the database on database sync.

- The multimethod `metabase.driver/current-user-table-privileges` has been added. This method is used to get
  the set of privileges the database connection's current user has. It needs to be implemented if the database
  supports the `:table-privileges` feature.

- The following functions in `metabase.query-processor.store` (`qp.store`) are now deprecated

  * `qp.store/database`
  * `qp.store/table`
  * `qp.store/field`

  Update usages of the to the corresponding functions in `metabase.lib.metadata` (`lib.metadata`):

  ```clj
  (qp.store/database)       => (lib.metadata/database (qp.store/metadata-provider))
  (qp.store/table table-id) => (lib.metadata/table (qp.store/metadata-provider) table-id)
  (qp.store/field field-id) => (lib.metadata/field (qp.store/metadata-provider) field-id)
  ```

  Note that the new methods return keys as `kebab-case` rather than `snake_case`.

- Similarly, drivers should NOT access the application database directly (via `toucan` functions or otherwise); use
  `lib.metadata` functions instead. This access may be blocked in a future release.

- SQL drivers that implement `metabase.driver.sql.query-processor/->honeysql` for
  `metabase.models.table/Table`/`:model/Table` should be updated to implement it for `:metadata/table` instead. As
  with the changes above, the main difference is that the new metadata maps use `kebab-case` keys rather than
  `snake_case` keys.

* `metabase.driver.sql.query-processor/cast-field-if-needed` now expects a `kebab-case`d field as returned by
  `lib.metadata/field`.

- `metabase.query-processor.store/fetch-and-store-database!`,
  `metabase.query-processor.store/fetch-and-store-tables!`, and
  `metabase.query-processor.store/fetch-and-store-fields!` have been removed. Things are now fetched automatically as
  needed and these calls are no longer necessary.

- `metabase.models.field/json-field?` has been removed, use `metabase.lib.field/json-field?` instead. Note that the
  new function takes a Field as returned by `lib.metadata/field`, i.e. a `kebab-case` map.

- Tests should try to avoid using any of the `with-temp` helpers or application database objects; instead, use the
  metadata functions above and and the helper *metadata providers* in `metabase.lib`, `metabase.lib.test-util`, and
  `metabase.query-processor.test-util` for mocking them, such as `mock-metadata-provider`,
  `metabase-provider-with-cards-for-queries`, `remap-metadata-provider`, and `merged-mock-metadata-provider`.

- `metabase.query-processor.util.add-alias-info/field-reference` is now deprecated. If your driver implemented it,
  implement `metabase.query-processor.util.add-alias-info/field-reference-mlv2` instead. The only difference between
  the two is that the latter is passed Field metadata with `kebab-case` keys while the former is passed legacy
  metadata with `snake_case` keys.

- `metabase.driver/current-db-time`, deprecated in 0.34, and related methods and helper functions, have been removed.
  Implement `metabase.driver/db-default-timezone` instead.

- `metabase.driver.sql-jdbc.sync.interface/db-default-timezone`, a helper for writing
  `metabase.driver/db-default-timezone` implementations for JDBC-based drivers, has been deprecated, and will be
  removed in 0.51.0 or later. You can easily implement `metabase.driver/db-default-timezone` directly, and use
  `metabase.driver.sql-jdbc.execute/do-with-connection-with-options` to get a `java.sql.Connection` for a Database.

- Added a new multimethod `metabase.driver.sql.parameters.substitution/align-temporal-unit-with-param-type`, which returns
  a suitable temporal unit conversion keyword for `field`, `param-type` and the given driver. The resulting keyword
  will be used to call the corresponding `metabase.driver.sql.query-processor/date` implementation to convert the `field`.
  Returns `nil` if the conversion is not necessary for this `field` and `param-type` combination.

- The multimethod `metabase.driver.sql-jdbc.execute/inject-remark` has been added. It allows JDBC-based drivers to
  override the default behavior of how SQL query remarks are added to queries (prepending them as a comment).

- The arity of multimethod `metabase.driver.sql-jdbc.sync.interface/fallback-metadata-query` has been updated from 3 to 4,
  it now takes an additional `db` argument. The new function arguments are: `[driver db-name-or-nil schema table]`.

## Metabase 0.47.0

- A new driver feature has been added: `:schemas`. This feature signals whether the database organizes tables in
  schemas (also known as namespaces) or not. Most databases have schemas so this feature is on by default.
  An implemention of the multimethod `metabase.driver/database-supports?` for `:schemas` is required only if the
  database doesn't store tables in schemas.

- Another driver feature has been added: `:uploads`. The `:uploads` feature signals whether the database supports
  uploading CSV files to tables in the database. To support the uploads feature, implement the following new
  multimethods: `metabase.driver/create-table!` (creates a table), `metabase.driver/drop-table!` (drops
  a table), and `metabase.driver/insert-into!` (inserts values into a table).

- The multimethod `metabase.driver/syncable-schemas` has been added. This method is used to list schemas to upload
  CSVs to, and it should include all schemas that can be synced. Currently it only needs to be implemented
  if the database has schema, and the database supports the `:uploads` feature.

- The multimethod `metabase.driver/supports?` has been deprecated in favor of `metabase.driver/database-supports?`.
  The existing default implementation of `database-supports?` currently calls `supports?`, but it will be removed in
  0.50.0.

- `metabase.driver.sql-jdbc.execute/connection-with-timezone` has been marked deprecated and is scheduled for removal
  in Metabase 0.50.0. The new method `metabase.driver.sql-jdbc.execute/do-with-connection-with-options` replaces it.
  Migration to the new method is straightforward. See PR [#22166](https://github.com/metabase/metabase/pull/22166) for
  more information. You should use `metabase.driver.sql-jdbc.execute/do-with-connection-with-options` instead of
  `clojure.java.jdbc/with-db-connection` or `clojure.java.jdbc/get-connection` going forward.

- The multimethods `set-role!`, `set-role-statement`, and `default-database-role` have been added. These methods are
  used to enable connection impersonation, which is a new feature added in 0.47.0. Connection impersonation allows users
  to be assigned to specific database roles which are set before any queries are executed, so that access to tables can
  be restricted at the database level instead of (or in conjunction with) Metabase's built-in permissions system.

- The multimethod `metabase.driver.sql-jdbc.sync.describe-table/get-table-pks` is changed to return a vector instea
  of a set.

- The function `metabase.query-processor.timezone/report-timezone-id-if-supported` has been updated to take an additional
  `database` argument for the arity which previously had one argument. This function might be used in the implementation
  of a driver's multimethods.

- `metabase.driver/prettify-native-form` was added to enable driver developers use native form formatting
  specific to their driver. For details see the PR [#34991](https://github.com/metabase/metabase/pull/34991).

## Metabase 0.46.0

- The process for building a driver has changed slightly in Metabase 0.46.0. Your build command should now look
  something like this:

  ```sh
  # Example for building the driver with bash or similar

  # switch to the local checkout of the Metabase repo
  cd /path/to/metabase/repo

  # get absolute path to the driver project directory
  DRIVER_PATH=`readlink -f ~/sudoku-driver`

  # Build driver. See explanation in sample Sudoku driver README
  clojure \
    -Sdeps "{:aliases {:sudoku {:extra-deps {com.metabase/sudoku-driver {:local/root \"$DRIVER_PATH\"}}}}}"  \
    -X:build:sudoku \
    build-drivers.build-driver/build-driver! \
    "{:driver :sudoku, :project-dir \"$DRIVER_PATH\", :target-dir \"$DRIVER_PATH/target\"}"
  ```

  Take a look at our [build instructions for the sample Sudoku
  driver](https://github.com/metabase/sudoku-driver#build-it-updated-for-build-script-changes-in-metabase-0460)
  for an explanation of the command.

  Note that while this command itself is quite a lot to type, you no longer need to specify a `:build` alias in your
  driver's `deps.edn` file.

  Please upvote https://ask.clojure.org/index.php/7843/allow-specifying-aliases-coordinates-that-point-projects ,
  which will allow us to simplify the driver build command in the future.

- The multimethod `metabase.driver/table-rows-sample` has been added. This method is used in situations where Metabase
  needs a limited sample from a table, like when fingerprinting. The default implementation defined in the
  `metabase.db.metadata-queries` namespace runs an MBQL query using the regular query processor to produce the sample
  rows. This is good enough in most cases, so this multimethod should not be implemented unless really
  necessary. Currently, the only case when a special implementation is used is for BigQuery, which does not respect
  limit clauses.

- The multimethod `metabase.driver.sql.query-processor/datetime-diff` has been added. This method is used by
  implementations of `->honeysql` for the `:datetime-diff` clause. It is recommended to implement this if you want to
  use the default SQL implementation of `->honeysql` for the `:datetime-diff`, which includes validation of argument
  types across all units.

- The multimethod `metabase.query-processor.util.add-alias-info/field-reference` has been added. This method is used
  to produce a reference to a field by the `add-alias-info` middleware. (Note that this middleware is optional,
  currently it is only used by the SQL and MongoDB drivers.) The default implementation returns the name of the field
  instance. It should be overridden if just the name is not a valid a valid reference. For example, MongoDB supports
  nested documents and references to nested fields should contain the whole path. See the namespace
  `metabase.driver.mongo.query-processor` for an alternative implementation.

- The multimethod `metabase.driver.sql-jdbc.sync.interface/syncable-schemas` (aliased as
  `metabase.driver.sql-jdbc.sync/syncable-schemas`), which was deprecated in 0.43.0, has been removed. Implement
  `metabase.driver.sql-jdbc.sync.interface/filtered-syncable-schemas` instead. See 0.43.0 notes below for more
  details.

- The multimethod `metabase.driver/format-custom-field-name`, which was deprecated in 0.42.0, has been removed.
  Implement `metabase.driver/escape-alias` instead. See 0.42.0 notes below for more information.

- The multimethod `metabase.driver.sql-jdbc.execute/read-column`, which was deprecated in 0.35.0, has been removed.
  Implement `metabase.driver.sql-jdbc.execute/read-column-thunk` instead. See 0.35.0 notes below for more information.

### Honey SQL 2

The following only applies to SQL drivers; you can ignore it for non-SQL drivers.

Prior to Metabase 0.46.0, SQL drivers used Honey SQL 1 as an intermediate target when compiling queries. In 0.46.0 we
have began the process of migrating to Honey SQL 2 as our new intermediate target.

We plan to continue to support use of Honey SQL 1 until Metabase 0.49.0. Please be sure to migrate your drivers before
then.

In Metabase 0.46.x, 0.47.x, and 0.48.x, you can specify which version of Honey SQL you driver should use by
implementing the `metabase.driver.sql.query-processor/honey-sql-version` multimethod:

```clj
(require '[metabase.driver.sql.query-processor :as sql.qp])

;;; use Honey SQL 2 for :my-driver
(defmethod sql.qp/honey-sql-version :my-driver
  [_driver]
  2)
```

This method must return either `1` or `2`. Currently, the default implementation returns `1`. Effectively this means
you currently have to opt-in to Honey SQL 2 compilation. It's a good idea to do this sooner rather than later so your
driver is prepared for 0.49.0 well in advance.

In Metabase 0.47.x or 0.48.x we will likely change the default Honey SQL version to `2` to ensure everyone is aware of
the upcoming breaking changes in 0.49.0 and give them one or two release cycles to update their drivers to target
Honey SQL 2. You will still be able to opt-in to using Honey SQL 1 until 0.49.0 by implementing
`sql.qp/honey-sql-version` and returning `1`.

#### What You Need to Change

Our Honey SQL utility namespace, `metabase.util.honeysql-extensions`, commonly aliased as `hx`, has been updated to
generate forms appropriate for either Honey SQL 1 or Honey SQL 2. This is done automatically based on your driver's
`honey-sql-version`. `metabase.driver.sql.query-processor` itself also supports both targets in the same way.

The actual changes you will need to make to your driver code will probably be fairly small. The most important things
to note when porting your driver:

1. Avoid use of things from Honey SQL 1 namespaces like `honeysql.core` or `honeysql.format`. If you must, use Honey
   SQL `honey.sql` instead; you may not need either.

2. While you can continue to use `metabase.util.honeysql-extensions` in the short term, since it can target either
   version of Honey SQL, we will probably remove this namespace at some point in the future. Update your code to use
   `metabase.util.honey-sql-2` instead. The namespaces implement an almost identical set of helper functions, so all
   you should need to switch is which one you `:require` in your `ns` form.

3. `honeysql.core/call` no longer exists; instead of a form like `(hsql/call :my_function 1 2)`, you simply return a
   plain vector like `[:my_function 1 2]`. `(hsql/raw "x")` is now`[:raw "x"]`. New handlers can be registered with
   Honey SQL 2 with `honey.sql/register-fn!`. There is no equivalent of the Honey SQL 1 `honeysql.format./ToSql`
   protocol, so you should no longer define one-off types to implement custom SQL compilation rules. Use
   `honey.sql/register-fn!` instead.

4. In Honey SQL 1 you were able to register functions to a more limited extent by implementing the multimethod
   `honeysql.format/fn-handler`. Metabase registered the functions `:extract`, `:distinct-count`, and
   `:percentile-cont` in this way. For Honey SQL 2, we've registered these functions as qualified keywords in the
   `metabase.util.honey-sql-2` namespace, to prevent confusion as to where they're defined. Thus you'll need to update
   the keyword if you're using these functions.

   ```clj
   ;;; Honey SQL 1
   (hsql/call :distinct-count expr)
   ```

   becomes

   ```clj
   ;;; Honey SQL 2
   (require '[metabase.util.honey-sql-2 :as h2x])

   [::h2x/distinct-count expr]
   ```

5. Because custom expressions are now just plain vectors like `[:my_function 1]`, you may need to wrap expressions in
   an additional vector if they appear inside `:select`, `:from`, or other places where a vector could be interpreted
   as `[expression alias]`. e.g.

   ```clj
   ;; Honey SQL 1
   (honeysql.core/format {:select [[:my_function 1]]})
   ;; => ["SELECT my_function AS 1"]

   ;; Honey SQL 2
   ;;
   ;; WRONG
   (honey.sql/format {:select [[:my_function 1]]})
   ;; => ["SELECT my_function AS ?" 1]

   ;; CORRECT
   (honey.sql/format {:select [[[:my_function 1]]]})
   ;; => ["SELECT MY_FUNCTION(?)" 1]
   ```

   The SQL query processor does this automatically for forms it generates, so you only need to worry about this if
   you're overriding the way it generates `:select` or other top-level clauses.

6. Numbers are parameterized by default, e.g. `{:select [1]}` becomes `SELECT ?` rather than `SELECT 1`. You can use
   `:inline` to force the SQL to be generated inline instead: `{:select [[[:inline 1]]]}` becomes `SELECT 1`. Numbers
   generated by the SQL query processor code should automatically be inlined, but you may need to make sure any
   numbers you generate are wrapped in `:inline` if they can end up as expressions inside a `GROUP BY` clause. Some
   databases can recognize expressions as being the same thing only when they are *not* parameterized:

   ```sql
   -- This is okay
   SELECT x + 1
   FROM table
   GROUP BY x + 1

   -- Bad: DB doesn't know whether the two x + ? expressions are the same thing
   SELECT x + ?
   FROM table
   GROUP BY x + ?
   ```

  Exercise caution when `:inline`ing things -- take care not to use it on untrusted strings or other avenues for SQL
  injection. Only inlining things that are a `number?` is a safe bet.

Please read [Differences between Honey SQL 1.x and
2.x](https://github.com/seancorfield/honeysql/blob/develop/doc/differences-from-1-x.md) for more information on the
differences between the library versions.

#### Breaking Changes in 0.46.0 related to the Honey SQL 2 transition

**Note: these breaking changes will hopefully be fixed before 0.46.0 ships. This will be updated if they are.**

The classes `metabase.util.honeysql_extensions.Identifer` and `metabase.util.honeysql_extensions.TypedHoneySQLForm`
have been moved to `metabase.util.honey_sql_1.Identifer` and `metabase.util.honey_sql_1.TypedHoneySQLForm`,
respectively. On the off chance that your driver directly referencing these class names, you may need to update things
to use the new class names.

Similarly, `metabase.util.honeysql-extensions/->AtTimeZone` has been removed; use
`metabase.util.honeysql-extensions/at-time-zone` instead.

## Metabase 0.45.0

- `metabase.driver.sql-jdbc.connection/details->connection-spec-for-testing-connection` has been removed in Metabase
  0.45.0, because it leaked SSH tunnels. See [#24445](https://github.com/metabase/metabase/issues/24445). If you are
  using this function, please update your code to use
  `metabase.driver.sql-jdbc.connection/with-connection-spec-for-testing-connection` instead, which properly cleans up
  after itself.

### New methods

- `metabase.driver.sql-jdbc.sync.describe-table-fields` has been added. Implement this method if you want to override
  the default behavior for fetching field metadata (such as types) for a table.

- `metabase.driver.sql-jdbc.sync.describe-table/get-table-pks` has been added. This methods is used to get a set of pks
  given a table.

- `->honeysql [<driver> :convert-timezone]` has been added. Implement this method if you want your driver to support
  the `convertTimezone` expression. This method takes 2 or 3 arguments and returns a `timestamp without time zone` column.

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
