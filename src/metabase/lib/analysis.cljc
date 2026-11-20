(ns metabase.lib.analysis
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.column :as column]
   [metabase.lib.options :as lib.options]))

(defn- named [aggregation column-name]
  (lib.options/update-options aggregation assoc :name column-name))

(defn ->mbql
  "Convert the given analysis stage into MBQL."
  [{:keys [kind base_query date_range granularity]
    habit-values :habit.values
    person-column-key :columns.person timestamp-column-key :columns.timestamp
    :as _analysis}]
  (when-not (= "habit" kind) (throw (ex-info "unsupported analysis kind" {:kind kind})))
  (let [timestamp-column (column/column-with-unique-key base_query timestamp-column-key)
        person-column (column/column-with-unique-key base_query person-column-key)
        query (-> base_query
                  (lib/aggregate (named (lib/distinct
                                         (lib/with-temporal-bucket timestamp-column
                                           (keyword granularity)))
                                        "periods"))
                  (lib/breakout person-column)
                  lib/append-stage
                  (lib/aggregate (named (case habit-values
                                          "count" (lib/count)
                                          ;; TODO: come back once we have window functions
                                          "percent" (lib/count))
                                        "people")))
        [periods-col] (filter #(= "periods" (:lib/original-name %))
                              (lib/breakoutable-columns query -1))]
    (lib/breakout query periods-col)))
