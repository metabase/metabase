(ns metabase.query-processor.middleware.cumulative-aggregations
  "Middlware for handling cumulative count and cumulative sum aggregations in Clojure-land. In 0.50.0+, this middleware
  is only used for drivers that do not have native implementations of `:window-functions`; see the driver changelog
  for 0.50.0 for more information.

  For queries with more than one breakout, we reset the totals every time breakouts other than the last one change, e.g.

    ;; city date       count cumulative_count
    LBC     2024-01-01 10    10
    LBC     2024-01-02 2     12
    LBC     2024-01-02 4     16
    SF      2024-01-01 3     3
    SF      2024-01-01 1     4
    SF      2024-01-02 2     6

  Rather than doing a cumulative sum across the entire set of query results -- see #2862 for more information."
  (:require
   [metabase.driver :as driver]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.malli :as mu]))

;;;; Pre-processing

(defn- diff-indexes
  "Given two sequential collections, return indecies that are different between the two."
  [coll-1 coll-2]
  (into #{}
        (keep-indexed (fn [i transformed?]
                        (when transformed?
                          i)))
        (map not= coll-1 coll-2)))

(mu/defn ^:private replace-cumulative-ags :- mbql.s/Query
  "Replace `cum-count` and `cum-sum` aggregations in `query` with `count` and `sum` aggregations, respectively."
  [query]
  (lib.util.match/replace-in query [:query :aggregation]
    ;; cumulative count doesn't neccesarily have a field-id arg
    [:cum-count]       [:count]
    [:cum-count field] [:count field]
    [:cum-sum field]   [:sum field]))

(defn rewrite-cumulative-aggregations
  "Pre-processing middleware. Rewrite `:cum-count` and `:cum-sum` aggregations as `:count` and `:sum` respectively. Add
  information about the indecies of the replaced aggregations under the `::replaced-indexes` key."
  [{{breakouts :breakout, aggregations :aggregation} :query, :as query}]
  (cond
    ;; no need to rewrite `:cum-sum` and `:cum-count` functions, this driver supports native window function versions
    (driver/database-supports? driver/*driver* :window-functions (lib.metadata/database (qp.store/metadata-provider)))
    query

    ;; nothing to rewrite
    (not (lib.util.match/match aggregations #{:cum-count :cum-sum}))
    query

    :else
    (let [query'            (replace-cumulative-ags query)
          ;; figure out which indexes are being changed in the results. Since breakouts always get included in
          ;; results first we need to offset the indexes to change by the number of breakouts
          replaced-indexes (set (for [i (diff-indexes (-> query  :query :aggregation)
                                                      (-> query' :query :aggregation))]
                                  (+ (count breakouts) i)))]
      (cond-> query'
        (seq replaced-indexes) (assoc ::replaced-indexes replaced-indexes)))))


;;;; Post-processing

(defn- partition-values [num-breakouts row]
  (when (> num-breakouts 1)
    (take (dec num-breakouts) row)))

(defn- add-values-from-last-row
  "Update values in `row` by adding values from `last-row` for a set of specified indexes.

    ((add-values-from-last-row-fn 0) #{0} [100 200] [50 60]) ; -> [150 60]

  We need to reset the totals every time breakouts other than the last change values --
  see [[metabase.query-processor.middleware.cumulative-aggregations]] docstring for more info."
  [num-breakouts indexes-to-sum last-row row]
  (if (or (not last-row)
          (not= (partition-values num-breakouts last-row)
                (partition-values num-breakouts row)))
    row
    (reduce (fn [row index]
              (update row index (partial (fnil + 0 0) (nth last-row index))))
            (vec row)
            indexes-to-sum)))

(defn- cumulative-ags-xform [num-breakouts replaced-indexes rf]
  {:pre [(fn? rf)]}
  (let [last-row (volatile! nil)]
    (fn
      ([] (rf))

      ([result] (rf result))

      ([result row]
       (let [row' (add-values-from-last-row num-breakouts replaced-indexes @last-row row)]
         (vreset! last-row row')
         (rf result row'))))))

(defn sum-cumulative-aggregation-columns
  "Post-processing middleware. Sum the cumulative count aggregations that were rewritten
  by [[rewrite-cumulative-aggregations]] in Clojure-land."
  [{::keys [replaced-indexes] inner-query :query, :as _query} rff]
  (if (seq replaced-indexes)
    (fn sum-cumulative-aggregation-columns-rff* [metadata]
      (let [num-breakouts (count (:breakout inner-query))]
        (cumulative-ags-xform num-breakouts replaced-indexes (rff metadata))))
    rff))
