(ns metabase.lib.schema.aggregation
  (:require
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.util.malli.registry :as mr]))

;; count has an optional expression arg
(mbql-clause/define-catn-mbql-clause :count :- :type/Integer
  [:expression [:? [:schema [:ref ::expression/number]]]])

(mbql-clause/define-tuple-mbql-clause :avg :- :type/Float
  [:schema [:ref ::expression/number]])

(mbql-clause/define-tuple-mbql-clause :distinct :- :type/Integer
  [:schema [:ref ::expression/expression]])

(mbql-clause/define-tuple-mbql-clause :count-where :- :type/Integer
  [:schema [:ref ::expression/boolean]])

(mbql-clause/define-tuple-mbql-clause :max
  [:schema [:ref ::expression/number]])

(expression/register-type-of-first-arg :max)

(mbql-clause/define-tuple-mbql-clause :median
  [:schema [:ref ::expression/number]])

(expression/register-type-of-first-arg :median)

(mbql-clause/define-tuple-mbql-clause :min
  [:schema [:ref ::expression/number]])

(expression/register-type-of-first-arg :min)

(mbql-clause/define-tuple-mbql-clause :percentile
  #_expr [:schema [:ref ::expression/number]]
  #_percentile [:schema [:ref ::expression/non-integer-real]])

(expression/register-type-of-first-arg :percentile)

(mbql-clause/define-tuple-mbql-clause :share :- :type/Float
  [:schema [:ref ::expression/boolean]])

(mbql-clause/define-tuple-mbql-clause :stddev :- :type/Float
  [:schema [:ref ::expression/number]])

(mbql-clause/define-tuple-mbql-clause :sum
  [:schema [:ref ::expression/number]])

(expression/register-type-of-first-arg :sum)

(mbql-clause/define-tuple-mbql-clause :sum-where
  [:schema [:ref ::expression/number]]
  [:schema [:ref ::expression/boolean]])

(expression/register-type-of-first-arg :sum-where)

(mr/def ::aggregation
  ;; placeholder!
  [:or
   :mbql.clause/avg
   :mbql.clause/count
   :mbql.clause/count-where
   :mbql.clause/distinct
   :mbql.clause/max
   :mbql.clause/median
   :mbql.clause/min
   :mbql.clause/percentile
   :mbql.clause/share
   :mbql.clause/stddev
   :mbql.clause/sum
   :mbql.clause/sum-where
   any?])

(mr/def ::aggregations
  [:sequential {:min 1} [:ref ::aggregation]])
