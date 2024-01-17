(ns metabase.lib.drill-thru.summarize-column-by-time
  "Adds a `sum` aggregation clause for the selected column and a breakout on the first available date column.

  Entry points:

  - Column header

  Requirements:

  - No aggregation or breakout clauses in the query

  - The selected column is `Summable`, i.e. compatible with `sum` operator

  - There are date columns available for the breakout clause

  Query transformation:

  - Add aggregation clause for the selected column

  - Add a breakout on the first available date column. Use the default temporal unit available for this column. This
    unit is computed based on `fingerprint`
    https://github.com/metabase/metabase/blob/0624d8d0933f577cc70c03948f4b57f73fe13ada/frontend/src/metabase-lib/metadata/Field.ts#L397

  Question transformation:

  - Set default display"
  (:require
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(mu/defn summarize-column-by-time-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.summarize-column-by-time]
  "A breakout summarizing a column over time.
  Separate from single-value [[summarize-column-drill]] for sum, average, and distinct value count."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column))
             (lib.types.isa/summable? column)
             (not= (:lib/source column) :source/aggregations))
    ;; There must be a date dimension available.
    (when-let [breakout-column (m/find-first lib.types.isa/temporal?
                                             (lib.breakout/breakoutable-columns query stage-number))]
      (when-let [bucketing-unit (m/find-first :default
                                              (lib.temporal-bucket/available-temporal-buckets query stage-number breakout-column))]
        ;; only suggest this drill thru if the breakout it would apply does not already exist.
        (let [bucketed (lib.temporal-bucket/with-temporal-bucket breakout-column bucketing-unit)]
          (when (lib.schema.util/distinct-refs? (map lib.ref/ref (cons bucketed (lib.breakout/breakouts query stage-number))))
            {:lib/type :metabase.lib.drill-thru/drill-thru
             :type     :drill-thru/summarize-column-by-time
             :column   column
             :breakout breakout-column
             :unit     (lib.temporal-bucket/raw-temporal-bucket bucketing-unit)}))))))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/summarize-column-by-time
  [query stage-number {:keys [breakout column unit] :as _drill-thru} & _]
  (let [bucketed (lib.temporal-bucket/with-temporal-bucket breakout unit)]
    (-> query
        (lib.aggregation/aggregate stage-number (lib.aggregation/sum column))
        (lib.breakout/breakout stage-number bucketed))))
