(ns metabase-enterprise.replacement.db
  "Application database queries for the replacement module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defn run
  "The ReplacementRun with `run-id`, or nil."
  [run-id]
  (t2/select-one :model/ReplacementRun :id run-id))

(defn runs
  "The ReplacementRuns, newest first, restricted to the `is-active` flag when given."
  [is-active]
  (t2/select :model/ReplacementRun
             (cond-> {:order-by [[:start_time :desc]]}
               (some? is-active) (assoc :where [:= :is_active is-active]))))

(defn active-run
  "The active ReplacementRun, or nil."
  []
  (t2/select-one :model/ReplacementRun :is_active true))

(defn run-active-flag
  "The `:is_active` row of the ReplacementRun with `run-id`, or nil."
  [run-id]
  (t2/select-one [:model/ReplacementRun :is_active] :id run-id))

(defn insert-run!
  "Insert `run` and return the new instance."
  [run]
  (t2/insert-returning-instance! :model/ReplacementRun run))

(defn update-run!
  "Apply `changes` to the ReplacementRun with `run-id`."
  [run-id changes]
  (t2/update! :model/ReplacementRun :id run-id changes))

(defn update-active-run!
  "Apply `changes` to the ReplacementRun with `run-id` if it is active."
  [run-id changes]
  (t2/update! :model/ReplacementRun :id run-id :is_active true changes))

(defn time-out-active-runs-older-than!
  "Mark the active ReplacementRuns started more than `age` `unit`s ago as timed out."
  [age unit]
  (t2/update! :model/ReplacementRun
              :is_active true
              :start_time [:< (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)]
              {:status    :timeout
               :is_active nil
               :end_time  :%now
               :message   "Timed out by metabase"}))

(defn cards-with-ids
  "The Cards with `ids`."
  [ids]
  (t2/select :model/Card :id [:in ids]))

(defn tables-with-ids
  "The Tables with `ids`."
  [ids]
  (t2/select :model/Table :id [:in ids]))

(defn dashboards-with-ids
  "The Dashboards with `ids`."
  [ids]
  (t2/select :model/Dashboard :id [:in ids]))

(defn transforms-with-ids
  "The Transforms with `ids`."
  [ids]
  (t2/select :model/Transform :id [:in ids]))

(defn segments-with-ids
  "The Segments with `ids`."
  [ids]
  (t2/select :model/Segment :id [:in ids]))

(defn measures-with-ids
  "The Measures with `ids`."
  [ids]
  (t2/select :model/Measure :id [:in ids]))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn cards-by-id
  "A map of Card ID to Card for `card-ids`."
  [card-ids]
  (t2/select-pk->fn identity :model/Card :id [:in card-ids]))

(defn card-database-id
  "The Database ID of the Card with `card-id`."
  [card-id]
  (t2/select-one-fn :database_id :model/Card :id card-id))

(defn card-with-table-exists?
  "Whether one of the Cards with `card-ids` is on the Table with `table-id`."
  [card-ids table-id]
  (t2/exists? :model/Card :id [:in card-ids] :table_id table-id))

(defn update-card!
  "Apply `changes` to the Card with `card-id`."
  [card-id changes]
  (t2/update! :model/Card card-id changes))

(defn transform
  "The Transform with `transform-id`, or nil."
  [transform-id]
  (t2/select-one :model/Transform :id transform-id))

(defn update-transform!
  "Apply `changes` to the Transform with `transform-id`."
  [transform-id changes]
  (t2/update! :model/Transform transform-id changes))

(defn segment
  "The Segment with `segment-id`, or nil."
  [segment-id]
  (t2/select-one :model/Segment :id segment-id))

(defn update-segment!
  "Apply `changes` to the Segment with `segment-id`."
  [segment-id changes]
  (t2/update! :model/Segment segment-id changes))

(defn measure
  "The Measure with `measure-id`, or nil."
  [measure-id]
  (t2/select-one :model/Measure :id measure-id))

(defn update-measure!
  "Apply `changes` to the Measure with `measure-id`."
  [measure-id changes]
  (t2/update! :model/Measure measure-id changes))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard :id dashboard-id))

(defn update-dashboard!
  "Apply `changes` to the Dashboard with `dashboard-id`."
  [dashboard-id changes]
  (t2/update! :model/Dashboard dashboard-id changes))

(defn dashboard-cards
  "The DashboardCards of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(defn update-dashboard-card!
  "Apply `changes` to the DashboardCard with `dashcard-id`."
  [dashcard-id changes]
  (t2/update! :model/DashboardCard dashcard-id changes))

(defn table-database-id
  "The Database ID of the Table with `table-id`."
  [table-id]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(defn active-fields-of-table
  "The active Fields of the Table with `table-id`."
  [table-id]
  (t2/select :model/Field :table_id table-id :active true))

(defn active-field-ids-of-table
  "The IDs of the active Fields of the Table with `table-id`."
  [table-id]
  (t2/select-pks-set :model/Field :table_id table-id :active true))

(defn active-fk-to-fields-exists?
  "Whether an active Field points at one of the Fields with `field-ids`."
  [field-ids]
  (t2/exists? :model/Field :fk_target_field_id [:in field-ids] :active true))

(defn update-field!
  "Apply `changes` to the Field with `field-id`."
  [field-id changes]
  (t2/update! :model/Field field-id changes))

(defn sandbox-exists-for-table?
  "Whether a Sandbox is defined on the Table with `table-id`."
  [table-id]
  (t2/exists? :model/Sandbox :table_id table-id))

(defn sandbox-card-ids
  "The IDs of the Cards Sandboxes are built on."
  []
  (t2/select-fn-set :card_id :model/Sandbox :card_id [:not= nil]))

(defn persisted-info-for-card
  "The PersistedInfo of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/PersistedInfo :card_id card-id))
