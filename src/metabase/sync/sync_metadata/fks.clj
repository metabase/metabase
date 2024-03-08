(ns metabase.sync.sync-metadata.fks
  "Logic for updating FK properties of Fields from metadata fetched from a physical DB."
  (:require
   [honey.sql :as sql]
   [metabase.db.connection :as mdb.connection]
   [metabase.models.table :as table]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(defn ^:private mark-fk-sql
  "Returns [sql & params] for [[mark-fk!]] according to the application DB's dialect."
  [{:keys [db-id
           fk-table-name
           fk-table-schema
           fk-column-name
           pk-table-name
           pk-table-schema
           pk-column-name]}]
  (let [field-id-query (fn [db-id table-schema table-name column-name]
                         {:select [[[:min :f.id] :id]]
                          ;; Cal 2024-03-04: We use `min` to limit this subquery to one result (limit 1 isn't allowed
                          ;; in subqueries in MySQL) because it's possible for schema, table, or column names to be
                          ;; non-unique when lower-cased for some DBs. We have been doing case-insensitive matching
                          ;; since #5510 so this preserves behaviour to avoid possible regressions.
                          ;; It's possible this is to avoid
                          :from   [[:metabase_field :f]]
                          :join   [[:metabase_table :t] [:= :f.table_id :t.id]]
                          :where  [:and
                                   [:= :t.db_id db-id]
                                   [:= [:lower :f.name] (u/lower-case-en column-name)]
                                   [:= [:lower :t.name] (u/lower-case-en table-name)]
                                   [:= [:lower :t.schema] (some-> table-schema u/lower-case-en)]
                                   [:= :f.active true]
                                   [:not= :f.visibility_type "retired"]
                                   [:= :t.active true]
                                   [:= :t.visibility_type nil]]})
        fk-field-id-query (field-id-query db-id fk-table-schema fk-table-name fk-column-name)
        pk-field-id-query (field-id-query db-id pk-table-schema pk-table-name pk-column-name)
        q (case (mdb.connection/db-type)
            :mysql
            {:update [:metabase_field :f]
             :join   [[fk-field-id-query :fk] [:= :fk.id :f.id]
                      ;; Only update if either:
                      ;; - fk_target_field_id is NULL and the new target is not NULL
                      ;; - fk_target_field_id is not NULL but the new target is different and not NULL
                      [pk-field-id-query :pk]
                      [:and
                       [:or
                        [:= :f.fk_target_field_id nil]
                        [:not= :f.fk_target_field_id :pk.id]]]]
             :set    {:fk_target_field_id :pk.id
                      :semantic_type      "type/FK"}}
            :postgres
            {:update [:metabase_field :f]
             :from   [[fk-field-id-query :fk]]
             :join   [[pk-field-id-query :pk] true]
             :set    {:fk_target_field_id :pk.id
                      :semantic_type      "type/FK"}
             :where  [:and
                      [:= :fk.id :f.id]
                      [:or
                       [:= :f.fk_target_field_id nil]
                       [:not= :f.fk_target_field_id :pk.id]]]}
            :h2
            {:update [:metabase_field :f]
             :set    {:fk_target_field_id pk-field-id-query
                      :semantic_type      "type/FK"}
             :where  [:and
                      [:= :f.id fk-field-id-query]
                      [:not= pk-field-id-query nil]
                      [:or
                       [:= :f.fk_target_field_id nil]
                       [:not= :f.fk_target_field_id pk-field-id-query]]]})]
    (sql/format q :dialect (mdb.connection/quoting-style (mdb.connection/db-type)))))

(mu/defn ^:private mark-fk!
  "Updates the `fk_target_field_id` of a Field. Returns 1 if the Field was successfully updated, 0 otherwise."
  [database :- i/DatabaseInstance
   table    :- i/TableInstance
   fk       :- i/FKMetadataEntry]
  (u/prog1 (t2/query-one (mark-fk-sql {:db-id           (:id database)
                                       :fk-table-name   (:name table)
                                       :fk-table-schema (:schema table)
                                       :fk-column-name  (:fk-column-name fk)
                                       :pk-table-name   (:name (:dest-table fk))
                                       :pk-table-schema (:schema (:dest-table fk))
                                       :pk-column-name  (:dest-column-name fk)}))
    (when (= <> 1)
      (log/info (u/format-color 'cyan "Marking foreign key from %s %s -> %s %s"
                                (sync-util/table-name-for-logging table)
                                (sync-util/field-name-for-logging :name (:fk-column-name fk))
                                (sync-util/table-name-for-logging (:dest-table fk))
                                (sync-util/field-name-for-logging :name (:dest-column-name fk)))))))

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
