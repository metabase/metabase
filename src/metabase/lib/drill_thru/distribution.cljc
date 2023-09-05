(ns metabase.lib.drill-thru.distribution
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.ref :as lib.ref]
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
             (not (lib.types.isa/primary-key? column))
             (not (lib.types.isa/structured?  column))
             (not (lib.types.isa/comment?     column))
             (not (lib.types.isa/description? column)))
    {:lib/type  :metabase.lib.drill-thru/drill-thru
     :type      :drill-thru/distribution
     :column    column}))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/distribution
  [query stage-number {:keys [column] :as _drill-thru} & _]
  (when (lib.drill-thru.common/mbql-stage? query stage-number)
    (let [breakout (cond
                     (lib.types.isa/temporal? column) (lib.temporal-bucket/with-temporal-bucket column :month)
                     (lib.types.isa/numeric? column)  (lib.binning/with-binning column (lib.binning/default-auto-bin))
                     :else                            (lib.ref/ref column))]
      (-> query
          ;; Remove most of the target stage.
          (lib.util/update-query-stage stage-number dissoc :aggregation :breakout :limit :order-by)
          ;; Then set a count aggregation and the breakout above.
          (lib.aggregation/aggregate stage-number (lib.aggregation/count))
          (lib.breakout/breakout stage-number breakout)))))
