(ns metabase.util.ui-logic
  "This namespace has clojure implementations of logic currently found in the UI, but is needed for the
  backend. Idealling code here would be refactored such that the logic for this isn't needed in two places")

(defn- dimension-column?
  "A dimension column is any non-aggregation column"
  [col]
  (not= :aggregation (:source col)))

(defn- summable-column?
  "A summable column is any numeric column that isn't a special type like an FK or PK. It also excludes unix
  timestamps that are numbers, but with a special type of DateTime"
  [{:keys [base_type special_type]}]
  (and (or (isa? base_type :type/Number)
           (isa? special_type :type/Number))
       (not (isa? special_type :type/Special))
       (not (isa? special_type :type/DateTime))))

(defn- metric-column?
  "A metric column is any non-breakout column that is summable (numeric that isn't a special type like an FK/PK/Unix
  timestamp)"
  [col]
  (and (not= :breakout (:source col))
       (summable-column? col)))

(defn- default-goal-column-index
  "For graphs with goals, this function returns the index of the default column that should be used to compare against
  the goal. This follows the frontend code getDefaultLineAreaBarColumns closely with a slight change (detailed in the
  code)"
  [results]
  (let [graph-type (get-in results [:card :display])
        [col-1 col-2 col-3 :as all-cols] (get-in results [:result :data :cols])
        cols-count (count all-cols)]

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
  [results ^String column-name]
  (when column-name
    (first (map-indexed (fn [idx column]
                          (when (.equalsIgnoreCase column-name (:name column))
                            idx))
                        (get-in results [:result :data :cols])))))

(defn goal-comparison-column
  "For a given resultset, return the index of the column that should be used for the goal comparison. This can come
  from the visualization settings if the column is specified, or from our default column logic"
  [result]
  (or (column-name->index result (get-in result [:card :visualization_settings :graph.metrics]))
      (default-goal-column-index result)))

(defn find-goal-value
  "The goal value can come from a progress goal or a graph goal_value depending on it's type"
  [result]
  (case (get-in result [:card :display])

    (:area :bar :line)
    (get-in result [:card :visualization_settings :graph.goal_value])

    :progress
    (get-in result [:card :visualization_settings :progress.goal])

    nil))
