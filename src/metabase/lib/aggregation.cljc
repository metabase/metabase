(ns metabase.lib.aggregation
  (:refer-clojure :exclude [count distinct max min])
  (:require
   [metabase.lib.common :as lib.common]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(mu/defn resolve-aggregation :- ::lib.schema.aggregation/aggregation
  "Resolve an aggregation with a specific `index`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   index        :- ::lib.schema.common/int-greater-than-or-equal-to-zero]
  (let [{aggregations :aggregation} (lib.util/query-stage query stage-number)]
    (when (<= (clojure.core/count aggregations) index)
      (throw (ex-info (i18n/tru "No aggregation at index {0}" index)
                      {:index        index
                       :query        query
                       :stage-number stage-number})))
    (nth aggregations index)))

(defmethod lib.metadata.calculation/describe-top-level-key-method :aggregation
  [query stage-number _k]
  (when-let [aggregations (not-empty (:aggregation (lib.util/query-stage query stage-number)))]
    (lib.util/join-strings-with-conjunction
     (i18n/tru "and")
     (for [aggregation aggregations]
       (lib.metadata.calculation/display-name query stage-number aggregation)))))

(defmethod lib.metadata.calculation/metadata :aggregation
  [query stage-number [_ag opts index, :as aggregation-ref]]
  (let [aggregation (resolve-aggregation query stage-number index)]
    (merge
     (lib.metadata.calculation/metadata query stage-number aggregation)
     {:field_ref aggregation-ref}
     (when (:base-type opts)
       {:base_type (:base-type opts)}))))

;;; TODO -- merge this stuff into `defop` somehow.

(defmethod lib.metadata.calculation/display-name-method :aggregation
  [query stage-number [_tag _opts index]]
  (lib.metadata.calculation/display-name query stage-number (resolve-aggregation query stage-number index)))

(defmethod lib.metadata.calculation/display-name-method :count
  [query stage-number [_count _opts x]]
  ;; x is optional.
  (if x
    (i18n/tru "Count of {0}" (lib.metadata.calculation/display-name query stage-number x))
    (i18n/tru "Count")))

(defmethod lib.metadata.calculation/column-name-method :count
  [query stage-number [_count _opts x]]
  (if x
    (str "count_" (lib.metadata.calculation/column-name query stage-number x))
    "count"))

(defmethod lib.metadata.calculation/display-name-method :case
  [_query _stage-number _case]
  (i18n/tru "Case"))

(defmethod lib.metadata.calculation/column-name-method :case
  [_query _stage-number _case]
  "case")

(defmethod lib.metadata.calculation/display-name-method :distinct
  [query stage-number [_distinct _opts x]]
  (i18n/tru "Distinct values of {0}"  (lib.metadata.calculation/display-name query stage-number x)))

(defmethod lib.metadata.calculation/column-name-method :distinct
  [query stage-number [_distinct _opts x]]
  (str "distinct_" (lib.metadata.calculation/column-name query stage-number x)))

(defmethod lib.metadata.calculation/display-name-method :avg
  [query stage-number [_avg _opts x]]
  (i18n/tru "Average of {0}" (lib.metadata.calculation/display-name query stage-number x)))

(defmethod lib.metadata.calculation/column-name-method :avg
  [query stage-number [_avg _opts x]]
  (str "avg_" (lib.metadata.calculation/column-name query stage-number x)))

(defmethod lib.metadata.calculation/display-name-method :cum-count
  [query stage-number [_cum-count _opts x]]
  (i18n/tru "Cumulative count of {0}" (lib.metadata.calculation/display-name query stage-number x)))

(defmethod lib.metadata.calculation/column-name-method :cum-count
  [query stage-number [_avg _opts x]]
  (str "cum_count_" (lib.metadata.calculation/column-name query stage-number x)))

(defmethod lib.metadata.calculation/display-name-method :sum
  [query stage-number [_sum _opts x]]
  (i18n/tru "Sum of {0}" (lib.metadata.calculation/display-name query stage-number x)))

(defmethod lib.metadata.calculation/column-name-method :sum
  [query stage-number [_sum _opts x]]
  (str "sum_" (lib.metadata.calculation/column-name query stage-number x)))

(defmethod lib.metadata.calculation/display-name-method :cum-sum
  [query stage-number [_cum-sum _opts x]]
  (i18n/tru "Cumulative sum of {0}" (lib.metadata.calculation/display-name query stage-number x)))

(defmethod lib.metadata.calculation/column-name-method :cum-sum
  [query stage-number [_avg _opts x]]
  (str "cum_sum_" (lib.metadata.calculation/column-name query stage-number x)))

(defmethod lib.metadata.calculation/display-name-method :stddev
  [query stage-number [_stddev _opts x]]
  (i18n/tru "Standard deviation of {0}" (lib.metadata.calculation/display-name query stage-number x)))

(defmethod lib.metadata.calculation/column-name-method :stddev
  [query stage-number [_avg _opts x]]
  (str "std_dev_" (lib.metadata.calculation/column-name query stage-number x)))

(defmethod lib.metadata.calculation/display-name-method :min
  [query stage-number [_min _opts x]]
  (i18n/tru "Min of {0}" (lib.metadata.calculation/display-name query stage-number x)))

(defmethod lib.metadata.calculation/column-name-method :min
  [query stage-number [_min _opts x]]
  (str "min_" (lib.metadata.calculation/column-name query stage-number x)))

(defmethod lib.metadata.calculation/display-name-method :max
  [query stage-number [_max _opts x]]
  (i18n/tru "Max of {0}" (lib.metadata.calculation/display-name query stage-number x)))

(defmethod lib.metadata.calculation/column-name-method :max
  [query stage-number [_max _opts x]]
  (str "max_" (lib.metadata.calculation/column-name query stage-number x)))

(defmethod lib.metadata.calculation/display-name-method :var
  [query stage-number [_var _opts x]]
  (i18n/tru "Variance of {0}" (lib.metadata.calculation/display-name query stage-number x)))

(defmethod lib.metadata.calculation/column-name-method :var
  [query stage-number [_var _opts x]]
  (str "var_" (lib.metadata.calculation/column-name query stage-number x)))

(defmethod lib.metadata.calculation/display-name-method :median
  [query stage-number [_median _opts x]]
  (i18n/tru "Median of {0}" (lib.metadata.calculation/display-name query stage-number x)))

(defmethod lib.metadata.calculation/column-name-method :median
  [query stage-number [_median _opts x]]
  (str "median_" (lib.metadata.calculation/column-name query stage-number x)))

(defmethod lib.metadata.calculation/display-name-method :percentile
  [query stage-number [_percentile _opts x p]]
  (i18n/tru "{0}th percentile of {1}" p (lib.metadata.calculation/display-name query stage-number x)))

(defmethod lib.metadata.calculation/column-name-method :percentile
  [query stage-number [_percentile _opts x p]]
  (lib.util/format "p%d_%s" p (lib.metadata.calculation/column-name query stage-number x)))

;;; we don't currently have sophisticated logic for generating nice display names for filter clauses

(defmethod lib.metadata.calculation/display-name-method :sum-where
  [query stage-number [_sum-where _opts x _pred]]
  (i18n/tru "Sum of {0} matching condition" (lib.metadata.calculation/display-name query stage-number x)))

(defmethod lib.metadata.calculation/column-name-method :sum-where
  [query stage-number [_sum-where _opts x]]
  (str "sum_where_" (lib.metadata.calculation/column-name query stage-number x)))

(defmethod lib.metadata.calculation/display-name-method :share
  [_query _stage-number _share]
  (i18n/tru "Share of rows matching condition"))

(defmethod lib.metadata.calculation/column-name-method :share
  [_query _stage-number _share]
  "share")

(defmethod lib.metadata.calculation/display-name-method :count-where
  [_query _stage-number _count-where]
  (i18n/tru "Count of rows matching condition"))

(defmethod lib.metadata.calculation/column-name-method :count-where
  [_query _stage-number _count-where]
  "count-where")

(lib.common/defop count [] [x])
(lib.common/defop avg [x])
(lib.common/defop count-where [x y])
(lib.common/defop distinct [x])
(lib.common/defop max [x])
(lib.common/defop median [x])
(lib.common/defop min [x])
(lib.common/defop percentile [x y])
(lib.common/defop share [x])
(lib.common/defop stddev [x])
(lib.common/defop sum [x])
(lib.common/defop sum-where [x y])

(mu/defn aggregate :- ::lib.schema/query
  "Adds an aggregation to query."
  ([query an-aggregate-clause]
   (aggregate query -1 an-aggregate-clause))
  ([query stage-number an-aggregate-clause]
   (let [stage-number (or stage-number -1)]
     (lib.util/update-query-stage
       query stage-number
       update :aggregation
       (fn [aggregations]
         (conj (vec aggregations) (lib.common/->op-arg query stage-number an-aggregate-clause)))))))

(mu/defn aggregations :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  "Get metadata about the aggregations in a given stage of a query."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (when-let [aggregation-exprs (not-empty (:aggregation (lib.util/query-stage query stage-number)))]
    (map-indexed (fn [i aggregation]
                   (let [metadata (lib.metadata.calculation/metadata query stage-number aggregation)
                         ag-ref   [:aggregation
                                   {:lib/uuid  (str (random-uuid))
                                    :base-type (:base_type metadata)}
                                   i]]
                     (assoc metadata :field_ref ag-ref, :source :aggregation)))
                 aggregation-exprs)))
