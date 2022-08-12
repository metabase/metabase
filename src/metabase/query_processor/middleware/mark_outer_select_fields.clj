(ns metabase.query-processor.middleware.mark-outer-select-fields
  (:require [clojure.walk :as walk]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.util :as qp.util]))

(defn- matching-fields?
  [field source-field]
  (= (qp.util/field-ref->key field) (qp.util/field-ref->key source-field)))

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
                          (some #(matching-fields? field %) source-fields)
                          (mbql.u/assoc-field-options :nested/outer true)))
                      fields)))))
   mbql-query))

(defn mark-outer-select-fields
  "Mark all Fields in the MBQL query `query` coming from a source-query as `:nested/outer` so QP implementations know
  not to apply coercion or whatever to them a second time"
  [query]
  (cond-> query
    (not= (:type query) :native)
    (update :query mark-mbql-outer-select-fields)))
