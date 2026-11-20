(ns metabase.query-processor.middleware.cumulative-aggregations
  "Middleware for handling cumulative aggregations (`:cumulative`, `:cum-count` and `:cum-sum`) in Clojure-land. In
  0.50.0+, this middleware is only used for drivers that do not have native implementations of
  `:window-functions/cumulative`; see the driver changelog for 0.50.0 for more information.

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
  (:refer-clojure :exclude [mapv])
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.match :as match]
   [metabase.util.performance :refer [mapv]]))

;;;; Pre-processing

(mr/def ::roll-up
  "How to combine the values of a column to get its running value. See [[lib/cumulative-roll-up]]."
  [:enum :sum :min :max])

(defn- update-clause [clause]
  (match/match-one clause
    ;; cumulative count doesn't necessarily have a field-id arg
    [:cum-count opts]       [:count opts]
    [:cum-count opts field] [:count opts field]
    [:cum-sum   opts field] [:sum   opts field]
    _                       nil))

(mu/defn- unwrap-cumulative :- ::lib.schema.aggregation/aggregation
  "Replace `[:cumulative opts <aggregation>]` with `<aggregation>`. The result keeps the options of the `:cumulative`
  clause, so things that refer to it by UUID or by name still find it."
  [[_cumulative opts aggregation] :- :mbql.clause/cumulative]
  (lib/update-options aggregation merge opts))

(mu/defn- rewrite-aggregation :- [:tuple ::lib.schema.aggregation/aggregation [:maybe ::roll-up]]
  "Rewrite a cumulative `aggregation` as the plain aggregation the database should compute for each row. Returns that
  aggregation and how [[sum-cumulative-aggregation-columns]] should combine its values into running ones, or `nil`
  for the latter if `aggregation` is not cumulative."
  [aggregation      :- ::lib.schema.aggregation/aggregation
   accumulate-rows? :- :boolean]
  (cond
    (lib/clause-of-type? aggregation :cumulative)
    (let [[_cumulative _opts wrapped-aggregation] aggregation]
      ;; we can only accumulate the rows the query returns, i.e. those of its last stage. Unwrapping a `:cumulative`
      ;; anywhere else would quietly turn it into a plain aggregation.
      (when-not accumulate-rows?
        (throw (ex-info (tru "This database only supports cumulative aggregations in the last stage of a query.")
                        {:type qp.error-type/unsupported-feature, :aggregation aggregation})))
      ;; a cumulative average or share is a ratio of two running values (see [[lib/cumulative-ratio]]), and all we can
      ;; do here is accumulate a single column.
      (when (lib/cumulative-ratio aggregation)
        (throw (ex-info (tru "This database does not support cumulative averages or shares.")
                        {:type qp.error-type/unsupported-feature, :aggregation aggregation})))
      [(unwrap-cumulative aggregation) (lib/cumulative-roll-up wrapped-aggregation)])

    ;; A `:cumulative` inside an expression: we would be accumulating the value of the entire expression, which is
    ;; not the same thing, e.g. a running sum of ratios instead of a ratio of running sums.
    (match/match-one aggregation [:cumulative & _] true)
    (throw (ex-info (tru "This database does not support cumulative aggregations inside an expression.")
                    {:type qp.error-type/unsupported-feature, :aggregation aggregation}))

    :else
    (let [aggregation' (lib.walk/walk-clause aggregation update-clause)]
      [aggregation' (when-not (= aggregation aggregation')
                      :sum)])))

