(ns metabase.visualization-settings.dynamic-goals
  "Dynamic goals: goal values in viz settings that reference another entity's value
  (`{:id 1, :type \"card\", :column \"total\"}`) instead of holding a literal number. Single source of
  truth for which settings carry goal values, so deriving the queries to run and substituting their
  results can never disagree. Mirrors `frontend/src/metabase/viz-core/lib/dynamic-goal-settings.ts`.")

(set! *warn-on-reflection* true)

(def ^:private goal-settings
  "Viz settings that hold goal values: `:value` keys hold a single goal value, `:segments` keys hold
  a sequence of segment maps with goal values at `:min`/`:max`."
  {:graph.goal_value :value
   :progress.goal    :value
   :gauge.segments   :segments
   :scalar.segments  :segments})

(def ^:private goal-toggles
  "Goal settings the chart only shows when another setting is on."
  {:graph.goal_value :graph.show_goal})

(defn- shown-goal-settings
  "[[goal-settings]] minus the ones this chart doesn't show."
  [viz-settings]
  (into {}
        (remove (fn [[setting _kind]]
                  (when-let [toggle (goal-toggles setting)]
                    (not (get viz-settings toggle)))))
        goal-settings))

(defn goal-source
  "The `{:id N, :type \"card\", :column \"name\"}` reference inside `goal-value`, or nil if it isn't one."
  [goal-value]
  (when (and (map? goal-value) (:id goal-value) (:type goal-value) (:column goal-value))
    (select-keys goal-value [:id :type :column])))

(defn- values-in
  [viz-settings settings]
  (->> settings
       (mapcat (fn [[setting kind]]
                 (case kind
                   :value    [(get viz-settings setting)]
                   :segments (mapcat (juxt :min :max) (get viz-settings setting)))))
       (remove nil?)))

(defn goal-values
  "All non-nil goal values present in `viz-settings`."
  [viz-settings]
  (values-in viz-settings goal-settings))

(defn shown-goal-values
  "Like [[goal-values]], minus the goals this chart doesn't show. Nothing renders those, so nothing
  needs to run the queries behind them."
  [viz-settings]
  (values-in viz-settings (shown-goal-settings viz-settings)))

(defn- update-values-in
  [viz-settings settings f]
  (reduce-kv
   (fn [viz setting kind]
     (if (nil? (get viz setting))
       viz
       (case kind
         :value    (update viz setting f)
         :segments (update viz setting (fn [segments]
                                         (mapv (fn [segment]
                                                 (cond-> segment
                                                   (some? (:min segment)) (update :min f)
                                                   (some? (:max segment)) (update :max f)))
                                               segments))))))
   viz-settings
   settings))

(defn update-goal-values
  "Rewrite every goal value in `viz-settings` with `f`. Absent settings and nil segment bounds are
  left untouched."
  [viz-settings f]
  (update-values-in viz-settings goal-settings f))

(defn- unresolved!
  [reason {:keys [id type column]}]
  (throw (ex-info (format "Unresolved dynamic goal (%s): %s %s, column %s" (name reason) type id column)
                  {:type ::unresolved-goal, :reason reason, :entity-type type, :entity-id id, :column column})))

(defn resolve-goal-value
  "Resolve `goal-value` against `referenced-entities` (a query result's `[:data :referenced_entities]`,
  keyed by entity type and then by id *string*). Literal numbers and self-column names pass through
  unchanged; an entity reference becomes the referenced column's first-row value. Throws
  `::unresolved-goal` with `:reason` `:never-ran`/`:query-failed`/`:column-not-found`/`:not-a-number`
  when the reference can't produce a finite number."
  [goal-value referenced-entities]
  (if-let [{entity-type :type, :keys [id column] :as ref} (goal-source goal-value)]
    (let [{:keys [status data] :as result} (get-in referenced-entities [entity-type (str id)])]
      ;; no entry at all: the entity was never queried (cancelled mid-run, or the caller derived its
      ;; specs from different settings than the ones being resolved here)
      (when-not result
        (unresolved! :never-ran ref))
      (when-not (and data (some-> status name (= "completed")))
        (unresolved! :query-failed ref))
      (let [idx (first (keep-indexed (fn [i col] (when (= column (:name col)) i)) (:cols data)))]
        (when-not idx
          (unresolved! :column-not-found ref))
        (let [value (nth (vec (first (:rows data))) idx nil)]
          (if (and (number? value) (Double/isFinite (double value)))
            value
            (unresolved! :not-a-number ref)))))
    goal-value))

(defn resolve-dynamic-goals
  "Substitute every shown goal value in `viz-settings` with its [[resolve-goal-value]] resolution. A goal
  the chart doesn't show is left as-is, so a failed reference behind it can't break the render. Toggles
  are read from `effective-settings`, which defaults to `viz-settings`: resolving one half of a
  card+dashcard pair has to consult the merge, since either half can flip `graph.show_goal`."
  ([viz-settings referenced-entities]
   (resolve-dynamic-goals viz-settings referenced-entities viz-settings))
  ([viz-settings referenced-entities effective-settings]
   (update-values-in viz-settings
                     (shown-goal-settings effective-settings)
                     #(resolve-goal-value % referenced-entities))))
