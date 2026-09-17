(ns metabase-enterprise.replacement.db
  "Application database queries for `:model/ReplacementRun`. Every function following [[::replacement-run-opts]] is a
  direct Toucan 2 call with no additional logic; queries that do not fit it live in the replacement-only section at
  the bottom of this namespace."
  (:require
   [metabase-enterprise.replacement.schema :as replacement.schema]
   [metabase.app-db.core :as mdb]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.measures.schema :as measures.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.segments.schema :as segments.schema]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mr/def ::replacement-run-filters
  "Which ReplacementRuns a query applies to. Keys mirror the columns of `source_replacement_run`: a scalar matches
  that value and a set matches any of its values."
  [:map {:closed true}
   [:id        {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:is_active {:optional true} :boolean]])

(mr/def ::replacement-run-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::replacement-run-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::replacement.schema/replacement-run.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::replacement.schema/replacement-run.column
                                              [:tuple ::replacement.schema/replacement-run.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/ReplacementRun columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-replacement-runs :- [:sequential ::replacement.schema/replacement-run.partial]
  "The ReplacementRuns matching `opts`."
  ([]
   (select-replacement-runs nil))
  ([{:keys [columns] :as opts} :- [:maybe ::replacement-run-opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-replacement-run :- [:maybe ::replacement.schema/replacement-run.partial]
  "The first ReplacementRun matching `opts`, or nil."
  ([]
   (select-one-replacement-run nil))
  ([{:keys [columns] :as opts} :- [:maybe ::replacement-run-opts]]
   (apply t2/select-one (->model columns) (->args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-replacement-run! :- ::replacement.schema/replacement-run
  "Insert the ReplacementRun `row` and return the inserted instance."
  [row :- ::replacement.schema/replacement-run.create]
  (t2/insert-returning-instance! :model/ReplacementRun row))

(mu/defn update-replacement-runs! :- :int
  "Apply `changes` to every ReplacementRun matching `opts`, returning the number updated."
  [opts    :- [:maybe ::replacement-run-opts]
   changes :- ::replacement.schema/replacement-run.update]
  (apply t2/update! :model/ReplacementRun (conj (->kv-args opts) changes)))

;;; ------------------------------- Queries used only by the replacement module -------------------------------

(mu/defn time-out-active-runs-older-than! :- :int
  "Mark the active ReplacementRuns started more than `age` `unit`s ago as timed out, returning the number updated."
  [age  :- ms/PositiveInt
   unit :- :keyword]
  (t2/update! :model/ReplacementRun
              :is_active true
              :start_time [:< (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)]
              {:status    :timeout
               :is_active nil
               :end_time  :%now
               :message   "Timed out by metabase"}))

(mu/defn cards-with-ids
  "The Cards with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/Card :id [:in ids]))

(mu/defn tables-with-ids
  "The Tables with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/Table :id [:in ids] {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn dashboards-with-ids
  "The Dashboards with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/Dashboard :id [:in ids]))

(mu/defn transforms-with-ids
  "The Transforms with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/Transform :id [:in ids]))

(mu/defn segments-with-ids
  "The Segments with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/Segment :id [:in ids]))

(mu/defn measures-with-ids
  "The Measures with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/Measure :id [:in ids]))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn cards-by-id
  "A map of Card ID to Card for `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select-pk->fn identity :model/Card :id [:in card-ids]))

(mu/defn card-database-id
  "The Database ID of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :database_id :model/Card :id card-id))

(mu/defn card-with-table-exists?
  "Whether one of the Cards with `card-ids` is on the Table with `table-id`."
  [card-ids :- [:set ::lib.schema.id/card]
   table-id :- ::lib.schema.id/table]
  (t2/exists? :model/Card :id [:in card-ids] :table_id table-id))

(mu/defn update-card!
  "Apply `changes` to the Card with `card-id`, returning the number updated."
  [card-id :- ::lib.schema.id/card
   changes :- ::queries.schema/card.update]
  (t2/update! :model/Card card-id changes))

(mu/defn transform
  "The Transform with `transform-id`, or nil."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-one :model/Transform :id transform-id))

(mu/defn update-transform!
  "Apply `changes` to the Transform with `transform-id`, returning the number updated."
  [transform-id :- ::lib.schema.id/transform
   changes      :- ::transforms.schema/transform.update]
  (t2/update! :model/Transform transform-id changes))

(mu/defn segment
  "The Segment with `segment-id`, or nil."
  [segment-id :- ::lib.schema.id/segment]
  (t2/select-one :model/Segment :id segment-id))

(mu/defn update-segment!
  "Apply `changes` to the Segment with `segment-id`, returning the number updated."
  [segment-id :- ::lib.schema.id/segment
   changes    :- ::segments.schema/segment.update]
  (t2/update! :model/Segment segment-id changes))

(mu/defn measure
  "The Measure with `measure-id`, or nil."
  [measure-id :- ::lib.schema.id/measure]
  (t2/select-one :model/Measure :id measure-id))

(mu/defn update-measure!
  "Apply `changes` to the Measure with `measure-id`, returning the number updated."
  [measure-id :- ::lib.schema.id/measure
   changes    :- ::measures.schema/measure.update]
  (t2/update! :model/Measure measure-id changes))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn update-dashboard!
  "Apply `changes` to the Dashboard with `dashboard-id`, returning the number updated."
  [dashboard-id :- ::lib.schema.id/dashboard
   changes      :- ::dashboards.schema/dashboard.update]
  (t2/update! :model/Dashboard dashboard-id changes))

(mu/defn dashboard-cards
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(mu/defn update-dashboard-card!
  "Apply `changes` to the DashboardCard with `dashcard-id`, returning the number updated."
  [dashcard-id :- ::lib.schema.id/dashcard
   changes     :- ::dashboards.schema/dashboard-card.update]
  (t2/update! :model/DashboardCard dashcard-id changes))

(mu/defn table-database-id
  "The Database ID of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table :id table-id {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn active-fields-of-table
  "The active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Field :table_id table-id :active true {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn active-field-ids-of-table
  "The IDs of the active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field :table_id table-id :active true {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn active-fk-to-fields-exists?
  "Whether an active Field points at one of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/exists? :model/Field :fk_target_field_id [:in field-ids] :active true {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn sandbox-exists-for-table?
  "Whether a Sandbox is defined on the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/exists? :model/Sandbox :table_id table-id))

(mu/defn sandbox-card-ids
  "The IDs of the Cards Sandboxes are built on."
  []
  (t2/select-fn-set :card_id :model/Sandbox :card_id [:not= nil]))

(mu/defn persisted-info-for-card
  "The PersistedInfo of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/PersistedInfo :card_id card-id))
