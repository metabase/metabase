(ns metabase.sync.fetch-metadata
  "Fetch metadata functions fetch 'snapshots' of the schema for a data warehouse database, including information about
  tables, schemas, and fields, and their types. For example, with SQL databases, these functions use the JDBC
  DatabaseMetaData to get this information."
  (:require
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.util :as driver.u]
   [metabase.sync.interface :as i]
   [metabase.util.malli :as mu]
   [metabase.util.malli.fn :as mu.fn]))

(mu/defn db-metadata :- i/DatabaseMetadata
  "Get basic Metadata about a `database` and its Tables. Doesn't include information about the Fields."
  [database :- i/DatabaseInstance]
  (driver/describe-database (driver.u/database->driver database) database))

(mu/defn table-metadata :- i/TableMetadata
  "Get more detailed information about a `table` belonging to `database`. Includes information about the Fields."
  [database :- i/DatabaseInstance
   table    :- i/TableInstance]
  (driver/describe-table (driver.u/database->driver database) database table))

(mu/defn fk-metadata
  "Returns a reducible collection of maps [[i/FastFKMetadataEntry]] representing foreign key relationships of `database`.
  Only supported for databases that support `fast-sync-fks`."
  [database :- i/DatabaseInstance & {:as args}]
  (cond->> (driver/describe-fks (driver.u/database->driver database) database args)
    ;; Validate the output against the schema, except in prod.
    ;; This is a workaround for the fact that [[mu/defn]] can't check reducible collections yet
    (not config/is-prod?)
    (eduction (map #(mu.fn/validate-output {} i/FastFKMetadataEntry %)))))

(mu/defn table-fk-metadata :- i/FKMetadata
  "Get information about the foreign keys belonging to `table`."
  [database :- i/DatabaseInstance
   table    :- i/TableInstance]
  (let [driver (driver.u/database->driver database)]
    (when (driver/database-supports? driver :foreign-keys database)
      (driver/describe-table-fks driver database table))))

(mu/defn nfc-metadata :- [:maybe [:set i/TableMetadataField]]
  "Get information about the nested field column fields within `table`."
  [database :- i/DatabaseInstance
   table    :- i/TableInstance]
  (let [driver (driver.u/database->driver database)]
    (when (driver/database-supports? driver :nested-field-columns database)
      (sql-jdbc.sync/describe-nested-field-columns driver database table))))

(mu/defn index-metadata :- [:maybe i/TableIndexMetadata]
  "Get information about the indexes belonging to `table`."
  [database :- i/DatabaseInstance
   table    :- i/TableInstance]
  (driver/describe-table-indexes (driver.u/database->driver database) database table))
