(ns metabase.sync.persist.appdb
  "Default implementation of the sync persist protocols backed by toucan2 / app-db."
  (:require
   [honey.sql :as sql]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.sync.persist :as persist]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.util :as t2.util]))

(defn- mark-fk-sql
  "Returns [sql & params] for marking a FK according to the application DB's dialect."
  [db-id {:keys [fk-table-name fk-table-schema fk-column-name
                 pk-table-name pk-table-schema pk-column-name]}]
  (let [field-id-query (fn [db-id table-schema table-name column-name]
                         {:select [[[:min :f.id] :id]]
                          :from   [[:metabase_field :f]]
                          :join   [[:metabase_table :t] [:= :f.table_id :t.id]]
                          :left-join [[:metabase_field_user_settings :u] [:= :f.id :u.field_id]]
                          :where  [:and
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
        valid-condition (fn [k]
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
                      :has_field_values   [:case [:= :has_field_values "auto-list"] nil :else :has_field_values]
                      :semantic_type      "type/FK"}}
            :postgres
            {:update [:metabase_field :f]
             :from   [[fk-field-id-query :fk]]
             :join   [[pk-field-id-query :pk] true]
             :set    {:fk_target_field_id :pk.id
                      :has_field_values   [:case [:= :has_field_values "auto-list"] nil :else :has_field_values]
                      :semantic_type      "type/FK"}
             :where  [:and
                      [:= :fk.id :f.id]
                      (valid-condition :pk.id)]}
            :h2
            {:update [:metabase_field :f]
             :set    {:fk_target_field_id pk-field-id-query
                      :has_field_values   [:case [:= :has_field_values "auto-list"] nil :else :has_field_values]
                      :semantic_type      "type/FK"}
             :where  [:and
                      [:= :f.id fk-field-id-query]
                      [:not= pk-field-id-query nil]
                      (valid-condition pk-field-id-query)]})]
    (sql/format q :dialect (mdb/quoting-style (mdb/db-type)))))

(defrecord AppDbSyncWriter []
  persist/SyncDatabaseWriter
  (set-dbms-version! [_this database-id version]
    (t2/update! :model/Database database-id {:dbms_version version}))

  (set-database-timezone! [_this database-id timezone-id]
    (t2/update! :model/Database database-id {:timezone timezone-id}))

  (set-database-details-version! [_this database-id details version]
    (t2/update! :model/Database database-id
                {:details (assoc details :version version)}))

  (create-table! [_this table-map]
    (t2/insert-returning-instance! :model/Table table-map))

  (reactivate-table! [_this table-id changes]
    (t2/update! :model/Table table-id changes))

  (retire-table! [_this database-id schema table-name]
    (t2/update! :model/Table {:db_id  database-id
                              :schema schema
                              :name   table-name
                              :active true}
                {:active false}))

  (update-table! [_this table-id changes]
    (t2/update! :model/Table table-id changes))

  (update-table-schema! [_this database-id old-schema new-schema]
    (t2/update! :model/Table
                :db_id database-id
                :schema old-schema
                {:schema new-schema}))

  (archive-table! [_this table-id changes]
    (t2/update! :model/Table
                {:id table-id
                 :active false}
                changes))

  (insert-fields! [_this field-maps]
    (t2/insert-returning-pks! :model/Field field-maps))

  (reactivate-fields! [_this field-ids]
    (t2/update! :model/Field {:id [:in field-ids]}
                {:active true}))

  (retire-field! [_this field-id]
    (t2/update! :model/Field field-id {:active false}))

  (update-field! [_this field-id changes]
    (t2/update! :model/Field field-id changes))

  (mark-fk! [_this database-id fk-metadata]
    (t2/query-one (mark-fk-sql database-id fk-metadata)))

  (set-table-indexes! [_this table-id indexed-field-ids]
    (t2/update! :model/Field {:table_id table-id}
                {:database_indexed (if (seq indexed-field-ids)
                                     [:case [:in :id indexed-field-ids] true :else false]
                                     false)}))

  (batch-set-indexed! [_this field-ids indexed?]
    (when (seq field-ids)
      (t2/update! :model/Field :parent_id nil :id [:in field-ids] {:database_indexed indexed?})))

  (update-database! [_this database-id changes]
    (t2/update! :model/Database database-id changes))

  (update-field-by-name! [_this table-id field-name changes]
    (t2/update! :model/Field {:name field-name :table_id table-id} changes)))

(defn sync-writer
  "Create an app-db backed sync writer."
  []
  (->AppDbSyncWriter))

(def writer
  "Singleton app-db backed sync writer."
  (->AppDbSyncWriter))

(defrecord AppDbSyncReader []
  persist/SyncDatabaseReader
  (active-tables [_this database-id]
    (set (t2/select [:model/Table :id :name :schema :data_authority
                     :description :database_require_filter :estimated_row_count
                     :visibility_type :initial_sync_status :is_writable]
                    :db_id database-id
                    :active true)))

  (all-tables [_this database-id]
    (set (t2/select [:model/Table :id :name :schema :data_authority
                     :description :database_require_filter :estimated_row_count
                     :visibility_type :initial_sync_status :is_writable]
                    :db_id database-id)))

  (find-inactive-table-id [_this database-id schema table-name]
    (t2/select-one-pk :model/Table
                      :db_id database-id
                      :schema schema
                      :name table-name
                      :active false))

  (get-table [_this table-id]
    (t2/select-one :model/Table table-id))

  (archivable-tables [_this database-id threshold-expr]
    (t2/select :model/Table
               :db_id database-id
               :active false
               :archived_at nil
               :transform_target false
               :deactivated_at [:< threshold-expr]))

  (active-fields [_this table-id]
    (t2/select [:model/Field :name :database_type :base_type :effective_type :coercion_strategy :semantic_type
                :parent_id :id :description :database_position :nfc_path
                :database_is_auto_increment :database_required
                :database_default :database_is_generated :database_is_nullable :database_is_pk
                :database_partitioned :json_unfolding :position :preview_display]
               :table_id  table-id
               :active    true
               {:order-by [[:position :asc] [:%lower.name :asc]]}))

  (matching-inactive-fields [_this table-id field-names parent-id]
    (when (seq field-names)
      (t2/select :model/Field
                 :table_id    table-id
                 :%lower.name [:in field-names]
                 :parent_id   parent-id
                 :active      false)))

  (select-fields-by-ids [_this field-ids]
    (when (seq field-ids)
      (t2/select :model/Field :id [:in field-ids])))

  (find-syncable-table [_this database-id table-name table-schema]
    (->> (t2/select :model/Table
                    :db_id database-id
                    :%lower.name (t2.util/lower-case-en table-name)
                    :%lower.schema (some-> table-schema t2.util/lower-case-en)
                    {:where sync-util/sync-tables-clause})
         (sort-by (fn [item]
                    [(not= (:schema item) table-schema)
                     (not= (:name item) table-name)]))
         first))

  (field-ids-for-index-names [_this table-id index-names]
    (when (seq index-names)
      (t2/select-pks-vec :model/Field :name [:in index-names] :table_id table-id :parent_id nil)))

  (indexed-field-ids-for-table [_this table-id]
    (t2/select-pks-set :model/Field :table_id table-id :database_indexed true))

  (indexed-field-ids-for-database [_this database-id]
    (t2/select-pks-set :model/Field
                       :table_id [:in {:select [[:t.id]]
                                       :from [[(t2/table-name :model/Table) :t]]
                                       :where [:= :t.db_id database-id]}]
                       :parent_id nil
                       :database_indexed true))

  (find-active-table-id [_this database-id table-name]
    (t2/select-one-pk :model/Table
                      :db_id database-id
                      :name table-name
                      :active true))

  (field-ids-for-indexes [_this database-id indexes]
    (reduce
     (fn [accum index-batch]
       (let [normal-indexes (map (juxt #(:table-schema % "__null__") :table-name :field-name) index-batch)
             query (t2/reducible-query {:select [[:f.id]]
                                        :from [[(t2/table-name :model/Field) :f]]
                                        :inner-join [[(t2/table-name :model/Table) :t] [:= :f.table_id :t.id]]
                                        :where [:and [:in [:composite [:coalesce :t.schema "__null__"] :t.name :f.name] normal-indexes]
                                                [:= :t.db_id database-id]
                                                [:= :parent_id nil]]})]
         (into accum (keep :id) query)))
     #{}
     (partition-all 5000 indexes))))

(defn sync-reader
  "Create an app-db backed sync reader."
  []
  (->AppDbSyncReader))

(def reader
  "Singleton app-db backed sync reader."
  (->AppDbSyncReader))
