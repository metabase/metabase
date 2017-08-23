(ns metabase.sync.fetch-metadata
  "Fetch metadata functions fetch 'snapshots' of the schema for a data warehouse database, including
   information about tables, schemas, and fields, and their types.
   For example, with SQL databases, these functions use the JDBC DatabaseMetaData to get this information."
  (:require [metabase.driver :as driver]
            [metabase.sync.interface :as i]
            [schema.core :as s])
  (:import [org.joda.time DateTime]))

(s/defn ^:always-validate db-metadata :- i/DatabaseMetadata
  "Get basic Metadata about a DATABASE and its Tables. Doesn't include information about the Fields."
  [database :- i/DatabaseInstance]
  (driver/describe-database (driver/->driver database) database))

(s/defn ^:always-validate table-metadata :- i/TableMetadata
  "Get more detailed information about a TABLE belonging to DATABASE. Includes information about the Fields."
  [database :- i/DatabaseInstance, table :- i/TableInstance]
  (driver/describe-table (driver/->driver database) database table))

(s/defn ^:always-validate fk-metadata :- i/FKMetadata
  "Get information about the foreign keys belonging to TABLE."
  [database :- i/DatabaseInstance, table :- i/TableInstance]
  (let [driver (driver/->driver database)]
    (when (driver/driver-supports? driver :foreign-keys)
      (driver/describe-table-fks driver database table))))

(s/defn ^:always-validate db-timezone :- i/TimeZoneId
  [database :- i/DatabaseInstance]
  (let [db-time  ^DateTime (driver/current-db-time (driver/->driver database) database)]
    (-> db-time .getChronology .getZone .getID)))
