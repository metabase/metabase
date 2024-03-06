(ns metabase.sync.sync-metadata.fks
  "Logic for updating FK properties of Fields from metadata fetched from a physical DB."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.table :as table]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(mu/defn ^:private mark-fk!
  "Updates the `fk_target_field_id` of a Field. Returns 1 if the Field was successfully updated, 0 otherwise."
  [database :- i/DatabaseInstance
   metadata :- i/FastFKMetadataEntry]
  (let [field-id-query (fn [db-id table-schema table-name column-name]
                         {:select [:f.id]
                          :from   [[:metabase_field :f]]
                          :join   [[:metabase_table :t] [:= :f.table_id :t.id]]
                          :where  [:and
                                   [:= :t.db_id db-id]
                                   [:= [:lower :f.name] (u/lower-case-en column-name)]
                                   [:= [:lower :t.name] (u/lower-case-en table-name)]
                                   (when table-schema
                                     [:= [:lower :t.schema] (u/lower-case-en table-schema)])
                                   [:= :f.active true]
                                   [:not= :f.visibility_type "retired"]]})
        fk-field-id-query (field-id-query (:id database)
                                          (:fk-table-schema metadata)
                                          (:fk-table-name metadata)
                                          (:fk-column-name metadata))
        dest-field-id-query (field-id-query (:id database)
                                            (:fk-table-schema metadata)
                                            (:fk-table-name metadata)
                                            (:fk-column-name metadata))]
    (u/prog1 (t2/query-one {:update [:metabase_field :f]
                            :set {:fk_target_field_id dest-field-id-query
                                  :semantic_type      "type/FK"}
                            :where [:and
                                    [:= :f.id fk-field-id-query]
                                    [:or
                                     [:= :f.fk_target_field_id nil]
                                     [:not= :f.fk_target_field_id dest-field-id-query]]]})
      (when (= <> 1)
        (log/info (u/format-color 'cyan "Marking foreign key from %s %s -> %s %s"
                                  (sync-util/table-name-for-logging :name (:fk-table-name metadata)
                                                                    :schema (:fk-table-schema metadata))
                                  (sync-util/field-name-for-logging :name (:fk-column-name metadata))
                                  (sync-util/table-name-for-logging :name (:fk-table-name metadata)
                                                                    :schema (:fk-table-schema metadata))
                                  (sync-util/field-name-for-logging :name (:pk-column-name metadata))))))))

(mu/defn fast-sync-fks!
  "Sync the foreign keys for a specific `table`."
  [database :- i/DatabaseInstance]
  (sync-util/with-error-handling (format "Error syncing FKs for %s" (sync-util/name-for-logging database))
    (let [fk-metadata (fetch-metadata/fk-metadata database)]
      (transduce (map (fn [x]
                        {:total-fks   1
                         :updated-fks (mark-fk! database x)}))
                 (partial merge-with +)
                 {:total-fks   0
                  :updated-fks 0}
                 fk-metadata))))

(mu/defn sync-fks-for-table!
  "Sync the foreign keys for a specific `table`."
  ([table :- i/TableInstance]
   (sync-fks-for-table! (table/database table) table))

  ([database :- i/DatabaseInstance
    table    :- i/TableInstance]
   (sync-util/with-error-handling (format "Error syncing FKs for %s" (sync-util/name-for-logging table))
     (let [fks-to-update (fetch-metadata/table-fk-metadata database table)]
       {:total-fks   (count fks-to-update)
        :updated-fks (sync-util/sum-numbers (fn [fk]
                                              (mark-fk! database
                                                        {:fk-table-name (:name table)
                                                         :fk-table-schema (:schema table)
                                                         :fk-column-name (:fk-column-name fk)
                                                         :pk-table-name (:name (:dest-table fk))
                                                         :pk-table-schema (:schema (:dest-table fk))
                                                         :pk-column-name (:dest-column-name fk)}))
                                            fks-to-update)}))))

(mu/defn sync-fks!
  "Sync the foreign keys in a `database`. This sets appropriate values for relevant Fields in the Metabase application
  DB based on values from the `FKMetadata` returned by [[metabase.driver/describe-table-fks]].

  If the driver supports the `:fast-sync-fks` feature, [[metabase.driver/describe-fks]] is used to fetch the FK metadata."
  [database :- i/DatabaseInstance]
  (if (driver/database-supports? (driver.u/database->driver database)
                                 :fast-sync-fks
                                 database)
    (fast-sync-fks! database)
    (reduce (fn [update-info table]
              (let [table         (t2.realize/realize table)
                    table-fk-info (sync-fks-for-table! database table)]
                ;; Mark the table as done with its initial sync once this step is done even if it failed, because only
                ;; sync-aborting errors should be surfaced to the UI (see
                ;; `:metabase.sync.util/exception-classes-not-to-retry`).
                (sync-util/set-initial-table-sync-complete! table)
                (if (instance? Exception table-fk-info)
                  (update update-info :total-failed inc)
                  (merge-with + update-info table-fk-info))))
          {:total-fks    0
           :updated-fks  0
           :total-failed 0}
          (sync-util/db->reducible-sync-tables database))))
