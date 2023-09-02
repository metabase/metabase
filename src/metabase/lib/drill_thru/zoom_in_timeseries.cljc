(ns metabase.lib.drill-thru.zoom-in-timeseries
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn zoom-in-timeseries-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.zoom-in.timeseries]
  "Zooms in on some window, showing it in finer detail.

  For example: The month of a year, days or weeks of a quarter, smaller lat/long regions, etc.

  This is different from the `:drill-thru/zoom` type, which is for showing the details of a single object."
  ;; TODO: This naming is confusing. Fix it?
  [query                             :- ::lib.schema/query
   stage-number                      :- :int
   {:keys [column dimensions value]} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (some? value)
             (not-empty dimensions))
    {:lib/type   :metabase.lib.drill-thru/drill-thru
     :type       :drill-thru/zoom-in.timeseries
     ;; TODO: This is a bit confused for non-COUNT aggregations. Perhaps it should just always be 10 or something?
     ;; Note that some languages have different plurals for exactly 2, or for 1, 2-5, and 6+.
     :row-count  (if (number? value) value 2)
     :table-name (some->> (lib.util/source-table-id query)
                          (lib.metadata/table query)
                          (lib.metadata.calculation/display-name query stage-number))}))
