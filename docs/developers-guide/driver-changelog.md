---
title: Driver interface changelog
---

# Driver Interface Changelog

## Metabase 0.59.0

- Added `sql-jdbc.execute/db-type-name` multimethod. Override this method when your sql-jdbc-based driver needs to
  customize how database type names are retrieved from result set metadata, for example when certain types need to be
  remapped based on precision or connection settings. For example, the `:mysql` implementation remaps `TINYINT` with
  precision 1 to `BIT` (boolean) to ensure type consistency between sync and query execution.

- Added workspace isolation multimethods for enterprise workspaces feature:
  - `init-workspace-isolation!`    - Initialize database isolation for a workspace (create isolated schema/database and
                                     user credentials)
  - `destroy-workspace-isolation!` - Destroy all database resources created for workspace isolation
  - `grant-workspace-read-access!` - Grant read access on specified tables to a workspace's isolated user
  - `check-isolation-permissions`  - Check if database connection has sufficient permissions for workspace isolation
                                     by testing the actual operations

## Metabase 0.58.0

- Added a `:collate` feature for drivers that support collation settings on text fields

- Added `metabase.driver/compile-insert` to implement incremental transforms.

- All tests in `metabase.query-processor-test.*` namespaces have been moved to `metabase.query-processor.*` (This is
  only relevant if you run individual test namespaces as part of your development workflow).

- Added `metabase.driver/create-index!`, `metabase.driver/drop-index!` multimethods.
  For JDBC databases, a default implementation is provided - and `metabase.driver.sql-jdbc/create-index-sql`,
  `metabase.driver.sql-jdbc/drop-index-sql` can be used to specialize the DDL.
  Creating indexes can accelerate the `MAX` queries that incremental transforms use to determine watermark position.
  These methods run only when the `:transforms/index-ddl` feature is enabled, making them opt-in.

## Metabase 0.57.7

- Added the new `:regex/lookaheads-and-lookbehinds` driver feature flag; by default this is true for all drivers that
  support `:regex` and false for all drivers that do not. If your driver supports regular expressions but does not
  support lookaheads or lookbehinds, add a `metabase.driver/database-supports?` method implementation -- see the
  `:bigquery-cloud-sdk` driver for example.

## Metabase 0.57.0

- `driver/field-reference-mlv2` is now deprecated, and is no longer used. Please remove your implementations.

- The key `metabase.driver-api.core/qp.add.nfc-path` is now more consistently populated; other `qp.add.*` keys no
  longer include parent column names for drivers like MongoDB -- use `qp.add.nfc-path` instead to qualify the
  `qp.add.source-column-alias` with parent column names as needed.

- Added the following driver methods to implement sql transforms.
  - metabase.driver/compile-drop-table
  - metabase.driver/compile-transform
  - metabase.driver/connection-spec
  - metabase.driver/drop-transform-target!
  - metabase.driver/execute-raw-queries!
  - metabase.driver/native-query-deps
  - metabase.driver/run-transform!
  - metabase.driver/table-exists?
  - metabase.driver.sql/default-schema
  - metabase.driver.sql/normalize-name

- Added `metabase.driver/rename-tables!*` multimethod for atomic table renaming operations. Takes a map of {from-table to-table}
  pairs that has been topologically sorted.

- Added `metabase.driver/rename-table!` multimethod for table renaming operations. Takes a single from-table to-table pair.
  Fallbacks to singleton call to `rename-tables!*` if available.

- Added the driver multi-methods `metabase.driver/schema-exists?` and `metabase.driver/create-schema-if-needed!`
  which should be implemented by drivers that support `:schemas` and `:transforms/table`.

- Added `metabase.driver/type->database-type` multimethod that returns the database type for a given Metabase
  type (from the type hierarchy) as a HoneySQL spec. This method handles general Metabase base types.

- Added the following driver multimethods for use with the :dependencies/native feature:
  - driver/native-result-metadata
  - driver/validate-native-query-fields
  - driver.sql.normalize-unquoted-name
  - driver.sql.normalize/reserved-literal
  - driver.sql.references/field-references-impl
  - driver.sql.references/find-returned-fields
  - driver.sql.references/find-used-fields
  - driver.sql/resolve-field

- Added `metabase.driver/insert-from-source!` multimethod that abstracts data insertion from various sources
  into existing tables. This multimethod dispatches on both the driver and the data source type
  (`:rows` or `:jsonl-file`). It allows drivers to optimize based on the data source type and returns the number
  of rows inserted. Default implementations are provided for both `:rows` and `:jsonl-file` source types.

