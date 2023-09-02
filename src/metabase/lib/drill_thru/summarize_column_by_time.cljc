(ns metabase.lib.drill-thru.summarize-column-by-time
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
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
             (lib.types.isa/summable? column))
    ;; There must be a date dimension available.
    (when-let [breakout-column (->> (lib.breakout/breakoutable-columns query stage-number)
                                    (filter lib.types.isa/date?)
                                    first)]
      {:lib/type :metabase.lib.drill-thru/drill-thru
       :type     :drill-thru/summarize-column-by-time
       :column   column
       :breakout breakout-column})))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/summarize-column-by-time
  [query stage-number {:keys [breakout column] :as _drill-thru} & _]
  (let [bucketed (->> (lib.temporal-bucket/available-temporal-buckets query stage-number breakout)
                      (filter :default)
                      first
                      (lib.temporal-bucket/with-temporal-bucket breakout))]
    (-> query
        (lib.aggregation/aggregate stage-number (lib.aggregation/sum column))
        (lib.breakout/breakout stage-number bucketed))))
