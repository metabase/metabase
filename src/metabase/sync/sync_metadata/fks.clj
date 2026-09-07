(ns metabase.sync.sync-metadata.fks
  "Logic for updating FK properties of Fields from metadata fetched from a physical DB."
  (:require
   [metabase.driver.util :as driver.u]
   [metabase.sync.db :as sync.db]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.models.table :as table]))

(mu/defn- mark-fk!
  "Updates the `fk_target_field_id` of a Field. Returns 1 if the Field was successfully updated, 0 otherwise."
  [database :- i/DatabaseInstance
   metadata :- i/FKMetadataEntry]
  (u/prog1 (sync.db/mark-fk! (:id database)
                             (:fk-table-schema metadata) (:fk-table-name metadata) (:fk-column-name metadata)
                             (:pk-table-schema metadata) (:pk-table-name metadata) (:pk-column-name metadata))
    (when (= <> 1)
      (log/info (u/format-color 'cyan "Marking foreign key from %s %s -> %s %s"
                                (sync-util/table-name-for-logging :name (:fk-table-name metadata)
                                                                  :schema (:fk-table-schema metadata))
                                (sync-util/field-name-for-logging :name (:fk-column-name metadata))
                                (sync-util/table-name-for-logging :name (:fk-table-name metadata)
                                                                  :schema (:fk-table-schema metadata))
                                (sync-util/field-name-for-logging :name (:pk-column-name metadata)))))))

(mu/defn sync-fks-for-table!
  "Sync the foreign keys for a specific `table`."
  ([table :- i/TableInstance]
   (sync-fks-for-table! (table/database table) table))

  ([database :- i/DatabaseInstance
    table    :- i/TableInstance]
   (sync-util/with-error-handling (format "Error syncing FKs for %s" (sync-util/name-for-logging table))
     (let [schema-names (when (driver.u/supports? (driver.u/database->driver database) :schemas database)
                          [(:schema table)])
           fk-metadata  (into [] (fetch-metadata/fk-metadata database :schema-names schema-names :table-names [(:name table)]))]
       {:total-fks   (count fk-metadata)
        :updated-fks (sync-util/sum-numbers #(mark-fk! database %) fk-metadata)}))))

(mu/defn sync-fks!
  "Sync the foreign keys in a `database`. This sets appropriate values for relevant Fields in the Metabase application
  DB based on values returned by [[metabase.driver/describe-fks]].

  This function also sets all the tables that should be synced to have `initial-sync-status=complete` once the sync is
  done."
  [database :- i/DatabaseInstance]
  (u/prog1 (sync-util/with-error-handling (format "Error syncing FKs for %s" (sync-util/name-for-logging database))
             (let [driver       (driver.u/database->driver database)
                   schema-names (when (driver.u/supports? driver :schemas database)
                                  (sync-util/sync-schemas database))
                   fk-metadata  (fetch-metadata/fk-metadata database :schema-names schema-names)]
               (transduce (map (fn [x]
                                 (let [[updated failed] (try [(mark-fk! database x) 0]
                                                             (catch Exception e
                                                               (log/error (ex-message e))
                                                               [0 1]))]
                                   {:total-fks    1
                                    :updated-fks  updated
                                    :total-failed failed})))
                          (partial merge-with +)
                          {:total-fks    0
                           :updated-fks  0
                           :total-failed 0}
                          fk-metadata)))
    ;; Mark the table as done with its initial sync once this step is done even if it failed, because only
    ;; sync-aborting errors should be surfaced to the UI (see
    ;; `:metabase.sync.util/exception-classes-not-to-retry`).
    (sync-util/set-initial-table-sync-complete-for-db! database)))
