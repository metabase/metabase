(ns metabase.util.ui-logic
  "This namespace has clojure implementations of logic currently found in the UI, but is needed for the
  backend. Idealling code here would be refactored such that the logic for this isn't needed in two places")

(set! *warn-on-reflection* true)

(defn- dimension-column?
  "A dimension column is any non-aggregation column"
  [col]
  (not= :aggregation (:source col)))

(defn- summable-column?
  "A summable column is any numeric column that isn't a relation type like an FK or PK. It also excludes unix
  timestamps that are numbers, but with an effective type of `Temporal`."
  [{base-type :base_type, effective-type :effective_type, semantic-type :semantic_type}]
  (and (isa? base-type :type/Number)
       (not (isa? effective-type :type/Temporal))
       (not (isa? semantic-type :Relation/*))))

(defn- metric-column?
  "A metric column is any non-breakout column that is summable (numeric that isn't a semantic type like an FK/PK/Unix
  timestamp)"
  [col]
  (and (not= :breakout (:source col))
       (summable-column? col)))

(defn- default-goal-column-index
  "For graphs with goals, this function returns the index of the default column that should be used to compare against
  the goal. This follows the frontend code getDefaultLineAreaBarColumns closely with a slight change (detailed in the
  code)"
  [{graph-type :display :as _card} {[col-1 col-2 col-3 :as all-cols] :cols :as _result}]
  (let [cols-count (count all-cols)]
    (cond
      ;; Progress goals return a single row and column, compare that
      (= :progress graph-type)
      0

      ;; Called DIMENSION_DIMENSION_METRIC in the UI, grab the metric third column for comparison
      (and (= cols-count 3)
           (dimension-column? col-1)
           (dimension-column? col-2)
           (metric-column? col-3))
      2

      ;; Called DIMENSION_METRIC in the UI, use the metric column for comparison
      (and (= cols-count 2)
           (dimension-column? col-1)
           (metric-column? col-2))
      1

      ;; Called DIMENSION_METRIC_METRIC in the UI, use the metric column for comparison. The UI returns all of the
      ;; metric columns here, but that causes an issue around which column the user intended to compare to the
      ;; goal. The below code always takes the first metric column, this might diverge from the UI
      (and (>= cols-count 3)
           (dimension-column? col-1)
           (every? metric-column? (rest all-cols)))
      1

      ;; If none of the above is true, return nil as we don't know what to compare the goal to
      :else nil)))

(defn- column-name->index
  "The results seq is seq of vectors, this function returns the index in that vector of the given `COLUMN-NAME`"
  [column-name {:keys [cols] :as _result}]
  (first (remove nil? (map-indexed (fn [idx column]
                                     (when (.equalsIgnoreCase (name column-name) (name (:name column)))
                                       idx))
                                   cols))))

(defn- graph-column-index [viz-kwd card results]
  (when-let [metrics-col-index (some-> card
                                       (get-in [:visualization_settings viz-kwd])
                                       first
                                       (column-name->index results))]
    (fn [row]
      (nth row metrics-col-index))))

(defn y-axis-rowfn
  "This is used as the Y-axis column in the UI"
  [card results]
  (graph-column-index :graph.metrics card results))

(defn x-axis-rowfn
  "This is used as the X-axis column in the UI"
  [card results]
  (graph-column-index :graph.dimensions card results))

(defn mult-y-axis-rowfn
  "This is used as the Y-axis column in the UI
  when we have comboes, which have more than one y axis."
  [card results]
  (let [metrics     (some-> card
                            (get-in [:visualization_settings :graph.metrics]))
        col-indices (keep #(column-name->index % results) metrics)]
    (when (seq col-indices)
      (fn [row]
        (let [res (vec (for [idx col-indices]
                         (nth row idx)))]
          (if (every? some? res)
            res
            nil))))))

(defn mult-x-axis-rowfn
  "This is used as the X-axis column in the UI
  when we have comboes, which have more than one x axis."
  [card results]
  (let [dimensions  (some-> card
                            (get-in [:visualization_settings :graph.dimensions]))
        col-indices (keep #(column-name->index % results) dimensions)]
    (when (seq col-indices)
      (fn [row]
        (let [res (vec (for [idx col-indices]
                         (nth row idx)))]
          (if (every? some? res)
            res
            nil))))))

(defn make-goal-comparison-rowfn
  "For a given resultset, return the index of the column that should be used for the goal comparison. This can come
  from the visualization settings if the column is specified, or from our default column logic"
  [card result]
  (let [user-specified-rowfn (y-axis-rowfn card result)
        default-col-index (default-goal-column-index card result)
        progress-value-col (when (= :progress (:display card))
                             (get-in card [:visualization_settings :progress.value]))
        progress-col-index (when progress-value-col
                             (column-name->index progress-value-col result))
        first-numeric-col-index (when (and (= :progress (:display card))
                                           (not progress-col-index))
                                  (first (keep-indexed (fn [idx col]
                                                         (when (isa? (:base_type col) :type/Number)
                                                           idx))
                                                       (:cols result))))]
    (cond
      user-specified-rowfn
      user-specified-rowfn

      progress-col-index
      (fn [row]
        (nth row progress-col-index))

      first-numeric-col-index
      (fn [row]
        (nth row first-numeric-col-index))

      default-col-index
      (fn [row]
        (nth row default-col-index))

      :else nil)))

(defn- extract-goal-value-from-column
  "Extracts goal value from a column reference, similar to frontend getGoalValue"
  [goal-setting columns rows]
  (when (string? goal-setting)
    (let [column-index (->> columns
                            (map-indexed vector)
                            (filter #(= goal-setting (:name (second %))))
                            first
                            first)]
      (when (and column-index (seq rows))
        (let [raw-value (nth (first rows) column-index nil)]
          (cond
            (nil? raw-value) 0
            (= "Infinity" raw-value) ##Inf
            (number? raw-value) raw-value
            :else 0))))))

(defn find-goal-value
  "The goal value can come from a progress goal or a graph goal_value depending on it's type.
  For progress charts, the goal can be either a number or a column reference.
  Matches the frontend behavior: invalid goals fallback to default value (0)."
  [result]
  (case (get-in result [:card :display])

    (:area :bar :line)
    (get-in result [:card :visualization_settings :graph.goal_value])

    :progress
    (let [goal-setting (get-in result [:card :visualization_settings :progress.goal])
          columns (get-in result [:result :data :cols])
          rows (get-in result [:result :data :rows])]
      (cond
        (number? goal-setting)
        goal-setting

        (string? goal-setting)
        (if-let [column (->> columns (filter #(= goal-setting (:name %))) first)]
          (if (isa? (:base_type column) :type/Number)
            (extract-goal-value-from-column goal-setting columns rows)
            0)
          0)

        :else 0))

    nil))