- Added `metabase.driver/insert-col->val` multimethod to parse values for insertion based on driver, data source type
  and column definition. Drivers should implement this when their insertion mechanism needs values converted to proper types.

- `metabase.driver/humanize-connection-error-message` now takes a list of all messages in the exception chain,
  instead of just the top-level message as a string.

- Removed `driver/set-database-used`. Drivers should set default databases in their connection specs instead.

- `metabase.driver.common.table-rows-sample/table-rows-sample`'s optional `:order-by` option should now be something
  you can pass to [[metabase.lib.core/order-by]] -- for example a Lib `:metadata/column` or an [MBQL 5]
  `metabase.driver-api.core/order-by-clause`.

- `metabase.driver-api.core/nest-query` no longer automatically calls `metabase.driver-api.core/add-alias-info` on its
  results, but it also no longer expect its input to have this information. If you were using both of these tools in
  your driver, make change the order in which the are applied so `nest-query` happens first, followed by
  `add-alias-info`. Note that drivers deriving from `:sql` do not need to make any changes, since this is done by the
  base `:sql` driver implementation.

## Metabase 0.56.3

- Added the driver multi-method `driver/describe-database*` that drivers should now implement instead of `driver/describe-database`.
  This provides automatic resilient connection handling for better error recovery when database connections are closed
  during metadata sync operations. Existing drivers implementing `describe-database` will continue to work but should
  migrate to `describe-database*` to benefit from the resilient connection handling.

## Metabase 0.56.0

- Add the testing multi-method `tx/track-dataset` for shared cloud dbs to track loaded datasets for more efficient sharing.

- Join alias escaping has been reworked; when compiling MBQL for a join please use
  `metabase.driver-api.core/qp.add.alias` instead of `:join-alias`. (This is mostly relevant if you have a custom
  `metabase.driver.sql.query-processor/join->honeysql` implementation.)

  Join aliases are no longer globally unique by default, but instead unique within a given level of a query. If you
  need globally unique join aliases, you can pass the new `{:globally-unique-join-aliases? true}` option to
  `driver-api/add-alias-info`.

  Also note that `driver-api/add-alias-info` only adds additional keys to field refs and join maps, and does not
  replace existing keys like `:alias`, `:join-alias`, or `:name`; make sure you use `driver-api/qp.add.alias`,
  `driver-api/qp.add.source-table`, and `driver-api/qp.add.source-alias` respectively.

- Added the driver multi-method `driver/extra-info` for drivers to provide info such as db routing configuration details
  from their `metabase-plugin.yaml` file.

- Extend `datetime()` to accept UTF-8 encoded binary and numbers (unix timestamps) in addition to strings.

- Added a feature `:expressions/today` for drivers that support generating a date for the current day.

- Added the driver multi-method `driver/set-database-used!` for drivers to set a database on the connection with statements like `USE DATABASE`.

- Added the driver feature `:transforms/table` for drivers that supports transforms with table as target

## Metabase 0.55.9

- Add multi-method `driver/do-with-resilient-connection` for executing functions in a context where closed connections may be automatically reopened

## Metabase 0.55.0

- Add the multi-method `->date` that allows the driver to control how to cast strings and temporal types to dates.

- Add the multi-method `date-dbtype` that allows the driver to control which types dates are cast to.

- Extend `date()` to accept a DateTime (or DB equivalent) in addition to an ISO string. When given a DateTime, it will truncate it to a date.

- Added a feature `:expressions/datetime` for drivers that support converting iso strings to datetimes

- Added a feature `:expression-literals` for drivers that support expressions consisting of a single string, number, or boolean literal value.

- Added a feature `:multi-level-schema` for drivers that support hierarchical levels between database and schema. Such as databricks' catalog. Defaults to false.

- Added the multi-method `adjust-schema-qualification` that allows drivers to qualify, or unqualify table schemas based on enabling or disabling multi-level-schema support. Drivers may need to implement `sql.qp/->honeysql [driver ::h2x/identifier]` to properly quote fully qualified schemas.

- Added the multi-method `float-dbtype` which returns the name of the float type we coerce to for coercion strategies and the `float()` custom expression function.

- Added a feature `:expressions/float` for drivers that support casting text to floats.

- Added the multi-method `integer-dbtype` that allows the driver to control which type integers are cast to.

- The `metabase.upload` namespace has been replaced with `metabase.upload.core`, but upload type keywords e.g.
  `:metabase.upload/varchar-255` remain unchanged. Make sure you weren't using `::` keywords inside methods like
  `metabase.driver/upload-type->database-type` or `metabase.driver/allowed-promotions` -- make sure you use
  `:metabase.upload/varchar-255` rather than something like `::upload/varchar-255`.

