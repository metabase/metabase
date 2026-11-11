(ns metabase.audit-app.db
  "Application database queries for the audit app module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.audit-app.schema :as audit-app.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.toucan.core :as t2]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn cards
  "The Cards with `card-ids` (nil entries, e.g. from virtual dashcards, are ignored)."
  [card-ids :- [:sequential [:maybe ::lib.schema.id/card]]]
  (t2/select :model/Card :id [:in card-ids]))

(mu/defn audit-log-topic-exists?
  "Whether an AuditLog entry with `topic` exists."
  [topic :- [:or :keyword :string]]
  (t2/exists? :model/AuditLog :topic topic))

(mu/defn collection-with-entity-id
  "The Collection with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Collection :entity_id entity-id))

(mu/defn dashboard-with-entity-id
  "The Dashboard with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Dashboard :entity_id entity-id))

(mu/defn card-name-and-description
  "The name and description of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :name :description], :id card-id))

(mu/defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table, :id table-id))

(mu/defn insert-audit-log!
  "Insert an AuditLog entry."
  [topic      :- :keyword
   details    :- [:maybe ::audit-app.schema/audit-log.details]
   model-name :- [:maybe :string]
   model-id   :- [:maybe ms/PositiveInt]
   user-id    :- [:maybe ::lib.schema.id/user]]
  (t2/insert! :model/AuditLog
              :topic    topic
              :details  details
              :model    model-name
              :model_id model-id
              :user_id  user-id))

(mu/defn delete-oldest-by-id-subquery!
  "Delete up to `batch-size` of the `table` rows whose `time-column` is at or before `cutoff`, lowest ids first."
  [table       :- :keyword
   time-column :- :keyword
   cutoff      :- ms/TemporalInstant
   batch-size  :- ms/PositiveInt]
  (case [table time-column]
    [:query_execution :started_at]
    (t2/query-one {:delete-from :query_execution
                   :where       [:in :id (t2/fragment {:select   [:id]
                                                       :from     :query_execution
                                                       :where    [:<= :started_at cutoff]
                                                       :order-by [[:id :asc]]
                                                       :limit    batch-size})]})

    [:audit_log :timestamp]
    (t2/query-one {:delete-from :audit_log
                   :where       [:in :id (t2/fragment {:select   [:id]
                                                       :from     :audit_log
                                                       :where    [:<= :timestamp cutoff]
                                                       :order-by [[:id :asc]]
                                                       :limit    batch-size})]})

    [:view_log :timestamp]
    (t2/query-one {:delete-from :view_log
                   :where       [:in :id (t2/fragment {:select   [:id]
                                                       :from     :view_log
                                                       :where    [:<= :timestamp cutoff]
                                                       :order-by [[:id :asc]]
                                                       :limit    batch-size})]})))

(mu/defn delete-oldest-with-limit!
  "Delete up to `batch-size` of the `table` rows whose `time-column` is at or before `cutoff`."
  [table       :- :keyword
   time-column :- :keyword
   cutoff      :- ms/TemporalInstant
   batch-size  :- ms/PositiveInt]
  (case [table time-column]
    [:query_execution :started_at]
    (t2/query-one {:delete-from :query_execution
                   :where       [:<= :started_at cutoff]
                   :limit       batch-size})

    [:audit_log :timestamp]
    (t2/query-one {:delete-from :audit_log
                   :where       [:<= :timestamp cutoff]
                   :limit       batch-size})

    [:view_log :timestamp]
    (t2/query-one {:delete-from :view_log
                   :where       [:<= :timestamp cutoff]
                   :limit       batch-size})))
