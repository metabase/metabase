(ns metabase.explorations.interestingness
  "Bridge between the explorations worker and `metabase.interestingness.core`.

  Each `:model/ExplorationQuery` is exactly one breakout dimension by one
  aggregation, so its QP result has two columns: the dim and the measure. This
  namespace converts that result into the `chart-config` shape that
  `metabase.interestingness.chart/chart-interestingness` consumes."
  (:require
   [metabase.types.core]))

(set! *warn-on-reflection* true)

(defn- col->chart-type
  [col]
  (let [t (or (some-> (:effective_type col) keyword)
              (some-> (:base_type col) keyword))]
    (cond
      (nil? t)                "string"
      (isa? t :type/DateTime) "datetime"
      (isa? t :type/Date)     "date"
      (isa? t :type/Time)     "time"
      (isa? t :type/Boolean)  "boolean"
      (isa? t :type/Number)   "number"
      :else                   "string")))

(defn- numeric-col?
  [col]
  (some-> (or (:effective_type col) (:base_type col)) keyword (isa? :type/Number)))

(defn- pick-indices
  "With exactly two cols, pick the metric (numeric) and dim (the other).
  Returns `[dim-idx metric-idx]` or nil when no numeric col exists."
  [cols]
  (let [metric-idx (first (keep-indexed (fn [i c] (when (numeric-col? c) i)) cols))]
    (when metric-idx
      [(- 1 metric-idx) metric-idx])))

(defn- pair-filter
  "Drop rows whose metric value isn't a number; preserve x/y alignment."
  [rows dim-idx metric-idx]
  (let [pairs (keep (fn [r]
                      (let [y (nth r metric-idx nil)]
                        (when (number? y)
                          [(nth r dim-idx nil) y])))
                    rows)]
    [(mapv first pairs) (mapv second pairs)]))

(defn- effective-display-type
  "If the query's `:display` is nil or one of the chart-less display types,
  pick a default based on the dimension's chart-type so the scorer doesn't see
  `:unknown`."
  [display dim-chart-type]
  (if (or (nil? display) (#{"table" "scalar" "smartscalar"} display))
    (if (#{"datetime" "date" "time"} dim-chart-type) "line" "bar")
    display))

(defn qp-result->chart-config
  "Build a `metabase.interestingness.chart.types/chart-config` from an
  `:model/ExplorationQuery` row and its in-memory QP result. Returns nil when
  the result can't be reasonably scored: no rows, no numeric column, or fewer
  than two cols."
  [exploration-query qp-result]
  (let [cols (get-in qp-result [:data :cols])
        rows (get-in qp-result [:data :rows])]
    (when (and (= 2 (count cols)) (seq rows))
      (when-let [[dim-idx metric-idx] (pick-indices cols)]
        (let [dim-col          (nth cols dim-idx)
              metric-col       (nth cols metric-idx)
              dim-chart-type   (col->chart-type dim-col)
              [x-values y-values] (pair-filter rows dim-idx metric-idx)]
          (when (seq y-values)
            (let [series-name (or (:display_name metric-col) (:name metric-col) "value")]
              {:display_type (effective-display-type (:display exploration-query) dim-chart-type)
               :title        (:name exploration-query)
               :series       {series-name
                              {:x            {:name (or (:display_name dim-col) (:name dim-col))
                                              :type dim-chart-type}
                               :y            {:name series-name
                                              :type "number"}
                               :x_values     x-values
                               :y_values     y-values
                               :display_name series-name}}})))))))
