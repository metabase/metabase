(ns metabase.audit-app.db
  "Application database queries for the audit app module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.audit-app.schema :as audit-app.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

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

(mu/defn insert-audit-logs!
  "Insert the AuditLog `rows` in one statement, in their order, returning the number inserted."
  [rows :- [:sequential [:map {:closed true}
                         [:topic    :keyword]
                         [:details  [:maybe ::audit-app.schema/audit-log.details]]
                         [:model    [:maybe :string]]
                         [:model_id [:maybe ms/PositiveInt]]
                         [:user_id  [:maybe ::lib.schema.id/user]]]]]
  (t2/insert! :model/AuditLog rows))

(mu/defn delete-oldest-by-id-subquery!
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

(mu/defn delete-oldest-with-limit!
  "Delete up to `batch-size` of the `table` rows whose `time-column` is at or before `cutoff`."
  [table       :- :keyword
   time-column :- :keyword
   cutoff      :- ms/TemporalInstant
   batch-size  :- ms/PositiveInt]
  (t2/query-one {:delete-from table
                 :where [:<= time-column cutoff]
                 :limit batch-size}))

(mu/defn parent-ids
  "The ids that the `parent-key` column of the `model` rows with `ids` holds, by id."
  [model      :- :keyword
   parent-key :- :keyword
   ids        :- [:sequential ms/PositiveInt]]
  (if (seq ids)
    (into {} (t2/select-fn-vec (juxt :id parent-key) [model :id parent-key] :id [:in ids]))
    {}))

(mu/defn row
  "The row of `model` with `id`, or nil."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one model :id [:auto/param id]))
