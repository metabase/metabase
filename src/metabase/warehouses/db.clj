(ns metabase.warehouses.db
  "Application database queries for `:model/Database`. Every function here is a direct Toucan 2 call with no additional
  logic, so no other namespace runs a Database query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mr/def ::engine
  [:or :keyword :string])

(mr/def ::filters
  "Which Databases a query applies to. Keys mirror the columns of `metabase_database`: a scalar matches that value and
  a set matches any of its values. A nullable column also takes a `<column>_set` key, matching the rows where that
  column is set (`true`) or null (`false`)."
  [:map {:closed true}
   [:id                     {:optional true} [:or ::lib.schema.id/database [:set ::lib.schema.id/database]]]
   [:name                   {:optional true} :string]
   [:engine                 {:optional true} [:or ::engine [:set ::engine]]]
   [:initial_sync_status    {:optional true} [:or :keyword :string]]
   [:is_sample              {:optional true} :boolean]
   [:is_audit               {:optional true} :boolean]
   [:is_attached_dwh        {:optional true} :boolean]
   [:is_stub                {:optional true} :boolean]
   [:uploads_enabled        {:optional true} :boolean]
   [:router_database_id     {:optional true} ::lib.schema.id/database]
   [:router_database_id_set {:optional true} :boolean]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::warehouses.schema/database.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::warehouses.schema/database.column
                                              [:tuple ::warehouses.schema/database.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(def ^:private set-columns
  "Maps each `<column>_set` filter key to the column whose nullness it tests."
  {:router_database_id_set :router_database_id})

(def ^:private lower-columns
  "Text columns ordered case-insensitively, so `Zebra` does not sort ahead of `apple`."
  #{:name :engine :description})

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/Database columns))

(defn- ->honeysql
  [opts]
  (u.query/opts->honeysql opts {:set-columns set-columns, :lower-columns lower-columns}))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-databases :- [:sequential ::warehouses.schema/database]
  "The Databases matching `opts`."
  ([]
   (select-databases nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (t2/select (->model columns) (->honeysql opts))))

(mu/defn select-one-database :- [:maybe ::warehouses.schema/database]
  "The first Database matching `opts`, or nil."
  ([]
   (select-one-database nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (t2/select-one (->model columns) (->honeysql opts))))

(mu/defn select-database-pk->instance :- [:map-of ::lib.schema.id/database ::warehouses.schema/database]
  "A map of id to the Database matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::opts]]
  (t2/select-pk->fn identity (->model columns) (->honeysql opts)))

(mu/defn select-database-pks :- [:set ::lib.schema.id/database]
  "The ids of the Databases matching `opts`."
  ([]
   (select-database-pks nil))
  ([opts :- [:maybe ::opts]]
   (or (t2/select-pks-set :model/Database (->honeysql opts)) #{})))

(mu/defn select-one-database-pk :- [:maybe ::lib.schema.id/database]
  "The id of the first Database matching `opts`, or nil."
  ([]
   (select-one-database-pk nil))
  ([opts :- [:maybe ::opts]]
   (t2/select-one-pk :model/Database (->honeysql opts))))

(mu/defn count-databases :- :int
  "The number of Databases matching `opts`."
  ([]
   (count-databases nil))
  ([opts :- [:maybe ::opts]]
   (t2/count :model/Database (->honeysql opts))))

(mu/defn database-exists? :- :boolean
  "Whether a Database matching `opts` exists."
  [opts :- [:maybe ::opts]]
  (t2/exists? :model/Database (->honeysql opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-database! :- ::warehouses.schema/database
  "Insert the Database `row` and return the inserted instance."
  [row :- ::warehouses.schema/database.update]
  (t2/insert-returning-instance! :model/Database row))

(mu/defn insert-databases! :- [:sequential ::warehouses.schema/database]
  "Insert the Database `rows` and return the inserted instances."
  [rows :- [:sequential ::warehouses.schema/database.update]]
  (t2/insert-returning-instances! :model/Database rows))

(mu/defn update-databases! :- :int
  "Apply `changes` to every Database matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::warehouses.schema/database.update]
  (t2/update! :model/Database (->honeysql opts) changes))

(mu/defn update-databases-returning-pks! :- [:sequential ::lib.schema.id/database]
  "Apply `changes` to every Database matching `opts`, returning the ids of the updated rows."
  [opts    :- [:maybe ::opts]
   changes :- ::warehouses.schema/database.update]
  (t2/update-returning-pks! :model/Database (->honeysql opts) changes))

(mu/defn delete-databases! :- :int
  "Delete every Database matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (t2/delete! :model/Database (->honeysql opts)))

;;; ------------------------------- Queries used only by the warehouses module -------------------------------

(mu/defn health-check-candidate-ids
  "The `:id` of the lowest-id non-audit, non-sample, non-destination Database of each engine."
  []
  (t2/query {:select   [[:%min.id :id]]
             :from     [(t2/table-name :model/Database)]
             :where    [:and
                        [:= :is_audit false]
                        [:= :is_sample false]
                        [:= :router_database_id nil]]
             :group-by [:engine]}))

(mu/defn databases-for-serdes-reducible
  "A reducible of the Databases to export via serdes: routing destinations and the sample database are always
  excluded, H2 databases unless `include-h2?`, and the export is restricted to the rows whose `filter-column` is one
  of `filter-ids` when `filter-column` is given."
  [filter-column :- [:maybe :keyword]
   filter-ids    :- [:maybe [:sequential [:maybe [:or :int :string]]]]
   include-h2?   :- :boolean]
  (t2/reducible-select :model/Database
                       {:where [:and
                                (when filter-column
                                  [:in filter-column filter-ids])
                                [:= :router_database_id nil]
                                [:not= :is_sample true]
                                (when-not include-h2?
                                  [:not= :engine "h2"])]}))

(defn- table-ids-of-database-query
  [database-id]
  ^:allow-subquery {:from [(t2/table-name :model/Table)], :select [:id], :where [:= :db_id database-id]})

(mu/defn fields-exist-for-database?
  "Whether any Field belongs to a Table of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Field :table_id [:in (table-ids-of-database-query database-id)] {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn delete-childless-fields-for-database!
  "Delete the childless Fields of the Tables of the Database with `database-id`, returning the number deleted."
  [database-id :- ::lib.schema.id/database]
  (let [table-ids-query (table-ids-of-database-query database-id)
        extra-clause    (if (= (mdb/db-type) :mysql)
                          ;; double-wrapped subquery to work around the MySQL restriction on selecting from the
                          ;; DELETE target
                          [:not-in :id ^:allow-subquery {:select [:parent_id]
                                                         :from   [[^:allow-subquery {:select [:parent_id]
                                                                                     :from   [(t2/table-name :model/Field)]
                                                                                     :where  [:and
                                                                                              [:not= :parent_id nil]
                                                                                              [:in :table_id table-ids-query]]}
                                                                   :parent_fields]]}]
                          [:not [:exists ^:allow-subquery {:select [1]
                                                           :from   [[(t2/table-name :model/Field) :child_field]]
                                                           :where  [:= :child_field.parent_id :metabase_field.id]}]])]
    (t2/query-one {:delete-from (t2/table-name :model/Field)
                   :where       [:and
                                 [:in :table_id table-ids-query]
                                 extra-clause]})))

(mu/defn delete-cards-for-database-returning-ids-reducible
  "A reducible that deletes the Cards of the Database with `database-id` and yields their `:id`s (Postgres only)."
  [database-id :- ::lib.schema.id/database]
  (t2/reducible-query {:delete-from (t2/table-name :model/Card)
                       :where       [:= :database_id database-id]
                       :returning   [:id]}))

(mu/defn card-ids-for-database-reducible
  "A reducible of the `:id`s of the Cards of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/reducible-query {:from   [(t2/table-name :model/Card)]
                       :select [:id]
                       :where  [:= :database_id database-id]}))

(mu/defn delete-cards-for-database!
  "Delete the Cards of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/query {:delete-from (t2/table-name :model/Card)
             :where       [:= :database_id database-id]}))

(mu/defn active-tables-for-database
  "The active Tables of the Database with `database-id`, in case-insensitive display name order."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/Table :db_id database-id :active true {:from [(warehouse-schema-overlay/table-query)]
                                                           :order-by [[:%lower.display_name :asc]]}))

(mu/defn active-tables-for-databases
  "The active Tables of the Databases with `database-ids`, in database then display name order."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select :model/Table
             :db_id  [:in database-ids]
             :active true
             {:from [(warehouse-schema-overlay/table-query)]
              :order-by [[:db_id :asc] [:%lower.display_name :asc]]}))

(mu/defn active-table-ids-for-database
  "The ids of the active Tables of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-pks-set :model/Table, :db_id database-id, :active true {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn pk-fields-for-tables
  "The primary-key Fields of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Field :table_id [:in table-ids] :semantic_type (mdb/isa :type/PK)
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table, :id table-id {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))
