(ns metabase.lib.schema.aggregation
  (:require
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.util.malli.registry :as mr]))

;; count has an optional expression arg
(mbql-clause/define-catn-mbql-clause :count
  [:expression [:? [:ref ::expression/number]]])

(defmethod expression/type-of* :count
  [[_tag _opts expr]]
  (if-not expr
    :type/Integer
    (expression/type-of expr)))

(mbql-clause/define-tuple-mbql-clause :sum
  [:ref ::expression/number])

(defmethod expression/type-of* :sum
  [[_tag _opts expr]]
  (expression/type-of expr))

(mbql-clause/define-tuple-mbql-clause :avg :- :type/Float
  [:ref ::expression/number])

(mr/def ::aggregation
  ;; placeholder!
  [:or
   :mbql.clause/sum
   any?])

(mr/def ::aggregations
  [:sequential {:min 1} [:ref ::aggregation]])
