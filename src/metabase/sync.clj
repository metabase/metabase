(ns metabase.sync
  "Combined functions for running the entire Metabase sync process.
   This delegates to a few distinct steps, which in turn are broken out even further:

   1.  Sync Metadata      (`metabase.sync.sync-metadata`)
   2.  Analysis           (`metabase.sync.analyze`)
   3.  Cache Field Values (`metabase.sync.field-values`)

   In the near future these steps will be scheduled individually, meaning those functions will
   be called directly instead of calling the `sync-database!` function to do all three at once."
  (:require [metabase.sync
             [analyze :as analyze]
             [field-values :as field-values]
             [interface :as i]
             [sync-metadata :as sync-metadata]
             [util :as sync-util]]
            [schema.core :as s]))

(s/defn sync-database!
  "Perform all the different sync operations synchronously for DATABASE.
   This is considered a 'full sync' in that all the different sync operations are performed at the same time.
   Please note that this function is *not* what is called by the scheduled tasks. Those call different steps
   independently."
  {:style/indent 1}
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :sync database (format "Sync %s" (sync-util/name-for-logging database))
    ;; First make sure Tables, Fields, and FK information is up-to-date
    (sync-metadata/sync-db-metadata! database)
    ;; Next, run the 'analysis' step where we do things like scan values of fields and update special types accordingly
    (analyze/analyze-db! database)
    ;; Finally, update cached FieldValues
    (field-values/update-field-values! database)))


(s/defn sync-table!
  "Perform all the different sync operations synchronously for a given TABLE."
  [table :- i/TableInstance]
  (sync-metadata/sync-table-metadata! table)
  (analyze/analyze-table! table)
  (field-values/update-field-values-for-table! table))
