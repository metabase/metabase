(ns metabase.sync.sync-metadata.fks
  "Logic for updating FK properties of Fields from metadata fetched from a physical DB."
  (:require
   [metabase.driver.util :as driver.u]
   [metabase.sync.db :as sync.db]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.updates :as sync.updates]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.field :as field]))

(def ^:private fk-batch-size
  "The most foreign keys one bulk read and update of a sync step covers."
  1000)

(mu/defn- mark-fks! :- ms/IntGreaterThanOrEqualToZero
  "Updates the `fk_target_field_id` of the Fields the foreign key `entries` of `database` name, which are all read in
  one query and all written in one bulk update, whatever their number. Returns the number of Fields updated."
  [database :- i/DatabaseInstance
   entries  :- [:sequential i/FKMetadataEntry]]
  (let [changes (sync.db/fk-target-changes-for-entries (:id database) entries)]
    (when (seq changes)
      (field/update-fields! (mapv (fn [{:keys [id changes]}] (assoc changes :id id)) changes)))
    (doseq [{{:keys [fk-table-schema fk-table-name fk-column-name pk-column-name]} :entry} changes]
      (log/info (u/format-color 'cyan "Marking foreign key from %s %s -> %s %s"
                                (sync-util/table-name-for-logging :name fk-table-name :schema fk-table-schema)
                                (sync-util/field-name-for-logging :name fk-column-name)
                                (sync-util/table-name-for-logging :name fk-table-name :schema fk-table-schema)
                                (sync-util/field-name-for-logging :name pk-column-name))))
    (count changes)))

(mu/defn sync-fks-for-table!
  "Sync the foreign keys for a specific `table`."
  ([table :- i/TableInstance]
   (sync-fks-for-table! (driver.u/lib-database (:db_id table)) table))

  ([database :- i/DatabaseInstance
    table    :- i/TableInstance]
   (sync-util/with-error-handling (format "Error syncing FKs for %s" (sync-util/name-for-logging table))
     (let [schema-names (when (driver.u/supports? (driver.u/database->driver database) :schemas database)
                          [(:schema table)])
           fk-metadata  (into [] (fetch-metadata/fk-metadata database :schema-names schema-names :table-names [(:name table)]))]
       {:total-fks   (count fk-metadata)
        :updated-fks (transduce (comp (partition-all fk-batch-size) (map #(mark-fks! database %))) + 0 fk-metadata)}))))

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
               (transduce (comp (partition-all fk-batch-size)
                                (map (fn [batch]
                                       (let [[updated failed] (try [(mark-fks! database batch) 0]
                                                                   (catch Exception e
                                                                     (log/error (ex-message e))
                                                                     [0 (count batch)]))]
                                         {:total-fks    (count batch)
                                          :updated-fks  updated
                                          :total-failed failed}))))
                          (completing (partial merge-with +))
                          {:total-fks    0
                           :updated-fks  0
                           :total-failed 0}
                          fk-metadata)))
    ;; Mark the table as done with its initial sync once this step is done even if it failed, because only
    ;; sync-aborting errors should be surfaced to the UI (see
    ;; `:metabase.sync.util/exception-classes-not-to-retry`).
    (sync.updates/set-initial-table-sync-complete-for-db! database)))
