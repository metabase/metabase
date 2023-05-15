(ns metabase.lib.schema.aggregation
  (:require
   [metabase.lib.hierarchy :as lib.hierarchy]
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

(lib.hierarchy/derive :max :lib.type-of/type-is-type-of-first-arg)

(mbql-clause/define-tuple-mbql-clause :median
  [:schema [:ref ::expression/number]])

(lib.hierarchy/derive :median :lib.type-of/type-is-type-of-first-arg)

(mbql-clause/define-tuple-mbql-clause :min
  [:schema [:ref ::expression/number]])

(lib.hierarchy/derive :min :lib.type-of/type-is-type-of-first-arg)

(mr/def ::percentile.percentile
  [:and
   {:error/message "valid percentile"}
   [:ref ::expression/number]
   [:fn
    {:error/message "percentile must be between zero and one"}
    #(<= 0 % 1)]])

(mbql-clause/define-tuple-mbql-clause :percentile
  #_expr       [:ref ::expression/number]
  #_percentile [:ref ::percentile.percentile])

(lib.hierarchy/derive :percentile :lib.type-of/type-is-type-of-first-arg)

(mbql-clause/define-tuple-mbql-clause :share :- :type/Float
  [:schema [:ref ::expression/boolean]])

(mbql-clause/define-tuple-mbql-clause :stddev :- :type/Float
  [:schema [:ref ::expression/number]])

(mbql-clause/define-tuple-mbql-clause :sum
  [:schema [:ref ::expression/number]])

(lib.hierarchy/derive :sum :lib.type-of/type-is-type-of-first-arg)

(mbql-clause/define-tuple-mbql-clause :sum-where
  [:schema [:ref ::expression/number]]
  [:schema [:ref ::expression/boolean]])

(lib.hierarchy/derive :sum-where :lib.type-of/type-is-type-of-first-arg)

(mbql-clause/define-tuple-mbql-clause :var :- :type/Float
  #_expr [:schema [:ref ::expression/number]])

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
   :mbql.clause/var
   any?])

(mr/def ::aggregations
  [:sequential {:min 1} [:ref ::aggregation]])
