(ns metabase.lib.drill-thru.distribution
  "Raw data with a breakout based on the selected column.

  For date columns, sets \"Month\" as a temporal unit. For numeric columns, uses the default binning strategy. Other
  columns are not changed.

  Entry points:

  - Column header

  Requirements:

  - No aggregation or breakout clauses in the query
  - Column not `type/PK`, `type/SerializedJSON`, `type/Description`, `type/Comment`

  Query transformation (last stage only):

  - Remove all aggregation, breakout, orderBy, limit clauses

  - Aggregate by \"count\" operator

  - Breakout by the selected column. If the column is a date column, add \"Month\" temporal unit. If the column is a
    numeric column, apply the default binning strategy. Otherwise use the column as it is.

  Question transformation:

  - Set \"bar\" display"
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

;; TODO: The original `Question.distribution()` sets the display to `bar`, but that's out of scope for MLv2.
;; Make sure the FE does this on the question after evolving the query.
(mu/defn distribution-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.distribution]
  "Select a column and see a histogram of how many rows fall into an automatic set of bins/buckets.
  - For dates, breaks out by month by default.
  - For numeric values, by an auto-selected set of bins
  - For strings, by each distinct value (which might be = the number of rows)"
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (nil? value)
             (not= (:lib/source column) :source/aggregations)
             (not (lib.types.isa/primary-key? column))
             (not (lib.types.isa/structured?  column))
             (not (lib.types.isa/comment?     column))
             (not (lib.types.isa/description? column))
             (not (lib.breakout/breakout-column? query stage-number column)))
    {:lib/type  :metabase.lib.drill-thru/drill-thru
     :type      :drill-thru/distribution
     :column    column}))

(defn- add-temporal-bucketing-or-binning
  [column]
  (cond
    (lib.types.isa/temporal? column)
    (lib.temporal-bucket/with-temporal-bucket column :month)

    (and (lib.types.isa/numeric? column)
         (not (lib.types.isa/foreign-key? column)))
    (lib.binning/with-binning column (lib.binning/default-auto-bin))

    :else
    column))

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/distribution :- ::lib.schema/query
  [query                            :- ::lib.schema/query
   stage-number                     :- :int
   {:keys [column] :as _drill-thru} :- ::lib.schema.drill-thru/drill-thru.distribution]
  (when (lib.drill-thru.common/mbql-stage? query stage-number)
    (let [breakout (add-temporal-bucketing-or-binning column)]
      (-> query
          ;; Remove most of the target stage.
          (lib.util/update-query-stage stage-number dissoc :aggregation :breakout :limit :order-by)
          ;; Then set a count aggregation and the breakout above.
          (lib.aggregation/aggregate stage-number (lib.aggregation/count))
          (lib.breakout/breakout stage-number breakout)))))