- The `metabase.models.secret` namespace has been replaced with `metabase.secrets.core`; if you were using it please
  update your usages.

- The namespace `metabase.public-settings` has been removed, and settings have been moved to appropriate modules, e.g.
  `site-uuid` now lives in `metabase.system.core`. If you were using this namespace, please update your code
  accordingly. You should be able to find the correct one by looking at how those settings are used in our first-party
  drivers.

- The namespaces `metabase.models.field`, `metabase.models.field-values`, and `metabase.models.table` have been moved
  to `metabase.warehouse-schema.field`, `metabase.warehouse-schema.field-values`, and
  `metabase.warehouse-schema.table` respectively. You shouldn't use these namespaces directly in your drivers, but if
  you did, please update your references.

- `metabase.driver.sql.query-processor/->honeysql` is no longer supported for `:model/Table` (support for this was
  deprecated in 0.48.0) -- methods for this will no longer be used; if you have such a method, migrate it to
  `:metadata/table` instead. If you have a `:model/Table` and need a `:metadata/table` instead (such as in
  implementations of `metabase.driver/table-rows-seq`) you can use `metabase.lib.metadata/table`.

- `metabase.db.metadata-queries` has been removed; the parts meant for usage by drivers have been moved to
  `metabase.driver.common.table-rows-sample`.

- `metabase.util.ssh` has been moved to `metabase.driver.sql-jdbc.connection.ssh-tunnel`.

- `metabase.query-processor.pipeline/*query-timeout-ms*` has been moved to
  `metabase.driver.settings/*query-timeout-ms*`.

- The namespace `metabase.query-processor.context`, deprecated in 0.50.0, has been removed.

- All settings formerly in a `metabase.driver.*` namespace have been moved to `metabase.driver.settings`, and all
  settings formerly in a `metabase.query-processor.*` namespace have been moved to
  `metabase.query-processor.settings`.

## Metabase 0.54.12

- The function `metabase.driver.sql-jdbc.sync/describe-table-fields-xf` now takes a table instead of a database

## Metabase 0.54.11

- The multimethods `metabase.driver.sql-jdbc.sync.interface/active-tables` and `metabase.driver.sql-jdbc.sync.interface/filtered-syncable-schemas`, as well as the functions
  `metabase.driver.sql-jdbc.sync.describe_database/fast-active-tables`, `metabase.driver.sql-jdbc.sync.describe_database/have-select-privilege-fn` and `metabase.driver.sql-jdbc.sync.describe_database/db-tables` now take a database spec instead of a `java.sql.Connection` object.

## Metabase 0.54.10

- Add `metabase.driver/table-known-to-not-exist?` for drivers to test if an exception is due to a query on a table that no longer exists
- Add `metabase.driver.sql-jdbc/impl-table-known-to-not-exist?` for JDBC drivers. This is the implementation of table-known-to-not-exist for jdbc and allows testing directly against `java.sql.SQLException` throwables without worrying about the exception cause chain.

## Metabase 0.54.0

- Added the multi-method `allowed-promotions` that allows driver control over which column type promotions are supported for uploads.

- Added the multi-method `alter-table-columns!`, like `alter-columns!` but accepts additional kw-arg opts.
  Existing implementations of `alter-columns!` will be used by default.

- `alter-columns!` is now marked as deprecated. Drivers
  should seek to implement the new `alter-table-columns!` method.

- The multimethod `metabase.driver.sql-jdbc.sync.interface/alter-table-columns-sql` has been added, like `alter-columns-sql` but accepts additional kw-arg opts. Existing implementations of `alter-columns-sql` will be used by default.

- `metabase.driver.sql-jdbc.sync.interface/alter-columns-sql` is now marked as deprecated. Drivers should seek to implement the new `alter-table-columns-sql` method.

- Added a feature `:test/arrays` and multimethod `native-array-query` to enable the testing of array types for
  databases that support them.

- Added a feature `:expressions/text` for drivers that support casting to text

- Added a feature `:expressions/date` for drivers that support casting text to date

- Added a feature `:expressions/integer` for drivers that support casting text to integer

- Added a feature `:distinct-where` for drivers that support the `distinct-where` function.

- Added a feature `:split-part` for drivers that support the `split-part` function.

## Metabase 0.53.12

