(ns metabase.lib.drill-thru.zoom-in-timeseries
  "\"See this month by weeks\" type of transform.

  Entry points:

  - Cell

  - Pivot cell

  - Legend item

  Requirements:

  - `dimensions` have a date or datetime column with `year`, `quarter`, `month`, `week`, `day`, `hour` temporal unit.
    For other units, or when there is no temporal bucketing, this drill cannot be applied. Changing `hour` to `minute`
    ends the sequence for datetime columns (`week` to `day` for date columns). Only the first matching column would be
    used in query transformation.

  - `displayInfo` returns `displayName` with `See this {0} by {1}` string using the current and the next available
    temporal unit.

  Query transformation:

  - Remove breakouts for `dimensions`. Please note that with regular cells and pivot cells it would mean removing all
    breakouts; but with legend item clicks it would remove the breakout for the legend item column only.

  - Add a filter based on columns and values from `dimensions`. Take temporal units and binning strategies into
    account
    https://github.com/metabase/metabase/blob/0624d8d0933f577cc70c03948f4b57f73fe13ada/frontend/src/metabase-lib/queries/utils/actions.js#L99

  - Add a breakout based on the date or datetime column (from requirements), using the next (more granular) temporal
    unit.

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
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.underlying :as lib.underlying]
   [metabase.lib.util :as lib.util]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(mu/defn- valid-current-units :- [:sequential ::lib.schema.temporal-bucketing/unit.date-time.truncate]
  [query :- ::lib.schema/query
   stage :- :int
   field :- :mbql.clause/field]
  (->> (lib.temporal-bucket/available-temporal-buckets query stage field)
       (map lib.temporal-bucket/raw-temporal-bucket)
       (filter lib.schema.temporal-bucketing/datetime-truncation-units)
       reverse))

(mu/defn- matching-breakout-dimension :- [:maybe ::lib.schema.drill-thru/context.row.value]
  [query        :- ::lib.schema/query
   stage-number :- :int
   dimensions   :- [:sequential ::lib.schema.drill-thru/context.row.value]]
  (first (for [[breakout-ref breakout-col] (map vector
                                                (lib.breakout/breakouts query stage-number)
                                                (lib.breakout/breakouts-metadata query stage-number))
               :when (and (lib.util/clause-of-type? breakout-ref :field)
                          (lib.temporal-bucket/temporal-bucket breakout-ref))
               {:keys [column] :as dimension} dimensions
               :when (and (lib.equality/find-matching-column breakout-ref [column])
                          (= (lib.temporal-bucket/raw-temporal-bucket breakout-ref)
                             (or (lib.temporal-bucket/raw-temporal-bucket column)
                                 ;; If query is multi-stage and column comes from a call
                                 ;; to [[lib.calculation/returned-columns]], then it may have an
                                 ;; :inherited-temporal-unit instead of a :temporal-unit.
                                 (:inherited-temporal-unit column))))]
           ;; If stage-number is not -1, then the column from the input dimension will be from the last stage,
           ;; whereas breakout-col will be the corresponding breakout column from [[lib.underlying/top-level-stage]].
           (assoc dimension :column breakout-col :column-ref breakout-ref))))

(mu/defn- next-breakout-unit :- [:maybe ::lib.schema.drill-thru/drill-thru.zoom-in.timeseries.next-unit]
  [query :- ::lib.schema/query
   stage :- :int
   field :- :mbql.clause/field]
  (when-let [current-unit (lib.temporal-bucket/raw-temporal-bucket field)]
    (->> (valid-current-units query stage field)
         (drop-while #(not= % current-unit))
         second)))

(mu/defn- describe-next-unit :- ::lib.schema.common/non-blank-string
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
  [query                                         :- ::lib.schema/query
   _stage-number                                 :- :int
   {:keys [dimensions], :as _context}            :- ::lib.schema.drill-thru/context]
  ;; For multi-stage queries, we want the stage-number of the underlying stage with breakouts or aggregations.
  (let [stage-number (lib.underlying/top-level-stage-number query)]
    (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
               dimensions)
      (when-let [{:keys [value column-ref], :as dimension}
                 (matching-breakout-dimension query stage-number dimensions)]
        (when value
          (when-let [next-unit (next-breakout-unit query stage-number column-ref)]
            {:lib/type     :metabase.lib.drill-thru/drill-thru
             :display-name (describe-next-unit next-unit)
             :type         :drill-thru/zoom-in.timeseries
             :dimension    dimension
             :next-unit    next-unit}))))))

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/zoom-in.timeseries
  [query                         :- ::lib.schema/query
   _stage-number                 :- :int
   {:keys [dimension next-unit]} :- ::lib.schema.drill-thru/drill-thru.zoom-in.timeseries]
  (let [{:keys [column value]} dimension
        old-breakout           (:column-ref dimension)
        new-breakout           (lib.temporal-bucket/with-temporal-bucket old-breakout next-unit)
        stage-number           (lib.underlying/top-level-stage-number query)]
    (-> query
        (lib.filter/filter stage-number (lib.filter/= column value))
        (lib.remove-replace/replace-clause stage-number old-breakout new-breakout))))
