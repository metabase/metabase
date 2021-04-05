(ns metabase.driver.sql-jdbc.sync.interface
  (:require [metabase.driver :as driver]))

(defmulti active-tables
  "Return a reducible sequence of maps containing information about the active tables/views, collections, or equivalent
  that currently exist in a database. Each map should contain the key `:name`, which is the string name of the table.
  For databases that have a concept of schemas, this map should also include the string name of the table's `:schema`.

  Two different implementations are provided in this namespace: `fast-active-tables` (the default), and
  `post-filtered-active-tables`. You should be fine using the default, but refer to the documentation for those
  functions for more details on the differences.

  `metabase` is an instance of `DatabaseMetaData`."
  {:arglists '([driver ^java.sql.Connection connection])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti excluded-schemas
  "Return set of string names of schemas to skip syncing tables from."
  {:arglists '([driver])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti have-select-privilege?
  "Check if we have SELECT privileges for given `table`."
  {:arglists '([driver ^java.sql.Connection connection ^String table-schema ^String table-name])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti syncable-schemas
  "Return a reducible sequence of string names of schemas that should be synced for the given database. Schemas for
  which the current DB user has no `SELECT` permissions should be filtered out. The default implementation will fetch
  a sequence of all schema names from the JDBC database metadata and filter out any schemas in `excluded-schemas`."
  {:added "0.39.0", :arglists '([driver ^java.sql.Connection connection ^java.sql.DatabaseMetaData metadata])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti database-type->base-type
  "Given a native DB column type (as a keyword), return the corresponding `Field` `base-type`, which should derive from
  `:type/*`. You can use `pattern-based-database-type->base-type` in this namespace to implement this using regex
  patterns."
  {:arglists '([driver database-type])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti column->semantic-type
  "Attempt to determine the semantic-type of a field given the column name and native type. For example, the Postgres
  driver can mark Postgres JSON type columns as `:type/SerializedJSON` semantic type.

  `database-type` and `column-name` will be strings."
  {:arglists '([driver database-type column-name])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti fallback-metadata-query
  "SELECT columns from a given table so we can get column metadata. By default doesn't return any rows. This can be
  overriden because SQLite is silly and only returns column information for views if the query returns a non-zero
  number of rows.

    (fallback-metadata-query :postgres \"public\" \"my_table\")
    ;; -> [\"SELECT * FROM public.my_table WHERE 1 <> 1 LIMIT 0\"]"
  {:arglists '([driver schema table])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti db-default-timezone
  "JDBC-specific version of of `metabase.driver/db-default-timezone` that takes a `clojure.java.jdbc` connection spec
  rather than a set of DB details. If an implementation of this method is provided, it will be used automatically in
  the default `:sql-jdbc` implementation of `metabase.driver/db-default-timezone`.

  This exists so we can reuse this code with the application database without having to create a new Connection pool
  for the application DB."
  {:arglists '([driver jdbc-spec])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod db-default-timezone :sql-jdbc
  [_ _]
  nil)
