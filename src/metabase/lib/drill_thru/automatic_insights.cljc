(ns metabase.lib.drill-thru.automatic-insights
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.drill-thru.underlying-records :as lib.drill-thru.underlying-records]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn automatic-insights-drill :- [:maybe ::lib.schema.drill-thru/drill-thru]
  "Automatic insights appears:
  - When clicking on a value with a breakout - eg. a point in a time series, a cell of a table, a bar or pie slice
  - Or when clicking a pivot cell, with a value but no column.
  - Or when clicking a chart legend, in which case there's no column or value set.
  - There must be at least 1 breakout
  - X-rays must be enabled (check the settings)

  There are two forms: X-ray, and \"Compare to the rest\". This is a simple user choice and does not need extra data."
  [query                                        :- ::lib.schema/query
   stage-number                                 :- :int
   {:keys [column column-ref dimensions value]} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             ;; Column with no value is not allowed - that's a column header click. Other combinations are allowed.
             (or (not column) (some? value))
             (lib.metadata/setting query :enable-xrays)
             (not-empty dimensions))
    {:lib/type   :metabase.lib.drill-thru/drill-thru
     :type       :drill-thru/automatic-insights
     :column-ref column-ref
     :dimensions dimensions}))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/automatic-insights
  [query _stage-number drill-thru & _]
  ;; Returns a dummy query with the right filters for the underlying query. Rather than using this query directly, the
  ;; FE logic for this drill will grab the filters and build a URL with them.
  (-> query
      ;; Drop any existing filters so they aren't duplicated.
      (lib.util/update-query-stage -1 dissoc :filters)
      ;; Then transform the aggregations and selected breakouts into filters.
      (lib.drill-thru.underlying-records/drill-underlying-records drill-thru)))
