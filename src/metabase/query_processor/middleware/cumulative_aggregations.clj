(ns metabase.query-processor.middleware.cumulative-aggregations
  "Middleware for handling cumulative count and cumulative sum aggregations in Clojure-land. In 0.50.0+, this middleware
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
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util.malli :as mu]))

;;;; Pre-processing

(defn- diff-indexes
  "Given two sequential collections, return indices that are different between the two."
  [coll-1 coll-2]
  (into #{}
        (keep-indexed (fn [i transformed?]
                        (when transformed?
                          i)))
        (map not= coll-1 coll-2)))

(defn- update-clause [clause]
  (lib.util.match/match-lite clause
    ;; cumulative count doesn't necessarily have a field-id arg
    [:cum-count opts]       [:count opts]
    [:cum-count opts field] [:count opts field]
    [:cum-sum   opts field] [:sum   opts field]
    _                       nil))

(defn- update-aggregations [aggregations]
  (lib.walk/walk-clauses* aggregations update-clause))

(defn- update-stage [{breakouts :breakout, :as stage}]
  (when-let [updated-stage (m/update-existing stage :aggregation update-aggregations)]
    ;; figure out which indexes are being changed in the results. Since breakouts always get included in
    ;; results first we need to offset the indexes to change by the number of breakouts
    (let [replaced-indexes (set (for [i (diff-indexes (:aggregation stage)
                                                      (:aggregation updated-stage))]
                                  (+ (count breakouts) i)))]
      (assoc updated-stage ::replaced-indexes replaced-indexes))))

(mu/defn rewrite-cumulative-aggregations :- ::lib.schema/query
  "Pre-processing middleware. Rewrite `:cum-count` and `:cum-sum` aggregations as `:count` and `:sum` respectively. Add
  information about the indices of the replaced aggregations under the `::replaced-indexes` key."
  [query :- ::lib.schema/query]
  (if (driver.u/supports? driver/*driver*
                          :window-functions/cumulative
                          (lib.metadata/database query))
    ;; no need to rewrite `:cum-sum` and `:cum-count` functions, this driver supports native window function versions
    query
    (lib.walk/walk-stages query (fn [_query _path stage]
                                  (update-stage stage)))))

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

(mu/defn sum-cumulative-aggregation-columns :- ::qp.schema/rff
  "Post-processing middleware. Sum the cumulative count aggregations that were rewritten
  by [[rewrite-cumulative-aggregations]] in Clojure-land."
  [query :- ::lib.schema/query
   rff   :- ::qp.schema/rff]
  (let [replaced-indexes (::replaced-indexes (lib/query-stage query -1))]
    (if (seq replaced-indexes)
      (fn sum-cumulative-aggregation-columns-rff* [metadata]
        (let [num-breakouts (count (lib/breakouts query))]
          (cumulative-ags-xform num-breakouts replaced-indexes (rff metadata))))
      rff)))
