(ns metabase.lib.schema.aggregation
  (:require
   [clojure.string :as str]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]))

;;; `:metric` refs are allowed as aggregations. The definition for `:metric` is in [[metabase.lib.schema.ref]].
(lib.hierarchy/derive :metric ::aggregation)

;;; Clauses like `:sum` are guaranteed to return a number, right? So rather than return `type.unknown` when their arg
;;; is something like a `:field` ref without type info, just fall back to `:type/Number`. If we have more specific
;;; info, we can return a more specific type.
(lib.hierarchy/derive ::type-is-type-of-first-arg-or-number :lib.type-of/type-is-type-of-first-arg)

(defmethod expression/type-of-method ::type-is-type-of-first-arg-or-number
  [clause]
  (let [calculated-type ((get-method expression/type-of-method :lib.type-of/type-is-type-of-first-arg) clause)]
    (if (= calculated-type ::expression/type.unknown)
      :type/Number
      calculated-type)))

;; count has an optional expression arg. This is the number of non-NULL values -- corresponds to count(<expr>) in SQL
(mbql-clause/define-catn-mbql-clause :count :- :type/Integer
  [:expression [:? [:schema [:ref ::expression/expression]]]])

(lib.hierarchy/derive :count ::aggregation)

;; cum-count has an optional expression arg
(mbql-clause/define-catn-mbql-clause :cum-count :- :type/Integer
  [:expression [:? [:schema [:ref ::expression/expression]]]])

(lib.hierarchy/derive :cum-count ::aggregation)

(mbql-clause/define-tuple-mbql-clause :avg :- :type/Float
  [:schema [:ref ::expression/number]])

(lib.hierarchy/derive :avg ::aggregation)

;;; number of distinct values of something.
(mbql-clause/define-tuple-mbql-clause :distinct :- :type/Integer
  [:schema [:ref ::expression/expression]])

(lib.hierarchy/derive :distinct ::aggregation)

(mbql-clause/define-tuple-mbql-clause :count-where :- :type/Integer
  [:schema [:ref ::expression/boolean]])

(lib.hierarchy/derive :count-where ::aggregation)

;;; min and max should work on anything orderable, including numbers, temporal values, and even text values.
(mbql-clause/define-tuple-mbql-clause :max
  [:schema [:ref ::expression/orderable]])

(lib.hierarchy/derive :max ::aggregation)
(lib.hierarchy/derive :max ::type-is-type-of-first-arg-or-number)

;;; apparently median and percentile only work for numeric args in Postgres, as opposed to anything orderable. Not
;;; sure this makes sense conceptually, but since there probably isn't as much of a use case we can keep that
;;; restriction in MBQL for now.
(mbql-clause/define-tuple-mbql-clause :median
  [:schema [:ref ::expression/number]])

(lib.hierarchy/derive :median ::aggregation)
(lib.hierarchy/derive :median ::type-is-type-of-first-arg-or-number)

(mbql-clause/define-tuple-mbql-clause :min
  [:schema [:ref ::expression/orderable]])

(lib.hierarchy/derive :min ::aggregation)
(lib.hierarchy/derive :min ::type-is-type-of-first-arg-or-number)

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

(lib.hierarchy/derive :percentile ::aggregation)
(lib.hierarchy/derive :percentile ::type-is-type-of-first-arg-or-number)

(mbql-clause/define-tuple-mbql-clause :share :- :type/Float
  [:schema [:ref ::expression/boolean]])

(lib.hierarchy/derive :share ::aggregation)

(mbql-clause/define-tuple-mbql-clause :stddev :- :type/Float
  [:schema [:ref ::expression/number]])

(lib.hierarchy/derive :stddev ::aggregation)

(mbql-clause/define-tuple-mbql-clause :sum
  [:schema [:ref ::expression/number]])

(lib.hierarchy/derive :sum ::aggregation)
(lib.hierarchy/derive :sum ::type-is-type-of-first-arg-or-number)

(mbql-clause/define-tuple-mbql-clause :cum-sum
  [:schema [:ref ::expression/number]])

(lib.hierarchy/derive :cum-sum ::aggregation)
(lib.hierarchy/derive :cum-sum ::type-is-type-of-first-arg-or-number)

(mbql-clause/define-tuple-mbql-clause :sum-where
  [:schema [:ref ::expression/number]]
  [:schema [:ref ::expression/boolean]])

(lib.hierarchy/derive :sum-where ::aggregation)
(lib.hierarchy/derive :sum-where ::type-is-type-of-first-arg-or-number)

(mbql-clause/define-tuple-mbql-clause :var :- :type/Float
  #_expr [:schema [:ref ::expression/number]])

(lib.hierarchy/derive :var ::aggregation)

(mr/def ::aggregation
  [:and
   ::mbql-clause/clause
   [:or
    ::expression/number
    [:fn
     {:error/fn (fn [_ _]
                  (str "Valid aggregation, must be one of these clauses: "
                       (str/join ", " (sort (descendants @lib.hierarchy/hierarchy ::aggregation)))))}
     (fn [[tag :as _clause]]
       (lib.hierarchy/isa? tag ::aggregation))]]])

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
