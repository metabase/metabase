(ns metabase.visualization-settings.dynamic-goals
  "Dynamic goals: goal values in viz settings that reference another entity's value
  (`{:id 1, :type \"card\", :column \"total\"}`) instead of holding a literal number. Single source of
  truth for which settings carry goal values, so deriving the queries to run and substituting their
  results can never disagree. Mirrors `frontend/src/metabase/viz-core/lib/dynamic-goal-settings.ts`."
  (:require
   [metabase.util :as u]
   [metabase.visualization-settings.dynamic-goal-settings :as dynamic-goal-settings]))

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
  "[[goal-settings]] that a chart with `display` draws and doesn't hide through a toggle in `viz-settings`."
  [display viz-settings]
  (into {}
        (remove (fn [[setting _kind]]
                  (when-let [toggle (goal-toggles setting)]
                    (not (get viz-settings toggle)))))
        (select-keys goal-settings (dynamic-goal-settings/display->goal-settings (some-> display keyword)))))

(defn goal-source
  "The `{:id N, :type \"card\", :column \"name\"}` reference inside `goal-value`, or nil if it isn't one."
  [goal-value]
  (when (and (map? goal-value) (:id goal-value) (:type goal-value) (:column goal-value))
    ;; saving writes a keyword type as its string, so read it that way before the stored copy exists
    (cond-> (select-keys goal-value [:id :type :column])
      (keyword? (:type goal-value)) (update :type u/qualified-name))))

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
  "Like [[goal-values]], minus the goals a chart with `display` doesn't show: settings another display owns, and
  goals a toggle hides. Nothing renders those, so nothing needs to run the queries behind them. Toggles come from
  `effective-settings`, which defaults to `viz-settings`: reading one half of a card+dashcard pair has to consult the
  merge, since either half can flip `graph.show_goal`."
  ([display viz-settings]
   (shown-goal-values display viz-settings viz-settings))
  ([display viz-settings effective-settings]
   (values-in viz-settings (shown-goal-settings display effective-settings))))

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

(def ^:private visualizer-settings-path
  "Where a visualizer dashcard nests the settings of the chart it draws."
  [:visualization :settings])

(defn dashcard-goal-values
  "Like [[goal-values]], plus the goals a visualizer dashcard nests under `:visualization`. Hidden goals included,
  unlike [[shown-goal-values]]."
  [viz-settings]
  (concat (goal-values viz-settings)
          (goal-values (get-in viz-settings visualizer-settings-path))))

(defn goal-references
  "The `[type id column]` of each entity column the goals in `viz-settings` reference, from [[dashcard-goal-values]]."
  [viz-settings]
  (into #{} (comp (keep goal-source) (map (juxt :type :id :column))) (dashcard-goal-values viz-settings)))

(defn update-dashcard-goal-values
  "Like [[update-goal-values]], also rewriting the goals a visualizer dashcard nests under `:visualization`."
  [viz-settings f]
  (cond-> (update-goal-values viz-settings f)
    (map? (get-in viz-settings visualizer-settings-path))
    (update-in visualizer-settings-path update-goal-values f)))

(defn- visualizer-chart
  "The chart a visualizer dashcard draws, or nil when `dashcard` isn't one."
  [dashcard]
  (let [chart (get-in dashcard [:visualization_settings :visualization])]
    (when (map? chart)
      chart)))

(defn goal-scope
  "The chart `card` draws on `dashcard` (nil for a card on its own): its `:display`, the `:viz-settings` maps holding
  its goals, and the `:effective-settings` their toggles are read from. Nil when `card` is a series card of the
  dashcard, which draws no goals."
  [card dashcard]
  (let [dash-viz (:visualization_settings dashcard)
        chart    (visualizer-chart dashcard)]
    (cond
      (and (:card_id dashcard) (not= (:id card) (:card_id dashcard)))
      nil

      ;; the chart is drawn from the nested settings, extended by the dashcard's own; the card's settings don't apply
      chart
      (let [{:keys [display settings]} chart
            dash-viz                   (dissoc dash-viz :visualization)]
        ;; the FE draws a visualizer without a display as a bar chart
        {:display            (or display :bar)
         :viz-settings       [settings dash-viz]
         :effective-settings (merge settings dash-viz)})

      :else
      (let [card-viz (:visualization_settings card)]
        {:display            (:display card)
         :viz-settings       [card-viz dash-viz]
         :effective-settings (merge card-viz dash-viz)}))))

(defn- unresolved!
  [reason {:keys [id type column]}]
  (throw (ex-info (if type
                    (format "Unresolved dynamic goal (%s): %s %s, column %s" (name reason) type id column)
                    (format "Unresolved dynamic goal (%s): column %s" (name reason) column))
                  {:type ::unresolved-goal, :reason reason, :entity-type type, :entity-id id, :column column})))

(defn- first-row-value
  "Return the value in the first row of `column` in `data`.
  Throw `::unresolved-goal` with details from `ref` if the column is missing or the value is not a finite number."
  [{:keys [cols rows]} column ref]
  (let [idx (first (keep-indexed (fn [i col] (when (= column (:name col)) i)) cols))]
    (when-not idx
      (unresolved! :column-not-found ref))
    (let [value (nth (vec (first rows)) idx nil)]
      (if (and (number? value) (Double/isFinite (double value)))
        value
        (unresolved! :not-a-number ref)))))

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
      (first-row-value data column ref))
    goal-value))

