(ns metabase.query-processor.middleware.cumulative-aggregations
  "Middlware for handling cumulative count and cumulative sum aggregations."
  (:require [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [schema.core :as s]))

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

(defn- add-rows
  "Update values in `row` by adding values from `last-row` for a set of specified indexes.

    (add-rows #{0} [100 200] [50 60]) ; -> [150 60]"
  [[index & more] last-row row]
  (if-not index
    row
    (recur more last-row (update (vec row) index (partial + (nth last-row index))))))

(defn- sum-rows
  "Sum the values in `rows` at `indexes-to-sum`.

    (sum-rows #{0} [[1] [2] [3]]) ; -> [[1] [3] [6]]"
  [indexes-to-sum rows]
  (reductions (partial add-rows indexes-to-sum) rows))

(defn handle-cumulative-aggregations
  "Middleware that implements `cum-count` and `cum-sum` aggregations. These clauses are replaced with `count` and `sum`
  clauses respectively and summation is performed on results in Clojure-land."
  [qp]
  (fn [{{aggregations :aggregation, breakouts :breakout} :query, :as query}]
    (if (mbql.u/match aggregations #{:cum-count :cum-sum})
      (let [new-query        (replace-cumulative-ags query)
            ;; figure out which indexes are being changed in the results. Since breakouts always get included in
            ;; results first we need to offset the indexes to change by the number of breakouts
            replaced-indexes (set (for [i (diff-indecies (->     query :query :aggregation)
                                                         (-> new-query :query :aggregation))]
                                    (+ (count breakouts) i)))
            results          (qp new-query)]
        (update results :rows (partial sum-rows replaced-indexes)))
      (qp query))))
