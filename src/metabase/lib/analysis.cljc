(ns metabase.lib.analysis
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]))

(defn ->mbql
  "Convert the given analysis stage into MBQL."
  [{:keys [kind query from granularity] habit-active :habit.active
    person-column :columns.person timestamp-column :columns.timestamp
    :as _analysis}]
  (when-not (= "habit" kind) (throw (ex-info "unsupported analysis kind" {:kind kind})))
  (let [query (-> query
                  (lib/aggregate (lib/distinct
                                  (lib/with-temporal-bucket timestamp-column
                                    (keyword granularity))))
                  (lib/breakout person-column)
                  (lib/filter (lib/<= from timestamp-column))
                  lib/append-stage
                  (cond-> habit-active
                    (lib/filter habit-active))
                  (lib/aggregate (lib/count)))
        [count-col] (filter #(= "count" (:lib/original-name %))
                            (lib/breakoutable-columns query -1))]
    (lib/breakout query count-col)))
