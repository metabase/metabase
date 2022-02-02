(ns metabase.query-processor.middleware.cumulative-aggregations
  "Middlware for handling cumulative count and cumulative sum aggregations."
  (:require [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [schema.core :as s]))

;;;; Pre-processing

(defn- diff-indecies
  "Given two sequential collections, return indecies that are different between the two."
  [coll-1 coll-2]
  (->> (map not= coll-1 coll-2)
       (map-indexed (fn [i transformed?]
                      (when transformed?
                        i)))
       (filter identity)
       set))

(s/defn ^:private replace-cumulative-ags :- mbql.s/Query
  "Replace `cum-count` and `cum-sum` aggregations in `query` with `count` and `sum` aggregations, respectively."
  [query]
  (mbql.u/replace-in query [:query :aggregation]
    ;; cumulative count doesn't neccesarily have a field-id arg
    [:cum-count]       [:count]
    [:cum-count field] [:count field]
    [:cum-sum field]   [:sum field]))

(defn rewrite-cumulative-aggregations
  "Pre-processing middleware. Rewrite `:cum-count` and `:cum-sum` aggregations as `:count` and `:sum` respectively. Add
  information about the indecies of the replaced aggregations under the `::replaced-indecies` key."
  [{{breakouts :breakout, aggregations :aggregation} :query, :as query}]
  (if-not (mbql.u/match aggregations #{:cum-count :cum-sum})
    query
    (let [query'            (replace-cumulative-ags query)
          ;; figure out which indexes are being changed in the results. Since breakouts always get included in
          ;; results first we need to offset the indexes to change by the number of breakouts
          replaced-indecies (set (for [i (diff-indecies (-> query  :query :aggregation)
                                                        (-> query' :query :aggregation))]
                                   (+ (count breakouts) i)))]
      (cond-> query'
        (seq replaced-indecies) (assoc ::replaced-indecies replaced-indecies)))))


;;;; Post-processing

(defn- add-values-from-last-row
  "Update values in `row` by adding values from `last-row` for a set of specified indexes.

    (add-values-from-last-row #{0} [100 200] [50 60]) ; -> [150 60]"
  [[index & more] last-row row]
  (cond
   (not index)
   row

   (not last-row)
   row

   :else
   (recur more last-row (update (vec row) index (partial (fnil + 0 0) (nth last-row index))))))

(defn- cumulative-ags-xform [replaced-indecies rf]
  {:pre [(fn? rf)]}
  (let [last-row (volatile! nil)]
    (fn
      ([] (rf))

      ([result] (rf result))

      ([result row]
       (let [row' (add-values-from-last-row replaced-indecies @last-row row)]
         (vreset! last-row row')
         (rf result row'))))))

(defn sum-cumulative-aggregation-columns
  "Post-processing middleware. Sum the cumulative count aggregations that were rewritten
  by [[rewrite-cumulative-aggregations]] in Clojure-land."
  [{::keys [replaced-indecies]} rff]
  (if (seq replaced-indecies)
    (fn sum-cumulative-aggregation-columns-rff* [metadata]
      (cumulative-ags-xform replaced-indecies (rff metadata)))
    rff))
