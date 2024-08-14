(ns metabase.sync
  "Combined functions for running the entire Metabase sync process.
   This delegates to a few distinct steps, which in turn are broken out even further:

   1.  Sync Metadata      [[metabase.sync.sync-metadata]]
   2.  Analysis           [[metabase.sync.analyze]]
   3.  Cache Field Values [[metabase.sync.field-values]]

   In the near future these steps will be scheduled individually, meaning those functions will
   be called directly instead of calling the [[sync-database!]] function to do all three at once."
  (:require
   [metabase.driver.h2 :as h2]
   [metabase.driver.util :as driver.u]
   [metabase.models.field :as field]
   [metabase.models.table :as table]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.sync.field-values :as field-values]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.time.temporal Temporal)))

(def ^:private SyncDatabaseResults
  "Schema for results returned from [[sync-database!]]."
  [:maybe
   [:sequential
    [:map
     [:start-time (ms/InstanceOfClass Temporal)]
     [:end-time   (ms/InstanceOfClass Temporal)]
     [:name       :string]
     [:steps      [:maybe [:sequential sync-util/StepNameWithMetadata]]]]]])

(def ^:private phase->fn
  {:metadata     sync-metadata/sync-db-metadata!
   :analyze      analyze/analyze-db!
   :field-values field-values/update-field-values!})

(defn- scan-phases [scan]
  (if (not= :full scan)
    [:metadata]
    [:metadata :analyze :field-values]))

(defn- do-phase! [database phase]
  (let [f      (phase->fn phase)
        result (f database)]
    (if (instance? Throwable result)
      ;; do nothing if we're configured to just move on.
      (when-not sync-util/*log-exceptions-and-continue?*
        ;; but if we didn't expect any suppressed exceptions, rethrow it
        (throw result))
      (assoc result :name (name phase)))))

(mu/defn sync-database! :- SyncDatabaseResults
  "Perform all the different sync operations synchronously for `database`.

  By default, does a `:full` sync that performs all the different sync operations consecutively. You may instead
  specify only a `:schema` sync that will sync just the schema but skip analysis.

  Please note that this function is *not* what is called by the scheduled tasks; those call different steps
  independently. This function is called when a Database is first added."
  ([database]
   (sync-database! database nil))

  ([database                         :- i/DatabaseInstance
    {:keys [scan], :or {scan :full}} :- [:maybe [:map
                                                 [:scan {:optional true} [:maybe [:enum :schema :full]]]]]]
   (sync-util/sync-operation :sync database (format "Sync %s" (sync-util/name-for-logging database))
     (->> (scan-phases scan)
          (keep (partial do-phase! database))
          (doall)))))

(mu/defn sync-table!
  "Perform all the different sync operations synchronously for a given `table`. Since often called on a sequence of
  tables, caller should check if can connect."
  [table :- i/TableInstance]
  (doto table
    sync-metadata/sync-table-metadata!
    analyze/analyze-table!
    field-values/update-field-values-for-table!
    sync-util/set-initial-table-sync-complete!))

(mu/defn refingerprint-field!
  "Refingerprint a field, usually after its type changes. Checks if can connect to database, returning
  `:sync/no-connection` if not."
  [field :- i/FieldInstance]
  (let [table    (field/table field)
        database (table/database table)]
    ;; it's okay to allow testing H2 connections during sync. We only want to disallow you from testing them for the
    ;; purposes of creating a new H2 database.
    (if (binding [h2/*allow-testing-h2-connections* true]
          (driver.u/can-connect-with-details? (:engine database) (:details database)))
      (sync-util/with-error-handling (format "Error refingerprinting field %s"
                                             (sync-util/name-for-logging field))
        (sync.fingerprint/refingerprint-field field))
      :sync/no-connection)))
