(ns metabase.indexes-rest.db
  "Application database queries for the indexes REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private TableIndexRow
  "A whole (or partial) row for the `metabase_table_indexes` table."
  [:map {:closed true}
   [:id                {:optional true} :any]
   [:transform_id      {:optional true} :any]
   [:index_name        {:optional true} :any]
   [:structured        {:optional true} :any]
   [:status            {:optional true} :any]
   [:error_message     {:optional true} :any]
   [:created_by        {:optional true} :any]
   [:created_at        {:optional true} :any]
   [:updated_at        {:optional true} :any]
   [:last_executed_at  {:optional true} :any]])

(mu/defn database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/Database database-id))

(mu/defn table-index :- [:maybe (ms/InstanceOf :model/TableIndex)]
  "The TableIndex with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TableIndex :id id))

(mu/defn insert-table-index! :- (ms/InstanceOf :model/TableIndex)
  "Insert the TableIndex `row` and return the inserted instance."
  [row :- TableIndexRow]
  (t2/insert-returning-instance! :model/TableIndex row))

(mu/defn set-table-index-structured! :- :int
  "Set the `structured` definition of the TableIndex with `id`."
  [id         :- ms/PositiveInt
   structured :- :any]
  (t2/update! :model/TableIndex id {:structured structured}))

(mu/defn set-table-index-status! :- :int
  "Set the `status` of the TableIndex with `id`."
  [id     :- ms/PositiveInt
   status :- [:or :keyword :string]]
  (t2/update! :model/TableIndex id {:status status}))
