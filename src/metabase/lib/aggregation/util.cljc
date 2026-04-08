(ns metabase.lib.aggregation.util
  (:require
   [metabase.lib.options :as lib.options]))

(defn- unique-name [names original-name]
  (if-not (contains? names original-name)
    original-name
    (loop [i 2]
      (let [indexed-name (str original-name "_" i)]
        (if-not (contains? names indexed-name)
          indexed-name
          (recur (inc i)))))))

(defn unique-aggregation-name
  "Compute a unique name starting with `\"aggregation\"`, deduplicated against existing `clauses`' `:name` options."
  [clauses]
  (unique-name
   (into #{} (keep lib.options/clause-name) clauses)
   "aggregation"))
