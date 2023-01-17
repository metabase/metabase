(ns metabase.sync
  "Combined functions for running the entire Metabase sync process.
   This delegates to a few distinct steps, which in turn are broken out even further:

   1.  Sync Metadata      (`metabase.sync.sync-metadata`)
   2.  Analysis           (`metabase.sync.analyze`)
   3.  Cache Field Values (`metabase.sync.field-values`)

   In the near future these steps will be scheduled individually, meaning those functions will
   be called directly instead of calling the `sync-database!` function to do all three at once."
  (:require
   [clojure.tools.logging :as log]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.field :as field]
   [metabase.models.table :as table]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.analyze.fingerprint :as fingerprint]
   [metabase.sync.field-values :as field-values]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [schema.core :as s]
   [toucan.db :as db])
  (:import
   (java.time.temporal Temporal)))

(def SyncDatabaseResults
  "Schema for results returned from `sync-database!`"
  [{:start-time Temporal
    :end-time   Temporal
    :name       s/Str
    :steps      [sync-util/StepNameWithMetadata]}])

(s/defn sync-database! :- SyncDatabaseResults
  "Perform all the different sync operations synchronously for `database`.

  By default, does a `:full` sync that performs all the different sync operations consecutively. You may instead
  specify only a `:schema` sync that will sync just the schema but skip analysis.

  Please note that this function is *not* what is called by the scheduled tasks; those call different steps
  independently. This function is called when a Database is first added."
  {:style/indent 1}
  ([database]
   (sync-database! database nil))

  ([database                         :- i/DatabaseInstance
    {:keys [scan], :or {scan :full}} :- (s/maybe {(s/optional-key :scan) (s/maybe (s/enum :schema :full))})]
   (sync-util/sync-operation :sync database (format "Sync %s" (sync-util/name-for-logging database))
     (mapv (fn [[f step-name]] (assoc (f database) :name step-name))
           (filter
             some?
             [;; First make sure Tables, Fields, and FK information is up-to-date
              [sync-metadata/sync-db-metadata! "metadata"]
              ;; Next, run the 'analysis' step where we do things like scan values of fields and update semantic types
              ;; accordingly
              (when (= scan :full)
                [analyze/analyze-db! "analyze"])
              ;; Finally, update cached FieldValues
              (when (= scan :full)
                [field-values/update-field-values! "field-values"])])))))

(s/defn sync-table!
  "Perform all the different sync operations synchronously for a given `table`. Since often called on a sequence of
  tables, caller should check if can connect."
  [table :- i/TableInstance]
  (sync-metadata/sync-table-metadata! table)
  (analyze/analyze-table! table)
  (field-values/update-field-values-for-table! table))

(s/defn refingerprint-field!
  "Refingerprint a field, usually after its type changes. Checks if can connect to database, returning
  `:sync/no-connection` if not."
  [field :- i/FieldInstance]
  (let [table (field/table field)
        database (table/database table)]
    (if (driver.u/can-connect-with-details? (:engine database) (:details database))
      (sync-util/with-error-handling (format "Error refingerprinting field %s"
                                             (sync-util/name-for-logging field))
        (fingerprint/refingerprint-field field))
      :sync/no-connection)))

(s/defn sync-new-table!
  "Given the name and schema for a new table (one that exists in the user's db but not as a Metabase table), add the
  table to Metabase and sync the new table's metadata."
  [db :- i/DatabaseInstance
   {:keys [schema-name table-name]} :- {:schema-name s/Str
                                        :table-name  s/Str}]
  (let [normalize (fn [{:keys [schema name]}]
                               (cond-> {:name (u/lower-case-en name)}
                                       schema
                                       (assoc :schema (u/lower-case-en schema))))
        {db-tables :tables} (driver/describe-database (driver.u/database->driver db) db)
        target-table #{(normalize {:schema schema-name :name table-name})}]
    (if-let [new-table (some
                     (fn [db-table]
                       (when (target-table (normalize db-table))
                         db-table))
                     db-tables)]
      (try
        (let [table (sync-tables/create-or-reactivate-table! db new-table)]
          (sync-table! table))
        (catch Exception _
          (log/warn (trs "Table ''{0}'' could not be added. It may already exist." table-name))))
      (log/debug (trs "Table ''{0}'' does not exist or you do not have permission to view it." table-name)))))