- Add `metabase.driver/query-canceled?` for drivers to test if an exception is due to a query being canceled due to user action
- Add `metabase.driver.sql-jdbc/impl-query-canceled?` for JDBC drivers. This is the implementation of query-canceled for jdbc and allows testing directly against `java.sql.SQLException` throwables without worrying about the exception cause chain.

## Metabase 0.53.10

- Added `metabase.driver.sql-jdbc.sync/describe-fields-pre-process-xf` for JDBC drivers. This allows manipulating the results of `metabase.driver.sql-jdbc.sync/describe-fields-sql` without reimplementing `driver/describe-fields`.

## Metabase 0.53.0

- Added the multimethod `bad-connection-details` to allow mocking bad connection parameters for tests.

- Added `driver/dynamic-database-types-lookup` and its `:postgres` implementation. The method generates map
  of `database_type` to `base_type`, for dynamic types, ie. those which are not covered
  by `sql-jdbc.sync/database-type->base-type`. Its original purpose was to enable mapping of user defined enums in
  postgres to appropriate base type in results metadata.

## Metabase 0.52.12

- Added the multimethod `metabase.driver/db-details-to-test-and-migrate`. This can be used to cleanup and migrate ambiguous connection details from previous versions.

## Metabase 0.52.0

- The Docker image for Metabase 0.52.0 now uses Java 21 instead of Java 11. Please make sure to test your driver
  against Java 21 and make sure it works as expected.

  We have found several of our own drivers that run into issues with the security changes introduced in newer JVMs; as
  such, we're currently setting the JVM flag

  ```
  --add-opens java.base/java.nio=ALL-UNNAMED
  ```

  when running Metabase to disable some of these new security checks. If your tests run into issues with Java 21
  without the flag set, try running with it set -- this might fix the problems.

## Metabase 0.51.4

- Another driver feature has been added: `describe-indexes`. If a driver opts-in to supporting this feature, The
  multimethod `metabase.driver/describe-indexes` must be implemented, as a replacement for
  `metabase.driver/describe-table-indexes`.

- The multimethod `metabase.driver.sql-jdbc.sync.describe-table/describe-indexes-sql` has been added. The method needs
  to be implemented if the driver supports `describe-indexes` and you want to use the default JDBC implementation of
  `metabase.driver/describe-indexes`.

## Metabase 0.51.0

- New optional method `metabase.driver/query-result-metadata` has been added for efficiently calculating metadata for
  queries without actually running them. `:sql-jdbc` has been given a default implementation; drivers not based on
  this that can determine result metadata without actually running queries should add their implementations as well
  for better performance when saving Questions. Refer to the method docstring for more information and where to find
  an example implementation.

- Before 0.51.0, to generate SQL queries with inline parameters, Metabase would generate a parameterized SQL string,
  then attempt to parse the SQL replace and replace `?` placeholders with inline values from the driver method
  `metabase.driver.sql.util.unprepare/unprepare-value`. In 0.51.0+, Metabase instead generates these queries using
  Honey SQL 2's `:inline` option, eliminating the need to parse and replace `?` placeholders. As such, the
  `metabase.driver.sql.util.unprepare` namespace has been deprecated; you should remove all usages of it in your driver.

