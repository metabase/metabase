(ns metabase.sync.fetch-metadata
  "Fetch metadata functions fetch 'snapshots' of the schema for a data warehouse database, including information about
  tables, schemas, and fields, and their types. For example, with SQL databases, these functions use the JDBC
  DatabaseMetaData to get this information."
  (:require [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.sync.interface :as i]
            [schema.core :as s]))

(s/defn db-metadata :- i/DatabaseMetadata
  "Get basic Metadata about a `database` and its Tables. Doesn't include information about the Fields."
  [database :- i/DatabaseInstance]
  (driver/describe-database (driver.u/database->driver database) database))

(s/defn table-metadata :- i/TableMetadata
  "Get more detailed information about a `table` belonging to `database`. Includes information about the Fields."
  [database :- i/DatabaseInstance, table :- i/TableInstance]
  (driver/describe-table (driver.u/database->driver database) database table))

(s/defn fk-metadata :- i/FKMetadata
  "Get information about the foreign keys belonging to `table`."
  [database :- i/DatabaseInstance, table :- i/TableInstance]
  (let [driver (driver.u/database->driver database)]
    (when (driver/supports? driver :foreign-keys)
      (driver/describe-table-fks driver database table))))
