(ns metabase.audit-app.db
  "Application database queries for the audit app module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
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

(mu/defn collection-ids-by-entity-id :- [:map-of :string ::lib.schema.id/collection]
  "The ids of the Collections with `entity-ids`, by entity id."
  [entity-ids :- [:sequential :string]]
  (app-db/select-batched-map #(t2/select-fn->pk :entity_id :model/Collection :entity_id [:in %]) entity-ids))

(mu/defn dashboard-with-entity-id
  "The Dashboard with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Dashboard :entity_id entity-id))

(mu/defn cards
  "The Cards with `card-ids`, each with its `:name` and `:description`."
  [card-ids :- [:sequential [:maybe ::lib.schema.id/card]]]
  (if-let [ids (not-empty (into [] (comp (remove nil?) (distinct)) card-ids))]
    (app-db/select-batched #(t2/select [:model/Card :id :name :description] :id [:in %]) ids)
    []))

(mu/defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table, :id table-id))

(mu/defn insert-audit-logs!
  "Insert the AuditLog `rows` in one statement, in their order, returning the number inserted."
  [rows :- [:sequential [:map {:closed true}
                         [:topic    :keyword]
                         [:details  [:maybe ::audit-app.schema/audit-log.details]]
                         [:model    [:maybe :string]]
                         [:model_id [:maybe ms/PositiveInt]]
                         [:user_id  [:maybe ::lib.schema.id/user]]]]]
  (t2/insert! :model/AuditLog rows))

(mu/defn audit-log-ids-before :- [:sequential ms/PositiveInt]
  "The ids of up to `batch-size` of the AuditLogs whose `time-column` is at or before `cutoff`, lowest first."
  [time-column :- :keyword
   cutoff      :- ms/TemporalInstant
   batch-size  :- ms/PositiveInt]
  (vec (t2/select-pks-vec :model/AuditLog {:where    [:<= time-column cutoff]
                                           :order-by [[:id :asc]]
                                           :limit    batch-size})))

(mu/defn query-execution-partitions :- [:sequential :string]
  "The names of the partitions of `query_execution` attached in the current schema, read on the connection `conn`."
  [conn :- (ms/InstanceOfClass java.sql.Connection)]
  ;; the regclass::oid cast resolves to only the table in the current schema.
  ;; appdb with a non-default schema is not supported for new installs, but
  ;; there are users who have upgraded from ancient installs who have it.
  (mapv :relname (t2/query conn {:select [:c.relname]
                                 :from   [[:pg_inherits :i]]
                                 :join   [[:pg_class :p] [:= :i.inhparent :p.oid]
                                          [:pg_class :c] [:= :i.inhrelid :c.oid]]
                                 :where  [:= :p.oid [:cast [:cast (name (t2/table-name :model/QueryExecution)) :regclass]
                                                     :oid]]})))

(mu/defn earliest-started-at :- [:maybe [:or
                                         (ms/InstanceOfClass java.time.temporal.Temporal)
                                         (ms/InstanceOfClass java.util.Date)]]
  "The earliest `started_at` in the `query_execution` partition named `partition`, read on the connection `conn`."
  [conn      :- (ms/InstanceOfClass java.sql.Connection)
   partition :- :string]
  (:min (t2/query-one conn {:select [[[:min :started_at] :min]] :from [(keyword partition)]})))
