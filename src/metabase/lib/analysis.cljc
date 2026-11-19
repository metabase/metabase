(ns metabase.lib.analysis
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.column :as column]
   [metabase.util.time :as time]))

(def ^:private units {"d" :day "w" :week "m" :month "q" :quarter "y" :year})

;; it would be better to use metabase.query-processor.parameters.dates for this
;; but that's got a lot of JVM-specific bits in it.
(defn- date-range->date [date-range]
  (if-let [[_ n unit] (re-find #"^(\d+)([dwmqy])$" date-range)]
    (time/add (time/local-date) (units unit) (- (parse-long n)))
    (throw (ex-info "unsupported date range" {:date-range date-range}))))

(defn ->mbql
  "Convert the given analysis stage into MBQL."
  [{:keys [kind query date_range granularity]
    habit-values :habit.values
    person-column-key :columns.person timestamp-column-key :columns.timestamp
    :as _analysis}]
  (when-not (= "habit" kind) (throw (ex-info "unsupported analysis kind" {:kind kind})))
  (let [timestamp-column (column/column-with-unique-key query timestamp-column-key)
        person-column (column/column-with-unique-key query person-column-key)
        query (-> query
                  (lib/aggregate (lib/distinct
                                  (lib/with-temporal-bucket timestamp-column
                                    (keyword granularity))))
                  (lib/breakout person-column)
                  (lib/filter (lib/<= (date-range->date date_range) timestamp-column))
                  lib/append-stage
                  (lib/aggregate (case habit-values
                                   "count" (lib/count)
                                   ;; TODO: come back once we have window functions
                                   "percent" (lib/count))))
        [count-col] (filter #(= "count" (:lib/original-name %))
                            (lib/breakoutable-columns query -1))]
    (lib/breakout query count-col)))
