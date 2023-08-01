(ns metabase.sync
  "Combined functions for running the entire Metabase sync process.
   This delegates to a few distinct steps, which in turn are broken out even further:

   1.  Sync Metadata      (`metabase.sync.sync-metadata`)
   2.  Analysis           (`metabase.sync.analyze`)
   3.  Cache Field Values (`metabase.sync.field-values`)

   In the near future these steps will be scheduled individually, meaning those functions will
   be called directly instead of calling the `sync-database!` function to do all three at once."
  (:require
   [metabase.driver.h2 :as h2]
   [metabase.driver.util :as driver.u]
   [metabase.models.field :as field]
   [metabase.models.table :as table]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.analyze.fingerprint :as fingerprint]
   [metabase.sync.field-values :as field-values]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.util :as sync-util]
   [schema.core :as s])
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
  (doto table
    (sync-metadata/sync-table-metadata!)
    (analyze/analyze-table!)
    (field-values/update-field-values-for-table!)
    (sync-util/set-initial-table-sync-complete!)))

(s/defn refingerprint-field!
  "Refingerprint a field, usually after its type changes. Checks if can connect to database, returning
  `:sync/no-connection` if not."
  [field :- i/FieldInstance]
  (let [table (field/table field)
        database (table/database table)]
    ;; it's okay to allow testing H2 connections during sync. We only want to disallow you from testing them for the
    ;; purposes of creating a new H2 database.
    (if (binding [h2/*allow-testing-h2-connections* true]
          (driver.u/can-connect-with-details? (:engine database) (:details database)))
      (sync-util/with-error-handling (format "Error refingerprinting field %s"
                                             (sync-util/name-for-logging field))
        (fingerprint/refingerprint-field field))
      :sync/no-connection)))
