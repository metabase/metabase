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

(s/defn rewrite-cumulative-aggregations :- mbql.s/Query
  "Pre-processing middleware. Replace `cum-count` and `cum-sum` aggregations in `query` with `count` and `sum`
  aggregations, respectively. These are summed in post-processing by `post-process-cumulative-aggregations`."
  [{{breakouts :breakout, aggregations :aggregation} :query, :as query}]
  (if-not (mbql.u/match aggregations #{:cum-count :cum-sum})
    query
    (let [query' (mbql.u/replace-in query [:query :aggregation]
                   ;; cumulative count doesn't neccesarily have a field-id arg
                   [:cum-count]       [:count]
                   [:cum-count field] [:count field]
                   [:cum-sum field]   [:sum field])]
      (assoc query' ::replaced-indecies (set (for [i (diff-indecies (-> query  :query :aggregation)
                                                                    (-> query' :query :aggregation))]
                                               (+ (count breakouts) i)))))))

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

(defn post-process-cumulative-aggregations
  "Post-processing middleware that sums the `cum-count` and `cum-sum` aggregations
  from [[rewrite-cumulative-aggregations]]."
  [qp]
  (fn [{::keys [replaced-indecies], :as query} rff context]
    (if-not replaced-indecies
      (qp query rff context)
      (let [rff' (fn [metadata]
                   (cumulative-ags-xform replaced-indecies (rff metadata)))]
        (qp query rff' context)))))
