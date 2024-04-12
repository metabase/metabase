(ns metabase.sync.fetch-metadata
  "Fetch metadata functions fetch 'snapshots' of the schema for a data warehouse database, including information about
  tables, schemas, and fields, and their types. For example, with SQL databases, these functions use the JDBC
  DatabaseMetaData to get this information."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.util :as driver.u]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util.malli :as mu]
   [metabase.util.malli.fn :as mu.fn]))

(mu/defn db-metadata :- i/DatabaseMetadata
  "Get basic Metadata about a `database` and its Tables. Doesn't include information about the Fields."
  [database :- i/DatabaseInstance]
  (driver/describe-database (driver.u/database->driver database) database))

(mu/defn fields-metadata
  "Effectively a wrapper for [[metabase.driver/describe-fields]] that also validates the output against the schema."
  [database :- i/DatabaseInstance & {:as args}]
  (cond->> (driver/describe-fields (driver.u/database->driver database) database args)
    ;; This is a workaround for the fact that [[mu/defn]] can't check reducible collections yet
    (mu.fn/instrument-ns? *ns*)
    (eduction (map #(mu.fn/validate-output {} i/FieldMetadataEntry %)))))

(mu/defn table-fields-metadata :- [:set i/TableMetadataField]
  "Get more detailed information about a `table` belonging to `database`. Includes information about the Fields."
  [database :- i/DatabaseInstance
   table    :- i/TableInstance]
  (if (driver/database-supports? (driver.u/database->driver database) :describe-fields database)
    (set (fields-metadata database :table-names [(:name table)] :schema-names [(:schema table)]))
    (:fields (driver/describe-table (driver.u/database->driver database) database table))))

(defn backwards-compatible-describe-fks
  "Replaces [[metabase.driver/describe-fks]] for drivers that haven't implemented it. Uses [[driver/describe-table-fks]]
  which is deprecated."
  [driver database & {:keys [schema-names table-names]}]
  (let [tables (sync-util/db->reducible-sync-tables database :schema-names schema-names :table-names table-names)]
    (eduction
     (mapcat (fn [table]
               #_{:clj-kondo/ignore [:deprecated-var]}
               (for [x (driver/describe-table-fks driver database table)]
                 {:fk-table-name   (:name table)
                  :fk-table-schema (:schema table)
                  :fk-column-name  (:fk-column-name x)
                  :pk-table-name   (:name (:dest-table x))
                  :pk-table-schema (:schema (:dest-table x))
                  :pk-column-name  (:dest-column-name x)})))
     tables)))

(mu/defn fk-metadata
  "Effectively a wrapper for [[metabase.driver/describe-fks]] that also validates the output against the schema.
  If the driver doesn't support [[metabase.driver/describe-fks]] it uses [[driver/describe-table-fks]] instead.
  This will be deprecated in "
  [database :- i/DatabaseInstance & {:keys [schema-names table-names]}]
  (let [driver (driver.u/database->driver database)]
    (when (driver/database-supports? driver :foreign-keys database)
      (let [describe-fks-fn (if (driver/database-supports? driver :describe-fks database)
                              driver/describe-fks
                              ;; In version 52 we'll remove [[driver/describe-table-fks]]
                              ;; and we'll just use [[driver/describe-fks]] here
                              backwards-compatible-describe-fks)]
        (cond->> (describe-fks-fn (driver.u/database->driver database) database :schema-names schema-names :table-names table-names)
          ;; This is a workaround for the fact that [[mu/defn]] can't check reducible collections yet
          (mu.fn/instrument-ns? *ns*)
          (eduction (map #(mu.fn/validate-output {} i/FKMetadataEntry %))))))))

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
