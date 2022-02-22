(ns metabase.sync.sync-metadata.nested-fcs
  "Logic for updating nested field properties of Fields from metadata fetched from a DB. This mainly means JSON columns for now."
  )

(s/defn sync-nested-fcs!
  "Sync the nested field properties in a DATABASE. This sets appropriate values for relevant Fields in the Metabase application DB
   based on values from the `NestedFCMetadata` returned by `describe-nested-field-columns`."
  [database :- i/DatabaseInstance]
  (reduce (fn [update-info table]
            (let [table-nfc-info (sync-nfcs-for-table! database table)]
              ;; Mark the table as done with its initial sync once this step is done even if it failed, because only
              ;; sync-aborting errors should be surfaced to the UI (see [[sync-util/exception-classes-not-to-retry]]).
              (sync-util/set-initial-table-sync-complete! table)
              (if (instance? Exception table-nfc-info)
                (update update-info :total-failed inc)
                (merge-with + update-info table-nfc-info))))
          {:total-nfcs   0
           :updated-nfcs 0
           :total-failed 0}
          (sync-util/db->sync-tables database)))
