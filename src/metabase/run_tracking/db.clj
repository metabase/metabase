(ns metabase.run-tracking.db
  "Application database queries for the run tracking module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private ActivePredicate
  "An `[column value]` pair identifying the 'still active/open' state for a run-tracked model, e.g.
  `[:is_active true]` or `[:status \"started\"]`. Plain data; db.clj turns it into the `[:= column value]`
  Honey SQL clause."
  [:tuple :keyword [:or :string :keyword :boolean :int]])

(def ^:private StaleUnit
  [:enum :second :minute :hour])

(def ^:private StaleSpec
  "A single staleness cutoff: a `model` row is stale under this spec when `column` is older than `age`
  `unit`s ago."
  [:map
   [:column :keyword]
   [:age pos-int?]
   [:unit StaleUnit]])

(defn- active-clause
  [[column value]]
  [:= column value])

(defn- cutoff
  "Honey SQL form for `(now - age unit)` in the app-db dialect."
  [age unit]
  (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit))

(defn- stale-clause
  "ORs together the `[:< column (cutoff age unit)]` predicate for each spec in `stale-specs`."
  [stale-specs]
  (let [clauses (mapv (fn [{:keys [column age unit]}]
                        [:< column (cutoff age unit)])
                      stale-specs)]
    (if (= 1 (count clauses))
      (first clauses)
      (into [:or] clauses))))

(mu/defn heartbeat!
  "Set `heartbeat-column` to now on the `model` rows in `ids` matching `active`, returning the number updated."
  [model            :- :keyword
   active           :- ActivePredicate
   heartbeat-column :- :keyword
   ids              :- [:sequential ms/PositiveInt]]
  (t2/query {:update (t2/table-name model)
             :set    {heartbeat-column :%now}
             :where  [:and (active-clause active) [:in :id ids]]}))

(mu/defn active-ids
  "The ids among `ids` of the `model` rows matching `active`."
  [model  :- :keyword
   active :- ActivePredicate
   ids    :- [:sequential ms/PositiveInt]]
  (t2/select-fn-set :id model {:where [:and [:in :id ids] (active-clause active)]}))

(mu/defn lock-active-stale-rows
  "The `model` rows matching `active` and any one of `stale`, locked for update."
  [model  :- :keyword
   active :- ActivePredicate
   stale  :- [:sequential {:min 1} StaleSpec]]
  (t2/select model {:where [:and (active-clause active) (stale-clause stale)] :for :update}))

(mu/defn set-terminal!
  "Apply the `terminal` column values to the `model` rows in `ids` matching `active`, returning the number updated.

  `terminal` is typed as a generic column -> value map rather than a closed schema because the columns are
  model-specific (TaskRun, TransformRun, TransformJobRun, TransformDagRun each have their own terminal-state
  columns, e.g. `{:status \"timeout\" :end_time :%now :is_active nil :message m}`); callers are trusted to pass
  real column names for `model`."
  [model    :- :keyword
   active   :- ActivePredicate
   ids      :- [:sequential ms/PositiveInt]
   terminal :- [:map-of :keyword [:maybe [:or :string :keyword :boolean :int]]]]
  (t2/query {:update (t2/table-name model)
             :set    terminal
             :where  [:and (active-clause active) [:in :id ids]]}))