- The `metabase.driver.sql.util.unprepare/unprepare-value` method has been replaced by the new method
  `metabase.driver.sql.query-processor/inline-value`. The signatures of these two functions are the same, and you
  should be able to simply change the all of your `unprepare-value` implementations to `inline-value` instead. See
  [PR #45008](https://github.com/metabase/metabase/pull/45008) for examples of this change.

  For the time being, implementations of `unprepare-value` are used as implementations of `inline-value`
  automatically, but `unprepare-value` is slated for removal in 0.54.0.

- `metabase.driver.sql.query-processor/format-honeysql` is now a multimethod, mainly so you can bind
  `*compile-with-inline-parameters*` if you need to always compile without parameterization.

- The dynamic variable `metabase.driver/*compile-with-inline-parameters*` (default `false`) has been added; drivers
  that can generate parameterized queries should look at its value in their implementation of
  `metabase.driver/mbql->native` and adjust their output accordingly. For `:sql-jdbc`-based drivers that support
  parameterization, this is handled in the shared `metabase.driver.sql.query-processor` code, so you shouldn't need
  to adjust anything here. For `:sql` drivers that do not support JDBC-style parameterized queries you can implement
  `format-honeysql` and bind `*compile-with-inline-parameters*` as discussed above. See the `:athena` driver for an
  example of how to do this.

- `metabase.driver.sql.util.unprepare/unprepare`, which took a parameterized SQL string and de-parameterized or
  "unprepared" it, has been removed. Instead, if you need a query with parameters spliced directly into the SQL,
  bind `metabase.driver/*compile-with-inline-parameters*` as discussed above.

- Similarly, the driver method `metabase.driver/splice-parameters-into-native-query` has been marked deprecated, and
  the default implementation will throw an Exception if called. Rework code that generates parameterized queries and
  then calls `unprepare` or `splice-parameters-into-native-query` with code that generates queries with inlined
  parameters in the first place as discussed above. Tests can use
  `metabase.query-processor.compile/compile-with-inline-parameters` if needed.

- `metabase.query-processor.compile/compile-and-splice-parameters` has been removed; replace usages with
  `metabase.query-processor.compile/compile-with-inline-parameters`.

- The three-arity of `metabase.driver.sql.query-processor/format-honeysql` (which had an additional parameter for
  Honey SQL version) has been removed; replace all usages with the two-arity version. Honey SQL 2 has been the only
  supported version since Metabase 0.49.0.

- The `:skip-drop-db?` option sometimes passed to methods for loading and destroying test data is no longer passed,
  you can remove code that checks for it. Test data code is now better about avoiding unneeded/redundant calls to
  `metabase.test.data.interface/create-db!`, so test data loading code should not need to call `DROP DATABASE IF EXISTS` before loading test data.

- Test data loading for JDBC-based databases has been overhauled somewhat. The multimethod
  `metabase.test.data.sql-jdbc.load-data/load-data!` and helper functions for it have been removed in favor of several
  new simpler to compose and understand multimethods.

- `metabase.test.data.sql-jdbc.load-data/row-xform` is a transducer applied to each row when loading test data. The
  default implementation is `identity`, but you can use `metabase.test.data.sql-jdbc.load-data/add-ids-xform` to add
  IDs to each row (this replaces the removed `metabase.test.data.sql-jdbc.load-data/load-data-add-ids` function) and
  `metabase.test.data.sql-jdbc.load-data/maybe-add-ids-xform` (which replaces
  `metabase.test.data.sql-jdbc.load-data/load-data-maybe-add-ids!` and
  `metabase.test.data.sql-jdbc.load-data/load-data-maybe-add-ids-chunked!`).

- `metabase.test.data.sql-jdbc.load-data/chunk-size` is used to control the number of rows that should be loaded in
  each batch. The default is `200`, but you can implement this method and return `nil` to load data all at once
  regardless of the number of rows. `metabase.test.data.sql-jdbc.load-data/*chunk-size*`,
  `metabase.test.data.sql-jdbc.load-data/load-data-chunked`,
  `metabase.test.data.sql-jdbc.load-data/load-data-all-at-once!`,
  `metabase.test.data.sql-jdbc.load-data/load-data-chunked!`, and other similar functions are no longer needed and
  have been removed.

- `metabase.test.data.sql-jdbc.load-data/chunk-xform` is a transducer applied to each chunk of rows (dependent on
  `chunk-size`) or the entire group of rows if `chunk-size` is `nil`. The default is `identity`. It can be used to
  implement special behavior for each chunk, for example writing the chunk to a CSV file to load separately in the
  `metabase.test.data.sql-jdbc.load-data/do-insert!` method. See the `metabase.test.data.vertica` for an example of
  this.

- Connections are now created once and reused for much of test data loading. The second argument to
  `metabase.test.data.sql-jdbc.load-data/do-insert!` is now a `java.sql.Connection` instead of a `clojure.java.jdbc`
  spec.

- Similarly, `metabase.test.data.sql-jdbc.execute/execute-sql!` and helper functions like
  `metabase.test.data.sql-jdbc.execute/sequentially-execute-sql!` are now called with a `java.sql.Connection`
  instead of both a `DatabaseDefinition` and either `:server` or `:db` _context_; the appropriate connection type is
  created automatically and passed in the calling code. Update your method implementations and usages
  accordingly.

- Added method `metabase.test.data.interface/dataset-already-loaded?` to check if a test dataset has already been
  loaded. JDBC-based drivers have a default implementation that checks whether we can connect to the database; you
  may need to override this for drivers that don't actually physically create new databases in tests. You can check
  whether your JDBC-based driver works correctly using the default implementation by running the test
  `metabase.test.data.sql-jdbc-test/dataset-already-loaded?-test`.

- `metabase.test.data.sql.ddl/insert-rows-ddl-statements` has been renamed to
  `metabase.test.data.sql.ddl/insert-rows-dml-statements`, since `INSERT` is DML, not DDL. Please update your method
  implementations accordingly.

- The `:foreign-keys` driver feature has been removed. `:metadata/keys-constraints` should be used for drivers that
  support foreign key relationships reporting during sync. Implicit joins now depend on the `:left-join` feature
  instead. The default value is true for `:sql` based drivers. All join features are now enabled for `:sql` based
  drivers by default. Previously, those depended on the `:foreign-keys` feature. If your driver supports `:left-join`,
  the test for remapping and implicit joins will be now executed.

- The`:parameterized-sql` driver feature has been added to distinguish drivers that don't support parametrized SQL in
  tests. Currently, this is disabled only for `:sparksql`.

- The test methods `metabase.test.data.interface/supports-time-type?` and
  `metabase.test.data.interface/supports-timestamptz-type?` have been removed and replaced by the features
  `:test/time-type` and `:test/timestamptz-type` respectively. If you implemented these methods, replace
  implementations with implementations of `metabase.driver/database-supports?` for your driver and the equivalent
  feature keyword instead.

- Drivers that use `metabase.driver.sql.query-processor/->honeysql` can implement
  `:metabase.driver.sql.query-processor/nfc-path` to include the nfc-path in the field identifier. So that record-like
  fields can be referenced with `<table>.<record>.<record-field>`. See `bigquery-cloud-sdk` for an example. Defaults to `nil` to indicate that the path should not be part of the identifier.

- `:test/dynamic-dataset-loading` feature has been added. It enables drivers to bail out of tests that require
  creation of new, not pre-loaded, dataset during test run time.

- The `:temporal/requires-default-unit` feature has been added. It should be false for most drivers, but it's necessary
  for a few (like the old, pre-JDBC Druid driver) to find all temporal field refs and put a `:temporal-unit :default` on them.
  That default setting was previously done for all drivers, but it introduced some downstream issues, so now only those
  drivers which need it can set the feature.

## Metabase 0.50.17

- Added method `metabase.driver/incorporate-auth-provider-details` for driver specific behavior required to
  incorporate response of an auth-provider into the DB details. In most cases this means setting the :password
  and/or :username based on the auth-provider and its response.

## Metabase 0.50.16

- `:type/fingerprinting-unsupported` has been added in the `metabase.types` namespace. Similar to
  `:type/field-values-unsupported` for field values scanning, it is used to determine whether a specific field
  should have its fingerprint computed or not. At the time of writing that logic is performed in
  `metabase.sync.analyze.fingerprint/fields-to-fingerprint-base-clause`.

- `:type/Large` has been also been added in the `metabase.types` namespace. It can be used by driver authors to
  signal that a specific field contains large enough values to skip fingerprinting or field values scanning. It
  can be used for other purposes as well in the future. Examples include Oracle CLOB or Postgres JSON columns.

## Metabase 0.50.0

- The Metabase `metabase.mbql.*` namespaces have been moved to `metabase.legacy-mbql.*`. You probably didn't need to
  use these namespaces in your driver, but if you did, please update them.

- The multimethod `metabase.driver/truncate!` has been added. This method is used to delete a table's rows in the most
  efficient way possible. This is currently only required for drivers that support the `:uploads` feature, and has
  a default implementation for JDBC-based drivers.

- New feature `:window-functions/cumulative` has been added. Drivers that implement this method are expected to
  implement the cumulative sum (`:cum-sum`) and cumulative count (`:cum-count`) aggregation clauses in their native
  query language. For non-SQL drivers (drivers not based on our `:sql` or `:sql-jdbc` drivers), this feature flag is
  set to `false` by default; the old (broken) post-processing implementations of cumulative aggregations will continue
  to be used. (See issues [#13634](https://github.com/metabase/metabase/issues/13634) and
  [#15118](https://github.com/metabase/metabase/issues/15118) for more information on why the old implementation is
  broken.)

  Non-SQL drivers should be updated to implement cumulative aggregations natively if possible.

  The SQL implementation uses `OVER (...)` expressions. It will automatically move `GROUP BY` expressions like
  `date_trunc()` into a `SUBSELECT` so fussy databases like BigQuery can reference plain column identifiers. The
  actual SQL generated will look something like

  ```sql
  SELECT
    created_at_month,
    sum(sum(total) OVER (ORDER BY created_at_month ROWS UNBOUNDED PRECEDING) AS cumulative_sum
  FROM (
    SELECT
      date_trunc('month', created_at) AS created_at_month,
      total
    FROM
      my_table
    ) source
  GROUP BY
    created_at_month
  ORDER BY
    created_at_month
  ```

  Non-SQL drivers can use
  `metabase.query-processor.util.transformations.nest-breakouts/nest-breakouts-in-stages-with-window-aggregation`
  if they want to leverage the same query transformation. See the default `:sql` implementation of
  `metabase.driver.sql.query-processor/preprocess` for an example of using this transformation when needed.

  You can run the new tests in `metabase.query-processor-test.cumulative-aggregation-test` to verify that your driver
  implementation is working correctly.

- `metabase.driver.common/class->base-type` no longer supports Joda Time classes. They have been deprecated since 2019.

- New feature `:window-functions/offset` has been added to signify that a driver supports the new MBQL `:offset`
  clause (equivalent of SQL `lead` and `lag` functions). This is enabled by default for `:sql` and `:sql-jdbc`-based
  drivers. Other drivers should add an implementation for this clause and enable the feature flag.

- `:type/field-values-unsupported` was added in `metabase.types` namespace. It is used in field values computation
  logic, to determine whether a specific field should have its field values computed or not. At the time of writing
  that is performed in `metabase.models.field-values/field-should-have-field-values?`. Deriving from it, driver
  developers have a way to out of field values computation for fields that are incompatible with the query used for
  computation. Example could be Druid's `COMPLEX<JSON>` database type fields. See the `:druid-jdbc` implementation
  of `sql-jdbc.sync/database-type->base-type` in the `metabase.driver.druid-jdbc` and derivations in the
  `metabase.types` namespace for an example.

- New feature `:metadata/key-constraints` has been added to signify that a driver support defining and enforcing foreign
  key constraints at the schema level. This is a different, stronger condition than `:foreign-keys`. Some databases
  (Presto, Athena, etc.) support _querying_ over foreign key relationships (`:foreign-keys`) but do not track or enforce
  those relationships in the schema. Defaults to `true` in `:sql` and `:sql-jdbc` drivers; set to `false` in the
  first-party SparkSQL, Presto and Athena drivers.

- New feature `:connection/multiple-databases` has been added to indicate whether a _connection_ to this driver
  corresponds to multiple databases or just one. The default is `false`, where a connection specifies a single database.
  This is the common case for classic relational DBs like Postgres, and some cloud databases. In contrast, a driver like
  Athena sets this to `true` because it connects to an S3 bucket and treats each file within it as a database.

- New feature `:identifiers-with-spaces` has been added to indicate where a driver supports identifiers like table or
  column names that contains a space character. Defaults to `false`.

- New feature `:uuid-type` has been added to indicate that this database can distinguish and filter against UUIDs.
  Only a few database support native UUID types. The default is `false`.

## Metabase 0.49.22

- A new optional method `metabase.driver.sql/json-field-length` has been added. It should be implemented for all
  drivers that derive from `:sql` and support the `:nested-field-columns` feature. If implemented, Metabase will skip
  querying large JSON values during the "sync-fields" step that could otherwise slow down the inference of nested
  field columns and cause Metabase to run out of heap space.

## Metabase 0.49.9

- Another driver feature has been added: `upload-with-auto-pk`. It only affects drivers that support `uploads`, and
  is optional to support. Drivers support this feature by default, and can choose not to support it if there is no way
  to create a table with an auto-incrementing integer column. The driver can override the default using
  `driver/database-supports?`.

## Metabase 0.49.1

- Another driver feature has been added: `describe-fields`. If a driver opts-in to supporting this feature, The
  multimethod `metabase.driver/describe-fields` must be implemented, as a replacement for
  `metabase.driver/describe-table`.

- The multimethod `metabase.driver.sql-jdbc.sync.describe-table/describe-fields-sql` has been added. The method needs
  to be implemented if the driver supports `describe-fields` and you want to use the default JDBC implementation of
  `metabase.driver/describe-fields`.

## Metabase 0.49.0

- The multimethod `metabase.driver/describe-table-fks` has been deprecated in favor of `metabase.driver/describe-fks`.
  `metabase.driver/describe-table-fks` will be removed in 0.52.0.

- The multimethod `metabase.driver/describe-fks` has been added. The method needs to be implemented if the database
  supports the `:foreign-keys` and `:describe-fks` features. It replaces the `metabase.driver/describe-table-fks`
  method, which is now deprecated.

- The multimethod `metabase.driver.sql-jdbc.sync.describe-table/describe-fks-sql` has been added. The method needs
  to be implemented if you want to use the default JDBC implementation of `metabase.driver/describe-fks`.

- The multimethod `metabase.driver/alter-columns!` has been added. This method is used to alter a table's columns in the
  database. This is currently only required for drivers that support the `:uploads` feature, and has a default
  implementation for JDBC-based drivers.

- The multimethod `metabase.driver.sql-jdbc.sync.interface/alter-columns-sql` has been added. The method
  allows you to customize the query used by the default JDBC implementation of `metabase.driver/alter-columns!`.

- The multimethod `metabase.driver.sql-jdbc.sync.interface/current-user-table-privileges` has been added.
  JDBC-based drivers can implement this to improve the performance of the default SQL JDBC implementation of
  `metabase.driver/describe-database`. It needs to be implemented if the database supports the `:table-privileges`
  feature and the driver is JDBC-based.

- The multimethod `metabase.driver/create-table!` can take an additional optional map with an optional key `primary-key`.
  `metabase.driver/upload-type->database-type` must also be changed, so that if
  `:metabase.upload/auto-incrementing-int-pk` is provided as the `upload-type` argument, the function should return a
  type without the primary-key constraint included. See PR [#22166](https://github.com/metabase/metabase/pull/37505/)
  for more information. These changes only need to be implemented if the database supports the `:uploads` feature.

- The multimethod `metabase.driver/create-auto-pk-with-append-csv?` has been added. The method only needs to be
  implemented if the database supported the `:uploads` feature in 47 or earlier, and should return true if so.

- The multimethod `metabase.driver/add-columns!` has been added. This method is used to add columns to a table in the
  database. It only needs to be implemented if the database supported the `:uploads` feature in 47 or earlier.

- A new driver method has been added `metabase.driver/describe-table-indexes` along with a new feature `:index-info`.
  This method is used to get a set of column names that are indexed or are the first columns in a composite index.

- `metabase.util.honeysql-extensions`, deprecated in 0.46.0, has been removed. SQL-based drivers using Honey SQL 1
  are no longer supported. See 0.46.0 notes for more information.
  `metabase.driver.sql.query-processor/honey-sql-version` is now deprecated and no longer called. All drivers are
  assumed to use Honey SQL 2.

- The method `metabase.driver.sql.parameters.substitution/align-temporal-unit-with-param-type` is now deprecated.
  Use `metabase.driver.sql.parameters.substitution/align-temporal-unit-with-param-type-and-value` instead,
  which has access to `value` and therefore provides more flexibility for choosing the right conversion unit.

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

  - `qp.store/database`
  - `qp.store/table`
  - `qp.store/field`

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
  metadata functions above and the helper _metadata providers_ in `metabase.lib`, `metabase.lib.test-util`, and
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
  An implementation of the multimethod `metabase.driver/database-supports?` for `:schemas` is required only if the
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

- The multimethod `metabase.driver.sql-jdbc.sync.describe-table/get-table-pks` is changed to return a vector instead
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
   databases can recognize expressions as being the same thing only when they are _not_ parameterized:

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

**Note: we expect these breaking changes to be fixed before 0.46.0 ships. This will be updated if they are.**

The classes `metabase.util.honeysql_extensions.Identifier` and `metabase.util.honeysql_extensions.TypedHoneySQLForm`
have been moved to `metabase.util.honey_sql_1.Identifier` and `metabase.util.honey_sql_1.TypedHoneySQLForm`,
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
  accessing or manipulating this map directly. Drivers deriving from `:sql` implementing `->honeysql` for `[<driver> :expression]` may need to be updated. A utility function, `metabase.mbql.util/expression-with-name`, has been
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
  `metabase.driver.sql-jdbc.sync.interface/syncable-schemas`. It serves a similar purpose, except that it's also
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

- `metabase.driver.sql.query-processor/*field-options*` is now unused and is no longer bound automatically. If you need field options for some reason, see our SQL Server driver for an example on how to create it.

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

| Version | Wiki page                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------- |
| 0.41.0  | [changes](https://github.com/metabase/metabase/wiki/What's-new-in-0.41.0-for-Metabase-driver-authors) |
| 0.40.0  | No changes.                                                                                           |
| 0.39.0  | No changes.                                                                                           |
| 0.38.0  | [changes](https://github.com/metabase/metabase/wiki/What's-new-in-0.38.0-for-Metabase-driver-authors) |
| 0.37.0  | [changes](https://github.com/metabase/metabase/wiki/What's-new-in-0.37.0-for-Metabase-driver-authors) |
| 0.36.0  | [changes](https://github.com/metabase/metabase/wiki/What's-new-in-0.36.0-for-Metabase-driver-authors) |
| 0.35.0  | [changes](https://github.com/metabase/metabase/wiki/What's-new-in-0.35.0-for-Metabase-driver-authors) |
