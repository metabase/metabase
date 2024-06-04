(ns metabase.lib.drill-thru.compare-aggregations
  "Adds 1 or more offset()-based aggregations.

  Entry points:

  - Column header

  Query transformation:

  - Adds 1 or more aggregations that compare the clicked column over time."
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.util.malli :as mu]))

(mu/defn compare-aggregations-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.compare-aggregations]
  "Column clicks on aggregated columns."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and column
             (nil? value)
             (lib.drill-thru.common/mbql-stage? query stage-number)
             (= (:lib/source column) :source/aggregations))
    {:lib/type :metabase.lib.drill-thru/drill-thru
     :type     :drill-thru/compare-aggregations
     :column   column}))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/compare-aggregations
  [_query _stage-number drill-thru]
  (assoc (select-keys drill-thru [:type])
    :aggregation-index 0))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/compare-aggregations
  [_query _stage-number _drill & _args]
  (throw (ex-info "Do not call drill-thru for compare-aggregations; add the aggregations directly" {})))