(defn resolve-self-column-value
  "Resolves a column name to its value in the first row of the chart's query result `data`. Numbers and nil pass through.
  Used by renderers that do not run JavaScript. Entity references must be resolved by [[resolve-dynamic-goals]] first.
  Throw `::unresolved-goal` with reason `:column-not-found` for a missing column, `:not-a-number` for a value that is
  not a finite number, or `:never-ran` for an unresolved entity reference."
  [goal-value data]
  (if-let [ref (goal-source goal-value)]
    (unresolved! :never-ran ref)
    (if (string? goal-value)
      (first-row-value data goal-value {:column goal-value})
      goal-value)))

(defn- resolve-or-nil
  "`(resolve-fn goal-value)`, or nil when it throws `::unresolved-goal`."
  [resolve-fn goal-value]
  (try
    (resolve-fn goal-value)
    (catch clojure.lang.ExceptionInfo e
      (when-not (= ::unresolved-goal (:type (ex-data e)))
        (throw e)))))

(defn resolve-segments
  "Resolve every segment's `:min`/`:max` with `resolve-bound` (one of the resolvers above). A bound that can't
  resolve becomes nil, as if it was never set."
  [segments resolve-bound]
  (mapv (fn [segment]
          (cond-> segment
            (some? (:min segment)) (update :min #(resolve-or-nil resolve-bound %))
            (some? (:max segment)) (update :max #(resolve-or-nil resolve-bound %))))
        segments))

(defn resolve-dynamic-goals
  "Substitute every goal value a chart with `display` shows in `viz-settings` with its [[resolve-goal-value]]
  resolution, best-effort so the chart still renders: a goal value that can't resolve falls back to 0, and a segment
  bound that can't resolve becomes nil. A goal the chart doesn't show is left as-is. Toggles are read from
  `effective-settings`, which defaults to `viz-settings`: resolving one half of a card+dashcard pair has to consult
  the merge, since either half can flip `graph.show_goal`."
  ([display viz-settings referenced-entities]
   (resolve-dynamic-goals display viz-settings referenced-entities viz-settings))
  ([display viz-settings referenced-entities effective-settings]
   (let [resolve-fn #(resolve-goal-value % referenced-entities)]
     (reduce-kv
      (fn [viz setting kind]
        (if (nil? (get viz setting))
          viz
          (case kind
            :value    (update viz setting #(or (resolve-or-nil resolve-fn %) 0))
            :segments (update viz setting resolve-segments resolve-fn))))
      viz-settings
      (shown-goal-settings display effective-settings)))))

(defn resolve-drawn-goals
  "Resolve the goals `card` draws on `dashcard` (see [[goal-scope]]) against `data`'s `:referenced_entities`, in
  every settings map a renderer reads them from. Returns `[card dashcard data]`; goals the chart doesn't draw are left
  as stored."
  [card dashcard data]
  (if-let [{:keys [display effective-settings]} (goal-scope card dashcard)]
    (let [resolve-fn  #(resolve-dynamic-goals display % (:referenced_entities data) effective-settings)
          resolve-in  (fn [m path]
                        (cond-> m
                          (get-in m path) (update-in path resolve-fn)))
          ;; a visualizer's chart reads its goals from neither the card's settings nor the result's merge of them
          visualizer? (some? (visualizer-chart dashcard))]
      [(cond-> card
         (not visualizer?) (resolve-in [:visualization_settings]))
       (some-> dashcard
               (resolve-in [:visualization_settings])
               (resolve-in (into [:visualization_settings] visualizer-settings-path)))
       (cond-> data
         (not visualizer?) (resolve-in [:viz-settings]))])
    [card dashcard data]))
