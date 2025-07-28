(ns metabase.sync.fetch-metadata
  "Fetch metadata functions fetch 'snapshots' of the schema for a data warehouse database, including information about
  tables, schemas, and fields, and their types. For example, with SQL databases, these functions use the JDBC
  DatabaseMetaData to get this information."
  (:require
   [clojure.set :as set]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.fn :as mu.fn]))

(defmacro log-if-error
  "Logs an error message if an exception is thrown while executing the body."
  {:style/indent 1}
  [function-name & body]
  `(try
     ~@body
     (catch Throwable e#
       (log/errorf e# "Error while fetching metdata with '%s'" ~function-name)
       (throw e#))))

(mu/defn db-metadata :- i/DatabaseMetadata
  "Get basic Metadata about a `database` and its Tables. Doesn't include information about the Fields."
  [database :- i/DatabaseInstance]
  (log-if-error "db-metadata"
    (driver/describe-database (driver.u/database->driver database) database)))

(defn include-nested-fields-for-table
  "Add nested-field-columns for table to set of fields."
  [fields database table]
  (let [driver (driver.u/database->driver database)]
    (cond-> fields
      (driver.u/supports? driver :nested-field-columns database)
      (set/union ((requiring-resolve 'metabase.driver.sql-jdbc.sync/describe-nested-field-columns) driver database table)))))

(mu/defn table-fields-metadata :- [:set i/TableMetadataField]
  "Fetch metadata about Fields belonging to a given `table` directly from an external database by calling its driver's
  implementation of [[driver/describe-table]], or [[driver/describe-fields]] if implemented. Also includes nested field
  column metadata."
  [database :- i/DatabaseInstance
   table    :- i/TableInstance]
  (log-if-error "table-fields-metadata"
    (let [driver (driver.u/database->driver database)
          result (if (driver.u/supports? driver :describe-fields database)
                   (set (driver/describe-fields driver
                                                database
                                                :table-names [(:name table)]
                                                :schema-names [(:schema table)]))
                   (:fields (driver/describe-table driver database table)))]
      result)))

(defn- describe-fields-using-describe-table
  "Replaces [[metabase.driver/describe-fields]] for drivers that haven't implemented it. Uses [[driver/describe-table]]
  instead. Also includes nested field column metadata."
  [_driver database & {:keys [schema-names table-names]}]
  (let [tables (sync-util/reducible-sync-tables database :schema-names schema-names :table-names table-names)]
    (eduction
     (mapcat (fn [table]
               (for [x (table-fields-metadata database table)]
                 (assoc x :table-schema (:schema table) :table-name (:name table)))))
     tables)))

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

(mu/defn routine-metadata
  "Get information about stored procedures and functions in the database."
  [database :- i/DatabaseInstance & {:as args}]
  (log-if-error "routine-metadata"
    (let [driver (driver.u/database->driver database)]
      (log/infof "Checking routine support for driver %s: %s" driver (driver.u/supports? driver :describe-routines database))
      (when (driver.u/supports? driver :describe-routines database)
        ;; Return the results from driver
        (let [results (driver/describe-routines driver database args)]
          (log/infof "Driver returned %d routines" (count results))
          results)))))