(defn- update-stage [{breakouts :breakout, aggregations :aggregation, :as stage} accumulate-rows?]
  (let [rewritten      (mapv #(rewrite-aggregation % accumulate-rows?) aggregations)
        ;; figure out which indexes are being changed in the results. Since breakouts always get included in
        ;; results first we need to offset the indexes to change by the number of breakouts
        index->roll-up (into {}
                             (keep-indexed (fn [i [_aggregation roll-up]]
                                             (when roll-up
                                               [(+ (count breakouts) i) roll-up])))
                             rewritten)
        ;; `::replaced-indexes` are summed unless `::roll-ups` says otherwise.
        roll-ups       (into {} (remove (fn [[_index roll-up]] (= roll-up :sum))) index->roll-up)]
    (cond-> (assoc stage ::replaced-indexes (set (keys index->roll-up)))
      (seq aggregations) (assoc :aggregation (mapv first rewritten))
      (seq roll-ups)     (assoc ::roll-ups roll-ups))))

(mu/defn rewrite-cumulative-aggregations :- ::lib.schema/query
  "Pre-processing middleware. Rewrite `:cum-count` and `:cum-sum` aggregations as `:count` and `:sum` respectively, and
  `[:cumulative opts <aggregation>]` as `<aggregation>`. Add information about the indices of the replaced
  aggregations under the `::replaced-indexes` key, and about how to accumulate the ones that are not sums under
  `::roll-ups`."
  [query :- ::lib.schema/query]
  (if (driver.u/supports? driver/*driver*
                          :window-functions/cumulative
                          (lib.metadata/database query))
    ;; no need to rewrite cumulative aggregations, this driver supports native window function versions
    query
    (let [last-stage-path [:stages (dec (count (:stages query)))]]
      (lib.walk/walk-stages query (fn [_query path stage]
                                    (update-stage stage (= path last-stage-path)))))))

;;;; Post-processing

(defn- partition-key
  "The values to partition the cumulative aggregation accumulation by (the equivalent of SQL `PARTITION BY` in a window
  function). We partition by all breakouts other than the first. See #2862, #42003, and the docstring
  for [[metabase.query-processor.middleware.cumulative-aggregations]] for more info."
  [num-breakouts row]
  ;; breakouts are always the first results returned. Return all breakouts except the first.
  (when (pos? num-breakouts)
    (subvec (vec row) 1 num-breakouts)))

(mu/defn- accumulator :- fn?
  "A function that combines the running value of a column up to the previous row of a partition with the value in
  the current row."
  [roll-up :- ::roll-up]
  (letfn [(pick [keep-first?]
            ;; a missing value never replaces a real one, as with `MIN` and `MAX` in SQL.
            (fn [x y]
              (cond
                (nil? x)                    y
                (nil? y)                    x
                (keep-first? (compare x y)) x
                :else                       y)))]
    (case roll-up
      :sum (fnil + 0 0)
      :min (pick neg?)
      :max (pick pos?))))

(defn- add-values-from-last-partition-fn
  "Create a stateful function that can combine the values of a row with the values from the previous row for each
  partition, for a set of specified indexes. `index->roll-up` says how to combine the values at an index; indexes
  that are not in it are added together.

   (let [f (add-values-from-last-partition-fn 0 #{1} nil)]
     (f [100 200]) ; => [100 200]
     (f [50 60]))  ; => [50  260]

  We need to reset the totals every time breakouts other than the last change values --
  see [[metabase.query-processor.middleware.cumulative-aggregations]] docstring for more info."
  [num-breakouts indexes-to-accumulate index->roll-up]
  (let [partition->last-row (volatile! nil)
        index->accumulator  (into {}
                                  (map (fn [index]
                                         [index (accumulator (get index->roll-up index :sum))]))
                                  indexes-to-accumulate)]
    (fn [row]
      (let [k        (partition-key num-breakouts row)
            last-row (get @partition->last-row k)
            row'     (if last-row
                       (reduce-kv (fn [row index accumulate]
                                    (update row index (partial accumulate (nth last-row index))))
                                  (vec row)
                                  index->accumulator)
                       row)]
        ;; save the updated row for this partition key.
        (vswap! partition->last-row assoc k row')
        ;; now return the updated new row.
        row'))))

(defn- cumulative-ags-xform [num-breakouts replaced-indexes index->roll-up rf]
  {:pre [(fn? rf)]}
  (let [add-values-from-last-partition (add-values-from-last-partition-fn num-breakouts replaced-indexes index->roll-up)]
    (fn
      ([] (rf))

      ([result] (rf result))

      ([result row]
       (let [row' (add-values-from-last-partition row)]
         (rf result row'))))))

(mu/defn sum-cumulative-aggregation-columns :- ::qp.schema/rff
  "Post-processing middleware. Accumulate the values of the cumulative aggregations that were rewritten
  by [[rewrite-cumulative-aggregations]] in Clojure-land: add them up, or take their running min or max."
  [query :- ::lib.schema/query
   rff   :- ::qp.schema/rff]
  (let [{replaced-indexes ::replaced-indexes, index->roll-up ::roll-ups} (lib/query-stage query -1)]
    (if (seq replaced-indexes)
      (fn sum-cumulative-aggregation-columns-rff* [metadata]
        (let [num-breakouts (count (lib/breakouts query))]
          (cumulative-ags-xform num-breakouts replaced-indexes index->roll-up (rff metadata))))
      rff)))
