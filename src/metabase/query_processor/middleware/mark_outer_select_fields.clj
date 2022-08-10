(ns metabase.query-processor.middleware.mark-outer-select-fields
  (:require [clojure.walk :as walk]))

(defn- matching-fields?
  [field source-field]
  (every? #(= (field %) (source-field %)) [0 1]))

(defn- mark-mbql-outer-select-fields
  [mbql-query]
  (walk/prewalk
   (fn [form]
     (let [fields        (:fields form)
           source-fields (get-in form [:source-query :fields])]
       (cond-> form
         (and (map? form)
              (seqable? fields)
              (seq fields)
              (seqable? source-fields)
              (seq source-fields))
         (assoc :fields
                (mapv (fn [field]
                        (cond-> field
                          (some #(matching-fields? field %) source-fields) (assoc-in [2 ::outer-select] true)))
                      fields)))))
   mbql-query))

(defn mark-outer-select-fields
  "Mark all Fields in the MBQL query `query` coming from a source-query as `::outer-select` so QP implementations know
  not to apply coercion or whatever to them a second time"
  [query]
  (cond-> query
    (not= (:type query) :native)
    (update :query mark-mbql-outer-select-fields)))
