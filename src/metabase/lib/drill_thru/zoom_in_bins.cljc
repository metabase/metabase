(ns metabase.lib.drill-thru.zoom-in-bins
  "\"Zoom\" transform for numeric (including location) columns.

  Entry points:

  - Cell

  - Pivot cell

  - Legend item

  Requirements:

  - `dimensions` have a numeric column with a binning strategy applied. It can be the default one (\"Auto\"). Only the
    first matching column would be used in query transformation.

  Query transformation:

  - Remove breakouts for `dimensions`. Please note that with regular cells and pivot cells it would mean removing all
    breakouts; but with legend item clicks it would remove the breakout for the legend item column only.

  - Remove any existing filters for this column.

  - Add new filters limiting this column to the range defined by the clicked bin.
    https://github.com/metabase/metabase/blob/0624d8d0933f577cc70c03948f4b57f73fe13ada/frontend/src/metabase-lib/queries/utils/actions.js#L99

  - Add a breakout based on the numeric column (from requirements). For location columns, use the binning strategy
    that is 10x more granular (e.g. `Every 1 degree` -> `Every 0.1 degrees`). For numeric columns, use the default
    binning strategy (\"Auto\").

  Question transformation:

  - Set default display

  This covers two types of 'zoom in' drills:

  1. If we have a query with a breakout with binning using the `:num-bins` strategy, return a drill that when applied
     adds a filter for the selected bin ('zooms in') and changes the binning strategy to default. E.g.

         ORDERS + count aggregation + breakout on TOTAL (10 bins)

         =>

         Click the 40-60 bin in the results (returned by the QP as `40`) and choose 'Zoom In'

         =>

         ORDERS + count aggregation + filter TOTAL >= 40 and < 60 + breakout on TOTAL (auto bin)

     Note that we need to look at the fingerprint info in the column metadata to determine how big each bin
     is (e.g. to determine each bin was 20 wide) -- this uses [[lib.binning.util/nicer-bin-width]], which is what the QP
     uses.

     In other words, this bin adds a filter for the selected bin and the replaces the breakout binning with a `:default`
     binning strategy.

  2. Breakout with binning with `:bin-width`:

         PEOPLE + count aggregation + breakout on LATITUDE (bin width: 1°)

         =>

         Click on the 41°-42° bin in the results (returned by the QP as `41`) and choose 'Zoom In'

         =>

         PEOPLE + count aggregation + filter LATITUDE >= 41 and < 42 + breakout on LATITUDE (bin width: 0.1°)

     In other words, this bin adds a filter for the selected bin and then divides the bin width in the breakout binning
     options by 10."
  (:require
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]))

;;;
;;; available-drill-thrus
;;;

(mu/defn zoom-in-binning-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.zoom-in.binning]
  "Return a drill thru that 'zooms in' on a breakout that uses `:binning` if applicable.
  See [[metabase.lib.drill-thru.zoom-in-bins]] docstring for more information."
  [query                                :- ::lib.schema/query
   stage-number                         :- :int
   {:keys [column value], :as _context} :- ::lib.schema.drill-thru/context]
  (when (and column value)
    (when-let [existing-breakout (first (lib.breakout/existing-breakouts query stage-number column))]
      (when-let [binning (lib.binning/binning existing-breakout)]
        (when-let [{:keys [min-value max-value bin-width]} (lib.binning/resolve-bin-width query column value)]
          (case (:strategy binning)
            (:num-bins :default)
            {:lib/type    :metabase.lib.drill-thru/drill-thru
             :type        :drill-thru/zoom-in.binning
             :column      column
             :min-value   value
             :max-value   (+ value bin-width)
             :new-binning {:strategy :default}}

            :bin-width
            {:lib/type    :metabase.lib.drill-thru/drill-thru
             :type        :drill-thru/zoom-in.binning
             :column      column
             :min-value   min-value
             :max-value   max-value
             :new-binning (update binning :bin-width #(double (/ % 10.0)))}))))))


;;;
;;; application
;;;

(mu/defn ^:private update-breakout :- ::lib.schema/query
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- ::lib.schema.metadata/column
   new-binning  :- ::lib.schema.binning/binning]
  (if-let [existing-breakout (first (lib.breakout/existing-breakouts query stage-number column))]
    (lib.remove-replace/replace-clause query stage-number existing-breakout (lib.binning/with-binning column new-binning))
    (lib.breakout/breakout query stage-number (lib.binning/with-binning column new-binning))))

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/zoom-in.binning :- ::lib.schema/query
  [query                                        :- ::lib.schema/query
   stage-number                                 :- :int
   {:keys [column min-value max-value new-binning]} :- ::lib.schema.drill-thru/drill-thru.zoom-in.binning]
  (let [old-filters (filter (fn [[operator _opts filter-column]]
                              (and (#{:>= :<} operator)
                                   (lib.equality/find-matching-column filter-column [column])))
                            (lib.filter/filters query stage-number))]
    (-> (reduce lib.remove-replace/remove-clause query old-filters)
        (lib.filter/filter stage-number (lib.filter/>= column min-value))
        (lib.filter/filter stage-number (lib.filter/< column max-value))
        (update-breakout stage-number column new-binning))))
