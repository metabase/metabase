(ns metabase.sync.fetch-metadata
  "Fetch metadata functions fetch 'snapshots' of the schema for a data warehouse database, including information about
  tables, schemas, and fields, and their types. For example, with SQL databases, these functions use the JDBC
  DatabaseMetaData to get this information."
  (:require
   [clojure.set :as set]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.fn :as mu.fn]
   [toucan2.core :as t2]))

(defenterprise workspace-remap-schema+name
  "In workspace mode, a Table row at `(from-schema, from-name)` may be backed by a
  physically-different warehouse table at `(to-schema, to-name)` recorded in
  `table_remapping`. This hook returns `[to-schema to-name]` when a remapping
  exists so sync asks the driver about the isolated warehouse location; returns
  nil otherwise (OSS fallback) so the driver is queried at the logical identity."
  metabase-enterprise.workspaces.table-remapping
  [_db-id _schema _name]
  nil)

(defn- effective-schema+name
  "Pair used when querying the driver for a Table's fields. Lets workspace mode
  redirect to the isolated warehouse table while the app-db row keeps its
  logical identity."
  [database-id schema table-name]
  (or (workspace-remap-schema+name database-id schema table-name)
      [schema table-name]))

(defmacro log-if-error
  "Logs an error message if an exception is thrown while executing the body."
  {:style/indent 1}
  [function-name & body]
  `(try
     ~@body
     (catch Throwable e#
       (log/errorf e# "Error while fetching metadata with '%s'" ~function-name)
       (throw e#))))

(mu/defn db-metadata :- i/DatabaseMetadata
  "Get basic Metadata about a `database` and its Tables. Doesn't include information about the Fields."
  [database :- i/DatabaseInstance]
  (log-if-error "db-metadata"
    (let [driver (driver.u/database->driver database)]
      (driver/describe-database driver database))))

(defn include-nested-fields-for-table
  "Add nested-field-columns for table to set of fields."
  [fields database table]
  (let [driver                (driver.u/database->driver database)
        [eff-schema eff-name] (effective-schema+name (:id database) (:schema table) (:name table))
        effective-table       (assoc table :schema eff-schema :name eff-name)]
    (cond-> fields
      (driver.u/supports? driver :nested-field-columns database)
      (set/union ((requiring-resolve 'metabase.driver.sql-jdbc.sync/describe-nested-field-columns) driver database effective-table)))))

(mu/defn table-fields-metadata :- [:set i/TableMetadataField]
  "Fetch metadata about Fields belonging to a given `table` directly from an external database by calling its driver's
  implementation of [[driver/describe-table]], or [[driver/describe-fields]] if implemented. Also includes nested field
  column metadata."
  [database :- i/DatabaseInstance
   table    :- i/TableInstance]
  (log-if-error "table-fields-metadata"
    (let [driver               (driver.u/database->driver database)
          [eff-schema eff-name] (effective-schema+name (:id database) (:schema table) (:name table))
          effective-table       (assoc table :schema eff-schema :name eff-name)
          result (if (driver.u/supports? driver :describe-fields database)
                   (set (driver/describe-fields driver
                                                database
                                                :table-names [eff-name]
                                                :schema-names [eff-schema]))
                   (:fields (driver/describe-table driver database effective-table)))]
      result)))

(defn- describe-fields-using-describe-table
  "Replaces [[metabase.driver/describe-fields]] for drivers that haven't implemented it. Uses [[driver/describe-table]]
  instead. Also includes nested field column metadata."
  [_driver database & {:keys [schema-names table-names]}]
  ;; Realize everything in a vector to close the connection. But only keep the ids because the maps can hog memory.
  (let [table-ids (mapv :id (sync-util/reducible-sync-tables database :schema-names schema-names :table-names table-names))]
    (eduction
     (mapcat (fn [table-id]
               (try
                 (let [table (t2/select-one :model/Table table-id)
                       table-fields (table-fields-metadata database table)]
                  ;; Realize the fields from this table (from `table-fields-metadata`) immediately to ensure the
                  ;; connection is closed before moving to the next table.
                   (mapv #(assoc % :table-schema (:schema table) :table-name (:name table))
                         table-fields))
                 (catch Throwable e
                   (log/warn e (str "Could not fetch fields from table " table-id))
                   nil))))
     table-ids)))

(mu/defn fields-metadata
  "Effectively a wrapper for [[metabase.driver/describe-fields]] that also validates the output against the schema.
  If the driver doesn't support [[metabase.driver/describe-fields]] it uses [[driver/describe-table]] instead.
  This will be deprecated in "
  [database :- i/DatabaseInstance & {:as args}]
  (log-if-error "fields-metadata"
    (let [driver             (driver.u/database->driver database)
          describe-fields-fn (if (driver.u/supports? driver :describe-fields database)
                               (do (log/debug "Using `describe-fields` (fast sync) to fetch fields metadata.")
                                   driver/describe-fields)
                               ;; In a future version we may remove [[driver/describe-table]]
                               ;; and we'll just use [[driver/describe-fields]] here
                               (do (log/debug "Using `describe-table` (legacy sync) to fetch fields metadata.")
                                   describe-fields-using-describe-table))]
      (cond->> (describe-fields-fn driver database args)
        ;; This is a workaround for the fact that [[mu/defn]] can't check reducible collections yet
        (mu.fn/instrument-ns? *ns*)
        (eduction (map #(mu.fn/validate-output {} i/FieldMetadataEntry %)))))))

(defn- describe-fks-using-describe-table-fks
  "Replaces [[metabase.driver/describe-fks]] for drivers that haven't implemented it. Uses [[driver/describe-table-fks]]
  which is deprecated."
  [driver database & {:keys [schema-names table-names]}]
  (let [tables (sync-util/reducible-sync-tables database :schema-names schema-names :table-names table-names)]
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
  [database :- i/DatabaseInstance & {:as args}]
  (log-if-error "fk-metadata"
    (let [driver (driver.u/database->driver database)]
      (when (driver.u/supports? driver :metadata/key-constraints database)
        (let [describe-fks-fn (if (driver.u/supports? driver :describe-fks database)
                                driver/describe-fks
                                ;; In version 52 we'll remove [[driver/describe-table-fks]]
                                ;; and we'll just use [[driver/describe-fks]] here
                                describe-fks-using-describe-table-fks)]
          (cond->> (describe-fks-fn driver database args)
            ;; This is a workaround for the fact that [[mu/defn]] can't check reducible collections yet
            (mu.fn/instrument-ns? *ns*)
            (eduction (map #(mu.fn/validate-output {} i/FKMetadataEntry %)))))))))

(mu/defn index-metadata :- [:maybe i/TableIndexMetadata]
  "Get information about the indexes belonging to `table`."
  [database :- i/DatabaseInstance
   table    :- i/TableInstance]
  (log-if-error "index-metadata"
    (driver/describe-table-indexes (driver.u/database->driver database) database table)))
