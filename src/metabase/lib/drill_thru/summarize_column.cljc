(ns metabase.lib.drill-thru.summarize-column
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(mu/defn summarize-column-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.summarize-column]
  "A set of possible aggregations that can summarize this column: distinct values, sum, average.
  Separate from [[summarize-column-by-time-drill]] which breaks out a column over time."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column)))
    (let [aggregation-ops (concat [:distinct]
                                  (when (lib.types.isa/summable? column)
                                    [:sum :avg]))]
      {:lib/type     :metabase.lib.drill-thru/drill-thru
       :type         :drill-thru/summarize-column
       :column       column
       :aggregations aggregation-ops})))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/summarize-column
  [_query _stage-number {:keys [aggregations]}]
  {:type         :drill-thru/summarize-column
   :aggregations aggregations})

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/summarize-column
  [query stage-number {:keys [column] :as _drill-thru} aggregation & _]
  ;; TODO: The original FE code for this does `setDefaultDisplay` as well.
  (let [aggregation-fn (case (keyword aggregation)
                         :distinct lib.aggregation/distinct
                         :sum      lib.aggregation/sum
                         :avg      lib.aggregation/avg)]
    (lib.aggregation/aggregate query stage-number (aggregation-fn column))))
