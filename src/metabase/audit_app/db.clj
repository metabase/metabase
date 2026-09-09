(ns metabase.audit-app.db
  "Application database queries for the audit app module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.collections.schema :as collections.schema]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn cards :- [:sequential ::queries.schema/card]
  "The Cards with `card-ids` (nil entries, e.g. from virtual dashcards, are ignored)."
  [card-ids :- [:sequential [:maybe ::lib.schema.id/card]]]
  (t2/select :model/Card :id [:in card-ids]))

(mu/defn audit-log-topic-exists? :- :boolean
  "Whether an AuditLog entry with `topic` exists."
  [topic :- [:or :keyword :string]]
  (t2/exists? :model/AuditLog :topic topic))

(mu/defn collection-with-entity-id :- [:maybe ::collections.schema/collection]
  "The Collection with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Collection :entity_id entity-id))

(mu/defn dashboard-with-entity-id :- [:maybe ::dashboards.schema/dashboard]
  "The Dashboard with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Dashboard :entity_id entity-id))

(def ^:private CardNameAndDescription
  "Rows returned by [[card-name-and-description]]."
  (mut/select-keys ::queries.schema/card [:name :description :card_schema]))

(mu/defn card-name-and-description :- [:maybe CardNameAndDescription]
  "The name and description of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :name :description :card_schema], :id card-id))

(mu/defn table-database-id :- [:maybe ::lib.schema.id/database]
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table, :id table-id))

(mu/defn insert-audit-log! :- :int
  "Insert an AuditLog entry."
  [topic      :- :keyword
   details    :- [:maybe :map]
   model-name :- [:maybe :string]
   model-id   :- [:maybe ms/PositiveInt]
   user-id    :- [:maybe ::lib.schema.id/user]]
  (t2/insert! :model/AuditLog
              :topic    topic
              :details  details
              :model    model-name
              :model_id model-id
              :user_id  user-id))

(mu/defn delete-oldest-by-id-subquery! :- :int
  "Delete up to `batch-size` of the `table` rows whose `time-column` is at or before `cutoff`, lowest ids first."
  [table       :- :keyword
   time-column :- :keyword
   cutoff      :- ms/TemporalInstant
   batch-size  :- ms/PositiveInt]
  (t2/query-one {:delete-from table
                 :where [:in
                         :id
                         ^:allow-subquery {:select [:id]
                                           :from table
                                           :where [:<= time-column cutoff]
                                           :order-by [[:id :asc]]
                                           :limit batch-size}]}))

(mu/defn delete-oldest-with-limit! :- :int
  "Delete up to `batch-size` of the `table` rows whose `time-column` is at or before `cutoff`."
  [table       :- :keyword
   time-column :- :keyword
   cutoff      :- ms/TemporalInstant
   batch-size  :- ms/PositiveInt]
  (t2/query-one {:delete-from table
                 :where [:<= time-column cutoff]
                 :limit batch-size}))
