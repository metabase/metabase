(ns metabase.util.dynamic-goals
  "Dynamic goals: goal values in viz settings that reference another card's value
  (`{:card_id 1, :column \"total\"}`) instead of holding a literal number. Single source of truth for
  which settings carry goal values, so deriving the queries to run and substituting their results
  can never disagree. Mirrors `frontend/src/metabase/visualizations/lib/dynamic-goals.ts`.")

(set! *warn-on-reflection* true)

(def ^:private goal-settings
  "Viz settings that hold goal values: `:scalar` keys hold a single goal value, `:segments` keys hold
  a sequence of segment maps with goal values at `:min`/`:max`."
  {:graph.goal_value :scalar
   :progress.goal    :scalar
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

(defn- unresolved!
  [reason {:keys [card_id column]}]
  (throw (ex-info (format "Unresolved dynamic goal (%s): card %s, column %s" (name reason) card_id column)
                  {:type ::unresolved-goal, :reason reason, :card-id card_id, :column column})))

(defn resolve-goal-value
  "Resolve `goal-value` against `referenced-cards` (a query result's `[:data :referenced_cards]`,
  keyed by card id *string*). Literal numbers and self-column names pass through unchanged; a card
  reference becomes the referenced column's first-row value. Throws `::unresolved-goal` with
  `:reason` `:query-failed`/`:column-not-found`/`:not-a-number` when the reference can't produce a
  finite number."
  [goal-value referenced-cards]
  (if-let [{:keys [card_id column] :as ref} (card-ref goal-value)]
    (let [{:keys [status data]} (get referenced-cards (str card_id))]
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
  "Substitute every goal value in `viz-settings` with its [[resolve-goal-value]] resolution. No-op
  when the settings hold no card references."
  [viz-settings referenced-cards]
  (update-goal-values viz-settings #(resolve-goal-value % referenced-cards)))
