(ns metabase.lib.schema.order-by
  "Schemas for order-by clauses."
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.util.malli.registry :as mr]))

(mr/def ::direction
  [:enum {:decode/normalize common/normalize-keyword} :asc :desc])

(mbql-clause/define-tuple-mbql-clause :asc
  [:ref ::expression/orderable])

(mbql-clause/define-tuple-mbql-clause :desc
  [:ref ::expression/orderable])

(mr/def ::order-by
  [:multi
   {:dispatch common/mbql-clause-tag}
   [:asc  :mbql.clause/asc]
   [:desc :mbql.clause/desc]])

(declare no-duplicate)

(defn remove-uuids
  "Takes an array of clauses and removes the uuids."
  [data]
  (map (fn [nested-vector]
         (map (fn [inner-vector]
                (if (= :uuid (first inner-vector))
                  nil
                  inner-vector))
              nested-vector))
       data))

(defn no-duplicate-without-uuids
  "Checks if the entries are distinct ignoring uuids."
  [data]
  (no-duplicate (remove-uuids data)))

(defn empty-or-no-duplicate?
  "True if `coll` is either empty or distinct."
  [coll]
  (if (seq coll)
    (apply no-duplicate-without-uuids coll)
    true))

(mr/def ::no-duplicate
  [:fn
   {:doc/message   "values must be distinct"
    :error/message "distinct"}
   empty-or-no-duplicate?])

(defn no-duplicate
  "Add an additional constraint to `schema` (presumably an array) that requires all elements to be distinct."
  [schema]
  [:and
   schema
   [:ref ::no-duplicate]])

(mr/def ::order-bys
  (no-duplicate [:sequential {:min 1} [:ref ::order-by]]))
