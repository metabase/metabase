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
  (if-let [user-specified-rowfn (y-axis-rowfn card result)]
    user-specified-rowfn
    (when-let [default-col-index (default-goal-column-index card result)]
      (fn [row]
        (nth row default-col-index)))))

(defn find-goal-value
  "The goal value can come from a progress goal or a graph goal_value depending on it's type"
  [result]
  (case (get-in result [:card :display])

    (:area :bar :line)
    (get-in result [:card :visualization_settings :graph.goal_value])

    :progress
    (get-in result [:card :visualization_settings :progress.goal])

    nil))
