(ns metabase.lib.schema.aggregation
  (:require
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]))

;; count has an optional expression arg
(mbql-clause/define-catn-mbql-clause :count :- :type/Integer
  [:expression [:? [:schema [:ref ::expression/number]]]])

;; cum-count has an optional expression arg
(mbql-clause/define-catn-mbql-clause :cum-count :- :type/Integer
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

(mbql-clause/define-tuple-mbql-clause :cum-sum
  [:schema [:ref ::expression/number]])

(lib.hierarchy/derive :sum :lib.type-of/type-is-type-of-first-arg)

(lib.hierarchy/derive :cum-sum :lib.type-of/type-is-type-of-first-arg)

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
   :mbql.clause/cum-count
   :mbql.clause/count-where
   :mbql.clause/distinct
   :mbql.clause/max
   :mbql.clause/median
   :mbql.clause/min
   :mbql.clause/percentile
   :mbql.clause/share
   :mbql.clause/stddev
   :mbql.clause/sum
   :mbql.clause/cum-sum
   :mbql.clause/sum-where
   :mbql.clause/var
   any?])

(mr/def ::aggregations
  [:sequential {:min 1} [:ref ::aggregation]])

(def aggregation-operators
  "The list of available aggregation operator.
  The order of operators is relevant for the front end."
  [{:short            :count
    :requires-column? false
    :driver-feature   :basic-aggregations
    :display-info     (fn []
                        {:display-name (i18n/tru "Count of rows")
                         :column-name  (i18n/tru "Count")
                         :description  (i18n/tru "Total number of rows in the answer.")})}
   {:short            :sum
    :supported-field  :metabase.lib.types.constants/summable
    :requires-column? true
    :driver-feature   :basic-aggregations
    :display-info     (fn []
                        {:display-name (i18n/tru "Sum of ...")
                         :column-name  (i18n/tru "Sum")
                         :description  (i18n/tru "Sum of all the values of a column.")})}
   {:short            :avg
    :supported-field  :metabase.lib.types.constants/summable
    :requires-column? true
    :driver-feature   :basic-aggregations
    :display-info     (fn []
                        {:display-name (i18n/tru "Average of ...")
                         :column-name  (i18n/tru "Average")
                         :description  (i18n/tru "Average of all the values of a column")})}
   {:short            :median
    :supported-field  :metabase.lib.types.constants/summable
    :requires-column? true
    :driver-feature   :percentile-aggregations
    :display-info     (fn []
                        {:display-name (i18n/tru "Median of ...")
                         :column-name  (i18n/tru "Median")
                         :description  (i18n/tru "Median of all the values of a column")})}
   {:short            :distinct
    :supported-field  :any
    :requires-column? true
    :driver-feature   :basic-aggregations
    :display-info     (fn []
                        {:display-name (i18n/tru "Number of distinct values of ...")
                         :column-name  (i18n/tru "Distinct values")
                         :description  (i18n/tru "Number of unique values of a column among all the rows in the answer.")})}
   {:short            :cum-sum
    :supported-field  :metabase.lib.types.constants/summable
    :requires-column? true
    :driver-feature   :basic-aggregations
    :display-info     (fn []
                        {:display-name (i18n/tru "Cumulative sum of ...")
                         :column-name  (i18n/tru "Sum")
                         :description  (i18n/tru "Additive sum of all the values of a column.\ne.x. total revenue over time.")})}
   {:short            :cum-count
    :requires-column? false
    :driver-feature   :basic-aggregations
    :display-info     (fn []
                        {:display-name (i18n/tru "Cumulative count of rows")
                         :column-name  (i18n/tru "Count")
                         :description  (i18n/tru "Additive count of the number of rows.\ne.x. total number of sales over time.")})}
   {:short            :stddev
    :supported-field  :metabase.lib.types.constants/summable
    :requires-column? true
    :driver-feature   :standard-deviation-aggregations
    :display-info     (fn []
                        {:display-name (i18n/tru "Standard deviation of ...")
                         :column-name  (i18n/tru "SD")
                         :description  (i18n/tru "Number which expresses how much the values of a column vary among all rows in the answer.")})}
   {:short            :min
    :supported-field  :metabase.lib.types.constants/scope
    :requires-column? true
    :driver-feature   :basic-aggregations
    :display-info     (fn []
                        {:display-name (i18n/tru "Minimum of ...")
                         :column-name  (i18n/tru "Min")
                         :description  (i18n/tru "Minimum value of a column")})}
   {:short            :max
    :supported-field  :metabase.lib.types.constants/scope
    :requires-column? true
    :driver-feature   :basic-aggregations
    :display-info     (fn []
                        {:display-name (i18n/tru "Maximum of ...")
                         :column-name  (i18n/tru "Max")
                         :description  (i18n/tru "Maximum value of a column")})}])

(mr/def ::operator
  [:map
   [:lib/type [:= :mbql.aggregation/operator]]
   [:short (into [:enum] (map :short) aggregation-operators)]
   [:supported-field {:optional true} [:maybe :keyword]] ; TODO more precise type?
   [:requires-column? :boolean]
   [:driver-feature :keyword]           ; TODO more precise type?
   [:display-info fn?]])
