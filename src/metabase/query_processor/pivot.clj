(ns metabase.query-processor.pivot
  "Pivot table actions for the query processor"
  (:require [cheshire.core :as json]))

(defn powerset
  "Generate a powerset while maintaining the original ordering as much as possible"
  [xs]
  (for [combo (reverse (range (int (Math/pow 2 (count xs)))))]
    (for [item  (range 0 (count xs))
          :when (not (zero? (bit-and (bit-shift-left 1 item) combo)))]
      (nth xs item))))

(defn- generate-breakouts
  "Generate the combinatorial breakouts for a given query pivot table query"
  [breakouts]
  (powerset breakouts))

(defn generate-queries
  "Generate the additional queries to perform a generic pivot table"
  [request]
  (let [query     (:query request)
        breakouts (generate-breakouts (:breakout query))]
    (map (fn [breakout]
           (-> request
               (assoc-in [:query :breakout] breakout)
               ;;TODO: `pivot-grouping` is not "magic" enough to mark it as an internal thing
               (assoc-in [:query :fields] [[:expression "pivot-grouping"]])
               ;;TODO: replace this value with a bitmask or something to indicate the source better
               (assoc-in [:query :expressions] {"pivot-grouping" [:ltrim (json/generate-string breakout)]})))
         breakouts)))