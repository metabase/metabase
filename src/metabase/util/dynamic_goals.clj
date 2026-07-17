(ns metabase.util.dynamic-goals
  "Dynamic goals: goal values in viz settings that reference another card's value
  (`{:card_id 1, :column \"total\"}`) instead of holding a literal number. Single source of truth for
  which settings carry goal values, so deriving the queries to run and substituting their results
  can never disagree. Mirrors `frontend/src/metabase/visualizations/lib/dynamic-goals.ts`.")

(def ^:private goal-settings
  "Viz settings that hold goal values: `:scalar` keys hold a single goal value, `:segments` keys hold
  a sequence of segment maps with goal values at `:min`/`:max`."
  {:graph.goal_value :scalar
   :gauge.segments   :segments
   :scalar.segments  :segments})

(defn card-ref
  "The `{:card_id N, :column \"name\"}` reference inside `goal-value`, or nil if it isn't one."
  [goal-value]
  (when (and (map? goal-value) (:card_id goal-value) (:column goal-value))
    (select-keys goal-value [:card_id :column])))

(defn goal-values
  "All non-nil goal values present in `viz-settings`."
  [viz-settings]
  (->> goal-settings
       (mapcat (fn [[setting kind]]
                 (case kind
                   :scalar   [(get viz-settings setting)]
                   :segments (mapcat (juxt :min :max) (get viz-settings setting)))))
       (remove nil?)))

(defn update-goal-values
  "Rewrite every goal value in `viz-settings` with `f`. Absent settings and nil segment bounds are
  left untouched."
  [viz-settings f]
  (reduce-kv
   (fn [viz setting kind]
     (if (nil? (get viz setting))
       viz
       (case kind
         :scalar   (update viz setting f)
         :segments (update viz setting (fn [segments]
                                         (mapv (fn [segment]
                                                 (cond-> segment
                                                   (some? (:min segment)) (update :min f)
                                                   (some? (:max segment)) (update :max f)))
                                               segments))))))
   viz-settings
   goal-settings))
