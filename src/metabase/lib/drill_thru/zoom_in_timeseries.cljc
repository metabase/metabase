(ns metabase.lib.drill-thru.zoom-in-timeseries
  "\"See this month by weeks\" type of transform.

  Entry points:

  - Cell

  - Pivot cell

  - Legend item

  Requirements:

  - `dimensions` have a date column with `year`, `quarter`, `month`, `week`, `day`, `hour` temporal unit. For other
    units, or when there is no temporal bucketing this drill cannot be applied. Changing `hour` to `minute` ends the
    sequence. Only the first matching column would be used in query transformation.

  - `displayInfo` returns `displayName` with `See this {0} by {1}` string using the current and the next available
    temporal unit.

  Query transformation:

  - Remove breakouts for `dimensions`. Please note that with regular cells and pivot cells it would mean removing all
    breakouts; but with legend item clicks it would remove the breakout for the legend item column only.

  - Add a filter based on columns and values from `dimensions`. Take temporal units and binning strategies into
    account
    https://github.com/metabase/metabase/blob/0624d8d0933f577cc70c03948f4b57f73fe13ada/frontend/src/metabase-lib/queries/utils/actions.js#L99

  - Add a breakout based on the date column (from requirements), using the next (more granular) temporal unit.

  Question transformation:

  - Set default display"
  (:require
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

;;; TODO -- we shouldn't include hour and minute for `:type/Date` columns.
(def ^:private valid-current-units
  [:year :quarter :month :week :day :hour :minute])

(def ^:private unit->next-unit
  (zipmap (drop-last valid-current-units)
          (drop 1 valid-current-units)))

(mu/defn ^:private matching-breakout-dimension :- [:maybe ::lib.schema.drill-thru/context.row.value]
  [query        :- ::lib.schema/query
   stage-number :- :int
   dimensions   :- [:sequential ::lib.schema.drill-thru/context.row.value]]
  (first (for [breakout (lib.breakout/breakouts query stage-number)
               :when (and (lib.util/clause-of-type? breakout :field)
                          (lib.temporal-bucket/temporal-bucket breakout))
               {:keys [column] :as dimension} dimensions
               :when (and (lib.equality/find-matching-column breakout [column])
                          (= (lib.temporal-bucket/temporal-bucket breakout)
                             (lib.temporal-bucket/temporal-bucket column)))]
           (assoc dimension :column-ref breakout))))

(mu/defn ^:private next-breakout-unit :- [:maybe ::lib.schema.temporal-bucketing/unit.date-time.truncate]
  [column :- ::lib.schema.metadata/column]
  (when-let [current-unit (lib.temporal-bucket/raw-temporal-bucket column)]
    (when (contains? (set valid-current-units) current-unit)
      (unit->next-unit current-unit))))

(mu/defn ^:private describe-next-unit :- ::lib.schema.common/non-blank-string
  [unit :- ::lib.schema.drill-thru/drill-thru.zoom-in.timeseries.next-unit]
  (case unit
    :quarter (i18n/tru "See this year by quarter")
    :month   (i18n/tru "See this quarter by month")
    :week    (i18n/tru "See this month by week")
    :day     (i18n/tru "See this week by day")
    :hour    (i18n/tru "See this day by hour")
    :minute  (i18n/tru "See this hour by minute")))

(mu/defn zoom-in-timeseries-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.zoom-in.timeseries]
  "Zooms in on some window, showing it in finer detail.

  For example: The month of a year, days or weeks of a quarter, smaller lat/long regions, etc.

  This is different from the `:drill-thru/zoom` type, which is for showing the details of a single object."
  [query                              :- ::lib.schema/query
   stage-number                       :- :int
   {:keys [dimensions], :as _context} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             (not-empty dimensions))
    (when-let [{:keys [value], :as dimension} (matching-breakout-dimension query stage-number dimensions)]
      (when value
        (when-let [next-unit (next-breakout-unit (:column dimension))]
          {:lib/type     :metabase.lib.drill-thru/drill-thru
           :display-name (describe-next-unit next-unit)
           :type         :drill-thru/zoom-in.timeseries
           :dimension    dimension
           :next-unit    next-unit})))))

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/zoom-in.timeseries
  [query                         :- ::lib.schema/query
   stage-number                  :- :int
   {:keys [dimension next-unit]} :- ::lib.schema.drill-thru/drill-thru.zoom-in.timeseries]
  (let [{:keys [column value]} dimension
        old-breakout           (:column-ref dimension)
        new-breakout           (lib.temporal-bucket/with-temporal-bucket old-breakout next-unit)]
    (-> query
        (lib.filter/filter stage-number (lib.filter/= column value))
        (lib.remove-replace/replace-clause stage-number old-breakout new-breakout))))
