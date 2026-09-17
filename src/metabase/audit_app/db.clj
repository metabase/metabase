(ns metabase.audit-app.db
  "Application database queries for the audit app module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.audit-app.schema :as audit-app.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mr/def ::topic
  "A topic of `audit_log`, as a keyword or the string Toucan 2 reads back for it."
  [:or :keyword :string])

(mr/def ::filters
  "Which AuditLog entries a query applies to. Keys mirror the columns of `audit_log`: a scalar matches that value and
  a set matches any of its values."
  [:map {:closed true}
   [:id    {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:topic {:optional true} [:or ::topic [:set ::topic]]]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::audit-app.schema/audit-log.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::audit-app.schema/audit-log.column
                                              [:tuple ::audit-app.schema/audit-log.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn audit-log-exists? :- :boolean
  "Whether an AuditLog entry matching `opts` exists."
  [opts :- [:maybe ::opts]]
  (apply t2/exists? :model/AuditLog (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-audit-log! :- ::audit-app.schema/audit-log
  "Insert the AuditLog `row` and return the inserted instance."
  [row :- ::audit-app.schema/audit-log.create]
  (t2/insert-returning-instance! :model/AuditLog row))

;;; -------------------------------- Queries used only by the audit-app module --------------------------------

(mu/defn cards
  "The Cards with `card-ids` (nil entries, e.g. from virtual dashcards, are ignored)."
  [card-ids :- [:sequential [:maybe ::lib.schema.id/card]]]
  (t2/select :model/Card :id [:in card-ids]))

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
  (t2/select-one [:model/Card :name :description :card_schema], :id card-id))

(mu/defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table, :id table-id {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

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
