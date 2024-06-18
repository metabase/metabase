(ns metabase.query-processor.middleware.cumulative-aggregations
  "Middlware for handling cumulative count and cumulative sum aggregations in Clojure-land. In 0.50.0+, this middleware
  is only used for drivers that do not have native implementations of `:window-functions/cumulative`; see the driver
  changelog for 0.50.0 for more information.

  For queries with more than one breakout, we reset the totals every time breakouts other than the first one change,
  e.g.

    date       city  count cumulative_count
    2024-01-01 LBC   10    10
    2024-01-02 LBC   2     12
    2024-01-02 LBC   4     16
    2024-01-01 SF    3     3
    2024-01-01 SF    1     4
    2024-01-02 SF    2     6

  Rather than doing a cumulative sum across the entire set of query results -- see #2862 and #42003 for more
  information."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
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
    (driver.u/supports? driver/*driver*
                        :window-functions/cumulative
                        (lib.metadata/database (qp.store/metadata-provider)))
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

(defn- partition-key
  "The values to partition the cumulative aggregation accumulation by (the equivalent of SQL `PARTITION BY` in a window
  function). We partition by all breakouts other than the first. See #2862, #42003, and the docstring
  for [[metabase.query-processor.middleware.cumulative-aggregations]] for more info."
  [num-breakouts row]
  ;; breakouts are always the first results returned. Return all breakouts except the first.
  (when (pos? num-breakouts)
    (subvec (vec row) 1 num-breakouts)))

(defn- add-values-from-last-partition-fn
  "Create a stateful function that can add values from the previous row for each partition for a set of specified
  indexes.

   (let [f (add-values-from-last-partition-fn 0 #{1})]
     (f [100 200]) ; => [100 200]
     (f [50 60]))  ; => [50  260]

  We need to reset the totals every time breakouts other than the last change values --
  see [[metabase.query-processor.middleware.cumulative-aggregations]] docstring for more info."
  [num-breakouts indexes-to-sum]
  (let [partition->last-row (volatile! nil)]
    (fn [row]
      (let [k        (partition-key num-breakouts row)
            last-row (get @partition->last-row k)
            row'     (if last-row
                       (reduce (fn [row index]
                                 (update row index (partial (fnil + 0 0) (nth last-row index))))
                               (vec row)
                               indexes-to-sum)
                       row)]
        ;; save the updated row for this partition key.
        (vswap! partition->last-row assoc k row')
        ;; now return the updated new row.
        row'))))

(defn- cumulative-ags-xform [num-breakouts replaced-indexes rf]
  {:pre [(fn? rf)]}
  (let [add-values-from-last-partition (add-values-from-last-partition-fn num-breakouts replaced-indexes)]
    (fn
      ([] (rf))

      ([result] (rf result))

      ([result row]
       (let [row' (add-values-from-last-partition row)]
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
