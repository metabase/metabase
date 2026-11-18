(ns metabase.lib.analysis
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]))

(defn- add-filters [query filters]
  (reduce lib/filter query filters))

(defn ->mbql
  "Convert the given analysis stage into MBQL."
  [metadata-provider {:keys [table_id kind timestamp_column person_column filters]
                      :as _analysis}]
  (when-not (= "habit" kind) (throw (ex-info "unsupported analysis kind" {:kind kind})))
  (let [person-field (lib.metadata/field metadata-provider person_column)
        timestamp-field (lib.metadata/field metadata-provider timestamp_column)
        query (-> (lib/query metadata-provider (lib.metadata/table metadata-provider
                                                                   table_id))
                  (lib/aggregate (lib/distinct timestamp-field))
                  (lib/breakout person-field)
                  (add-filters filters)
                  lib/append-stage
                  (lib/aggregate (lib/count)))
        [count-col] (filter #(= "count" (:lib/original-name %))
                            (lib/breakoutable-columns query -1))]
    (lib/breakout query count-col)))
