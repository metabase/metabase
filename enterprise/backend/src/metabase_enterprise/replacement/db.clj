(ns metabase-enterprise.replacement.db
  "Application database queries for the replacement module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions."
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
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn run
  "The ReplacementRun with `run-id`, or nil."
  [run-id :- ms/PositiveInt]
  (t2/select-one :model/ReplacementRun :id run-id))

(mu/defn runs
  "The ReplacementRuns, newest first, restricted to the `is-active` flag when given."
  [is-active :- [:maybe :boolean]]
  (t2/select :model/ReplacementRun
             (cond-> {:order-by [[:start_time :desc]]}
               (some? is-active) (assoc :where [:= :is_active is-active]))))

(mu/defn active-run
  "The active ReplacementRun, or nil."
  []
  (t2/select-one :model/ReplacementRun :is_active true))

(mu/defn run-active-flag
  "The `:is_active` row of the ReplacementRun with `run-id`, or nil."
  [run-id :- ms/PositiveInt]
  (t2/select-one [:model/ReplacementRun :is_active] :id run-id))

(mu/defn insert-run!
  "Insert `run` and return the new instance."
  [run :- ::replacement.schema/replacement-run.update]
  (t2/insert-returning-instance! :model/ReplacementRun run))

(mu/defn update-run!
  "Apply `changes` to the ReplacementRun with `run-id`, returning the number updated."
  [run-id  :- ms/PositiveInt
   changes :- ::replacement.schema/replacement-run.update]
  (t2/update! :model/ReplacementRun :id run-id changes))

(mu/defn update-active-run!
  "Apply `changes` to the ReplacementRun with `run-id` if it is active, returning the number updated."
  [run-id  :- ms/PositiveInt
   changes :- ::replacement.schema/replacement-run.update]
  (t2/update! :model/ReplacementRun :id run-id :is_active true changes))

(mu/defn time-out-active-runs-older-than!
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
  (t2/select :model/Table :id [:in ids]))

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
  (t2/select-one-fn :db_id :model/Table :id table-id))

(mu/defn active-fields-of-table
  "The active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Field :table_id table-id :active true))

(mu/defn active-field-ids-of-table
  "The IDs of the active Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field :table_id table-id :active true))

(mu/defn active-fk-to-fields-exists?
  "Whether an active Field points at one of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/exists? :model/Field :fk_target_field_id [:in field-ids] :active true))

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
