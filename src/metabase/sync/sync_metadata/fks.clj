(ns metabase.sync.sync-metadata.fks
  "Logic for updating FK properties of Fields from metadata fetched from a physical DB."
  (:require
   [clojure.set :as set]
   [honey.sql :as sql]
   [metabase.app-db.core :as mdb]
   [metabase.driver.util :as driver.u]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]))

(defn ^:private mark-fk-sql
  "Returns [sql & params] for [[mark-fk!]] according to the application DB's dialect."
  [db-id {:keys [fk-table-name
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
                          :left-join [[:metabase_field_user_settings :u] [:= :f.id :u.field_id]]
                          :where  [:and
                                   ;; ensure we are not overriding user-set fks
                                   [:= :u.fk_target_field_id nil]
                                   [:= :u.semantic_type nil]

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

        ;; Only update if either:
        ;; - fk_target_field_id is NULL and the new target is not NULL
        ;; - fk_target_field_id is not NULL but the new target is different and not NULL
        valid-condition
        (fn [k]
          [:or
           [:= :f.fk_target_field_id nil]
           [:not= :f.fk_target_field_id k]])

        q (case (mdb/db-type)
            :mysql
            {:update [:metabase_field :f]
             :join   [[fk-field-id-query :fk] [:= :fk.id :f.id]
                      [pk-field-id-query :pk]
                      (valid-condition :pk.id)]
             :set    {:fk_target_field_id :pk.id
                      ;; We need to reset has_field_values when it is auto-list as FKs should not be marked as such
                      :has_field_values   [:case [:= :has_field_values "auto-list"] nil :else :has_field_values]
                      :semantic_type      "type/FK"}}
            :postgres
            {:update [:metabase_field :f]
             :from   [[fk-field-id-query :fk]]
             :join   [[pk-field-id-query :pk] true]
             :set    {:fk_target_field_id :pk.id
                      ;; We need to reset has_field_values when it is auto-list as FKs should not be marked as such
                      :has_field_values   [:case [:= :has_field_values "auto-list"] nil :else :has_field_values]
                      :semantic_type      "type/FK"}
             :where  [:and
                      [:= :fk.id :f.id]
                      (valid-condition :pk.id)]}
            :h2
            {:update [:metabase_field :f]
             :set    {:fk_target_field_id pk-field-id-query
                      ;; We need to reset has_field_values when it is auto-list as FKs should not be marked as such
                      :has_field_values   [:case [:= :has_field_values "auto-list"] nil :else :has_field_values]
                      :semantic_type      "type/FK"}
             :where  [:and
                      [:= :f.id fk-field-id-query]
                      [:not= pk-field-id-query nil]
                      (valid-condition pk-field-id-query)]})]
    (sql/format q :dialect (mdb/quoting-style (mdb/db-type)))))

(mu/defn- mark-fk!
  "Updates the `fk_target_field_id` of a Field. Returns 1 if the Field was successfully updated, 0 otherwise."
  [database :- i/DatabaseInstance
   metadata :- i/FKMetadataEntry]
  (u/prog1 (t2/query-one (mark-fk-sql (:id database) metadata))
    (when (= <> 1)
      (log/info (u/format-color 'cyan "Marking foreign key from %s %s -> %s %s"
                                (sync-util/table-name-for-logging :name (:fk-table-name metadata)
                                                                  :schema (:fk-table-schema metadata))
                                (sync-util/field-name-for-logging :name (:fk-column-name metadata))
                                (sync-util/table-name-for-logging :name (:fk-table-name metadata)
                                                                  :schema (:fk-table-schema metadata))
                                (sync-util/field-name-for-logging :name (:pk-column-name metadata)))))))

(mu/defn- our-fk-metadata
  "Fetch FK relationships currently stored in Metabase for a database. Returns a set of FK metadata maps
  that match the format used by database FK metadata, allowing for comparison."
  [database :- i/DatabaseInstance]
  (let [fk-fields (t2/select [:model/Field :id :name :fk_target_field_id :table_id]
                             {:where [:and
                                      [:not= :fk_target_field_id nil]
                                      [:in :table_id
                                       {:select [:id]
                                        :from [:metabase_table]
                                        :where [:and
                                                [:= :db_id (:id database)]
                                                [:= :active true]]}]]})]
    (into #{}
          (for [fk-field fk-fields
                :let [fk-table (t2/select-one [:model/Table :name :schema] :id (:table_id fk-field))
                      pk-field (t2/select-one [:model/Field :name :table_id] :id (:fk_target_field_id fk-field))
                      pk-table (when pk-field (t2/select-one [:model/Table :name :schema] :id (:table_id pk-field)))]
                :when (and fk-table pk-field pk-table)]
            {:fk-table-name (:name fk-table)
             :fk-table-schema (:schema fk-table)
             :fk-column-name (:name fk-field)
             :pk-table-name (:name pk-table)
             :pk-table-schema (:schema pk-table)
             :pk-column-name (:name pk-field)}))))

(mu/defn- clear-fk!
  "Clears FK relationship for a field that no longer has an FK constraint in the database.
  Updates fk_target_field_id to NULL and resets semantic_type to a sensible default."
  [database :- i/DatabaseInstance
   fk-metadata :- i/FKMetadataEntry]
  (let [field-query {:select [:f.id]
                     :from [[:metabase_field :f]]
                     :join [[:metabase_table :t] [:= :f.table_id :t.id]]
                     :left-join [[:metabase_field_user_settings :u] [:= :f.id :u.field_id]]
                     :where [:and
                             ;; ensure we are not overriding user-set fks
                             [:= :u.fk_target_field_id nil]
                             [:= :u.semantic_type nil]

                             [:= :t.db_id (:id database)]
                             [:= [:lower :f.name] (u/lower-case-en (:fk-column-name fk-metadata))]
                             [:= [:lower :t.name] (u/lower-case-en (:fk-table-name fk-metadata))]
                             [:= [:lower :t.schema] (some-> (:fk-table-schema fk-metadata) u/lower-case-en)]
                             [:= :f.active true]
                             [:not= :f.visibility_type "retired"]
                             [:= :t.active true]
                             [:= :t.visibility_type nil]
                             ;; Only clear fields that currently have FK relationships
                             [:not= :f.fk_target_field_id nil]]}
        update-query {:update :metabase_field
                      :set {:fk_target_field_id nil
                            :semantic_type "type/Category"}
                      :where [:in :id field-query]}]
    (u/prog1 (t2/query update-query)
      (when (pos? <>)
        (log/info (u/format-color 'yellow "Clearing dropped foreign key from %s %s"
                                  (sync-util/table-name-for-logging :name (:fk-table-name fk-metadata)
                                                                    :schema (:fk-table-schema fk-metadata))
                                  (sync-util/field-name-for-logging :name (:fk-column-name fk-metadata))))))))

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
  DB based on values returned by [[metabase.driver/describe-table-fks]].

  If the driver supports the `:describe-fks` feature, [[metabase.driver/describe-fks]] is used to fetch the FK metadata.

  This function also sets all the tables that should be synced to have `initial-sync-status=complete` once the sync is done."
  [database :- i/DatabaseInstance]
  (u/prog1 (sync-util/with-error-handling (format "Error syncing FKs for %s" (sync-util/name-for-logging database))
             (let [driver       (driver.u/database->driver database)
                   schema-names (when (driver.u/supports? driver :schemas database)
                                  (sync-util/sync-schemas database))
                   db-fk-metadata (into #{} (fetch-metadata/fk-metadata database :schema-names schema-names))
                   our-fk-metadata (our-fk-metadata database)
                   ;; FK relationships that exist in DB but not in Metabase (need to be added/updated)
                   fks-to-add (set/difference db-fk-metadata our-fk-metadata)
                   ;; FK relationships that exist in Metabase but not in DB (need to be cleared)
                   fks-to-clear (set/difference our-fk-metadata db-fk-metadata)
                   ;; Process FK additions/updates
                   add-results (transduce (map (fn [x]
                                                 (let [[updated failed] (try [(mark-fk! database x) 0]
                                                                             (catch Exception e
                                                                               (log/error e)
                                                                               [0 1]))]
                                                   {:total-fks 1
                                                    :updated-fks updated
                                                    :total-failed failed})))
                                          (partial merge-with +)
                                          {:total-fks 0
                                           :updated-fks 0
                                           :total-failed 0}
                                          fks-to-add)
                   ;; Process FK removals
                   clear-results (transduce (map (fn [x]
                                                   (let [[cleared failed] (try [(clear-fk! database x) 0]
                                                                               (catch Exception e
                                                                                 (log/error e)
                                                                                 [0 1]))]
                                                     {:cleared-fks 1
                                                      :updated-fks cleared
                                                      :total-failed failed})))
                                            (partial merge-with +)
                                            {:cleared-fks 0
                                             :updated-fks 0
                                             :total-failed 0}
                                            fks-to-clear)]
               ;; Combine results
               (merge-with + add-results clear-results {:total-fks (+ (count fks-to-add) (count fks-to-clear))})))
    ;; Mark the table as done with its initial sync once this step is done even if it failed, because only
    ;; sync-aborting errors should be surfaced to the UI (see
    ;; `:metabase.sync.util/exception-classes-not-to-retry`).
    (sync-util/set-initial-table-sync-complete-for-db! database)))
