(ns metabase.sync.fetch-metadata
  "Fetch metadata functions fetch 'snapshots' of the schema for a data warehouse database, including information about
  tables, schemas, and fields, and their types. For example, with SQL databases, these functions use the JDBC
  DatabaseMetaData to get this information."
  (:require
   [clojure.set :as set]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.fn :as mu.fn]
   [toucan2.core :as t2]))

(defn- do-with-effective-table
  "Call `f` with `table`'s `{:db :schema :name}` coordinates."
  [_database table f]
  (f {:db nil :schema (:schema table) :name (:name table)}))

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
  (let [driver (driver.u/database->driver database)]
    (do-with-effective-table
     database table
     (fn [{effective-schema :schema effective-name :name}]
       (let [effective-table (assoc table :schema effective-schema :name effective-name)]
         (cond-> fields
           (driver.u/supports? driver :nested-field-columns database)
           (set/union ((requiring-resolve 'metabase.driver.sql-jdbc.sync/describe-nested-field-columns) driver database effective-table))))))))

(mu/defn table-fields-metadata :- [:set i/TableMetadataField]
  "Fetch metadata about Fields belonging to a given `table` directly from an external database by calling its driver's
  implementation of [[driver/describe-table]], or [[driver/describe-fields]] if implemented. Also includes nested field
  column metadata."
  [database :- i/DatabaseInstance
   table    :- i/TableInstance]
  (log-if-error "table-fields-metadata"
    (let [driver (driver.u/database->driver database)]
      (do-with-effective-table
       database table
       (fn [{effective-schema :schema effective-name :name}]
         (let [effective-table (assoc table :schema effective-schema :name effective-name)]
           (if (driver.u/supports? driver :describe-fields database)
             (set (driver/describe-fields driver
                                          database
                                          :table-names [effective-name]
                                          :schema-names [effective-schema]))
             (:fields (driver/describe-table driver database effective-table)))))))))

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

(mu/defn fk-metadata
  "Effectively a wrapper for [[metabase.driver/describe-fks]] that also validates the output against the schema.

  In workspace mode, expands `:schema-names` to include workspace-isolation schemas so
  the warehouse driver finds FKs on the physical tables that back canonical Tables, then
  back-translates workspace-side identifiers in the result so the rows match canonical
  Table rows in app-db."
  [database     :- i/DatabaseInstance
   & {:as args} :- ::driver/describe-fks.options]
  (log-if-error "fk-metadata"
    (let [driver (driver.u/database->driver database)]
      (when (driver.u/supports? driver :metadata/key-constraints database)
        (let [rows (into [] (driver/describe-fks driver
                                                 (lib-be/instance->metadata database :metadata/database)
                                                 args))]
          (cond->> rows
            ;; This is a workaround for the fact that [[mu/defn]] can't check reducible collections yet
            (mu.fn/instrument-ns? *ns*)
            (eduction (map #(mu.fn/validate-output {} i/FKMetadataEntry %)))))))))

(mu/defn index-metadata :- [:maybe i/TableIndexMetadata]
  "Get information about the indexes belonging to `table`. In workspace mode,
  redirects to the isolated warehouse table so describe-table-indexes asks the
  warehouse about the physical table that backs this canonical Table row."
  [database :- i/DatabaseInstance
   table    :- i/TableInstance]
  (log-if-error "index-metadata"
    (do-with-effective-table
     database table
     (fn [{effective-schema :schema effective-name :name}]
       (let [effective-table (assoc table :schema effective-schema :name effective-name)]
         (driver/describe-table-indexes (driver.u/database->driver database) database effective-table))))))
