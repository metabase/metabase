(ns metabase.query-processor.middleware.cumulative-aggregations
  "Middlware for handling `cumulative-count` and `cumulative-sum` aggregations."
  (:require [metabase.query-processor.util :as qputil]
            [metabase.util :as u]))

(defn- cumulative-aggregation-clause
  "Does QUERY have any aggregations of AGGREGATION-TYPE?"
  [aggregation-type {{aggregations :aggregation} :query, :as query}]
  (when (qputil/mbql-query? query)
    (some (fn [{ag-type :aggregation-type, :as ag}]
            (when (= ag-type aggregation-type)
              ag))
          aggregations)))

(defn- pre-cumulative-aggregation
  "Rewrite queries containing a cumulative aggregation (e.g. `:cumulative-count`) as a different 'basic' aggregation
  (e.g. `:count`). This lets various drivers handle the aggregation normallly; we implement actual behavior here in
  post-processing."
  [cumlative-ag-type basic-ag-type ag-field {{aggregations :aggregation, breakout-fields :breakout} :query, :as query}]
  (update-in query [:query :aggregation] (fn [aggregations]
                                           (for [{ag-type :aggregation-type, :as ag} aggregations]
                                             (if-not (= ag-type cumlative-ag-type)
                                               ag
                                               {:aggregation-type basic-ag-type, :field ag-field})))))

(defn- first-index-satisfying
  "Return the index of the first item in COLL where `(pred item)` is logically `true`.

     (first-index-satisfying keyword? ['a 'b :c 3 \"e\"]) -> 2"
  {:style/indent 1}
  [pred coll]
  (loop [i 0, [item & more] coll]
    (cond
      (pred item) i
      (seq more)  (recur (inc i) more))))

(defn- post-cumulative-aggregation [basic-ag-type {rows :rows, cols :cols, :as results}]
  (let [ ;; Determine the index of the field we need to cumulative sum
        field-index (u/prog1 (first-index-satisfying (comp (partial = (name basic-ag-type)) :name)
                               cols)
                      (assert (integer? <>)))
        ;; Now make a sequence of cumulative sum values for each row
        values      (reductions + (for [row rows]
                                    (nth row field-index)))
        ;; Update the values in each row
        rows        (map (fn [row value]
                           (assoc (vec row) field-index value))
                         rows values)]
    (assoc results :rows rows)))

(defn- cumulative-aggregation [cumulative-ag-type basic-ag-type qp]
  (let [cumulative-ag-clause (partial cumulative-aggregation-clause cumulative-ag-type)
        pre-cumulative-ag    (partial pre-cumulative-aggregation cumulative-ag-type basic-ag-type)
        post-cumulative-ag   (partial post-cumulative-aggregation basic-ag-type)]
    (fn [query]
      (if-let [{ag-field :field} (cumulative-ag-clause query)]
        (post-cumulative-ag (qp (pre-cumulative-ag ag-field query)))
        (qp query)))))


(def ^:private ^{:arglists '([qp])} cumulative-sum
  "Handle `cumulative-sum` aggregations, which is done by rewriting the aggregation as a `:sum` in pre-processing and
  acculumlating the results in post-processing."
  (partial cumulative-aggregation :cumulative-sum :sum))

(def ^:private ^{:arglists '([qp])} cumulative-count
  "Handle `cumulative-count` aggregations, which is done by rewriting the aggregation as a `:count` in pre-processing
  and acculumlating the results in post-processing."
  (partial cumulative-aggregation :cumulative-count :count))

(def ^{:arglists '([qp])} handle-cumulative-aggregations
  "Handle `cumulative-sum` and `cumulative-count` aggregations by rewriting the aggregations appropriately in
  pre-processing and accumulating the results in post-processing."
  (comp cumulative-sum cumulative-count))
