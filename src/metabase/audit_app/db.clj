(ns metabase.audit-app.db
  "Application database queries for the audit app module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn cards
  "The Cards with `card-ids`."
  [card-ids]
  (t2/select :model/Card :id [:in card-ids]))

(defn audit-log-topic-exists?
  "Whether an AuditLog entry with `topic` exists."
  [topic]
  (t2/exists? :model/AuditLog :topic topic))

(defn entity-by-entity-id
  "The `model` row with `entity-id`, or nil."
  [model entity-id]
  (t2/select-one model :entity_id entity-id))

(defn card-name-and-description
  "The name and description of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :name :description :card_schema], :id card-id))

(defn hydrate-user-group-memberships
  "Hydrate `:user_group_memberships` onto `user`."
  [user]
  (t2/hydrate user :user_group_memberships))

(defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one-fn :db_id :model/Table, :id table-id))

(defn insert-audit-log!
  "Insert an AuditLog entry."
  [topic details model-name model-id user-id]
  (t2/insert! :model/AuditLog
              :topic    topic
              :details  details
              :model    model-name
              :model_id model-id
              :user_id  user-id))

(defn delete-oldest-rows-by-id-subquery!
  "Delete up to `batch-size` of the `table` rows whose `time-column` is at or before `cutoff`, lowest ids first."
  [table time-column cutoff batch-size]
  (t2/query-one {:delete-from table
                 :where [:in
                         :id
                         ^:allow-subquery {:select [:id]
                                           :from table
                                           :where [:<= time-column cutoff]
                                           :order-by [[:id :asc]]
                                           :limit batch-size}]}))

(defn delete-oldest-rows-with-limit!
  "Delete up to `batch-size` of the `table` rows whose `time-column` is at or before `cutoff`."
  [table time-column cutoff batch-size]
  (t2/query-one {:delete-from table
                 :where [:<= time-column cutoff]
                 :limit batch-size}))
