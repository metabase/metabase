(ns metabase.sync.sync-metadata.fks
  "Logic for updating FK properties of Fields from metadata fetched from a physical DB."
  (:require
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
   table    :- i/TableInstance
   fk       :- i/FKMetadataEntry]
  (let [field-id-query (fn [db-id table-schema table-name column-name]
                             {:select [:f.id]
                              :from   [[:metabase_field :f]]
                              :join   [[:metabase_table :t] [:= :f.table_id :t.id]]
                              :where  [:and
                                       [:= :t.db_id db-id]
                                       [:= [:lower :f.name] (u/lower-case-en column-name)]
                                       [:= [:lower :t.name] (u/lower-case-en table-name)]
                                       [:= [:lower :t.schema] (some-> table-schema u/lower-case-en)]
                                       [:= :f.active true]
                                       [:not= :f.visibility_type "retired"]
                                       [:= :t.active nil]
                                       [:= :t.visibility_type nil]]
                              ;; Cal 2024-03-04: We need to limit to 1 because it's possible for schema, table, or
                              ;; column names to be non-unique when lower-cased. We have been doing case-insensitive
                              ;; matching since #39679 (2017), and so let's preserves this behaviour for now to avoid
                              ;; regressions.
                              :limit  1})
        fk-field-id-query (field-id-query (:id database)
                                          (:schema table)
                                          (:name table)
                                          (:fk-column-name fk))
        dest-field-id-query (field-id-query (:id database)
                                            (:schema (:dest-table fk))
                                            (:name (:dest-table fk))
                                            (:dest-column-name fk))
        never-matching-id -100]
    (u/prog1 (t2/query-one {:update [:metabase_field :f]
                            :set {:fk_target_field_id dest-field-id-query
                                  :semantic_type      "type/FK"}
                            :where [:and
                                    [:= :f.id fk-field-id-query]
                                    ;; Update if either:
                                    ;; - fk_target_field_id is NULL and the new value is not NULL
                                    ;; - fk_target_field_id is not NULL but the new value is different and not NULL
                                    [:not=
                                     [:coalesce :f.fk_target_field_id never-matching-id]
                                     dest-field-id-query]]})
      (when (= <> 1)
        (log/info (u/format-color 'cyan "Marking foreign key from %s %s -> %s %s"
                                  (sync-util/table-name-for-logging table)
                                  (sync-util/field-name-for-logging :name (:fk-column-name fk))
                                  (sync-util/table-name-for-logging (:dest-table fk))
                                  (sync-util/field-name-for-logging :name (:dest-column-name fk))))))))

(mu/defn sync-fks-for-table!
  "Sync the foreign keys for a specific `table`."
  ([table :- i/TableInstance]
   (sync-fks-for-table! (table/database table) table))

  ([database :- i/DatabaseInstance
    table    :- i/TableInstance]
   (sync-util/with-error-handling (format "Error syncing FKs for %s" (sync-util/name-for-logging table))
     (let [fks-to-update (fetch-metadata/fk-metadata database table)]
       {:total-fks   (count fks-to-update)
        :updated-fks (sync-util/sum-numbers (fn [fk]
                                              (mark-fk! database table fk))
                                            fks-to-update)}))))

(mu/defn sync-fks!
  "Sync the foreign keys in a `database`. This sets appropriate values for relevant Fields in the Metabase application
  DB based on values from the `FKMetadata` returned by [[metabase.driver/describe-table-fks]]."
  [database :- i/DatabaseInstance]
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
          (sync-util/db->reducible-sync-tables database)))
