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

(defn- active-goal-settings
  "The [[goal-settings]] a renderer resolves for `viz-settings`: a hidden goal line has nothing to resolve.
  Mirrors `isGoalSettingActive` on the frontend."
  [viz-settings]
  (cond-> goal-settings
    (not (true? (:graph.show_goal viz-settings))) (dissoc :graph.goal_value)))

(defn goal-source
  "The `{:id N, :type \"card\", :column \"name\"}` reference inside `goal-value`, or nil if it isn't one."
  [goal-value]
  (when (and (map? goal-value) (:id goal-value) (:type goal-value) (:column goal-value))
    (select-keys goal-value [:id :type :column])))

(defn- goal-values-in
  [viz-settings settings]
  (->> settings
       (mapcat (fn [[setting kind]]
                 (case kind
                   :value    [(get viz-settings setting)]
                   :segments (mapcat (juxt :min :max) (get viz-settings setting)))))
       (remove nil?)))

(defn goal-values
  "All non-nil goal values present in `viz-settings`, including those no renderer resolves. Use
  [[active-goal-values]] to find out what a query has to answer."
  [viz-settings]
  (goal-values-in viz-settings goal-settings))

(defn active-goal-values
  "The non-nil goal values a renderer resolves for `viz-settings`: every [[goal-values]] entry except a
  hidden goal line's."
  [viz-settings]
  (goal-values-in viz-settings (active-goal-settings viz-settings)))

(defn- update-goal-values-in
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
  "Rewrite every goal value in `viz-settings` with `f`, including those no renderer resolves. Absent
  settings and nil segment bounds are left untouched."
  [viz-settings f]
  (update-goal-values-in viz-settings goal-settings f))

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
  "Substitute every [[active-goal-values]] entry in `viz-settings` with its [[resolve-goal-value]]
  resolution; a hidden goal line keeps its value as is. No-op when the settings hold no entity
  references."
  [viz-settings referenced-entities]
  (update-goal-values-in viz-settings
                         (active-goal-settings viz-settings)
                         #(resolve-goal-value % referenced-entities)))
