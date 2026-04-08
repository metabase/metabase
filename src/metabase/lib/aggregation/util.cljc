(ns metabase.lib.aggregation.util
  (:require
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util.unique-name-generator :as lib.util.unique-name-generator]))

(defn unique-aggregation-name
  "Given existing aggregation `clauses` and a `new-clause`, compute a unique `:name` for `new-clause` based on its
  column name, deduplicated against existing clause names."
  [query stage-number clauses new-clause]
  (let [unique-name-fn (lib.util.unique-name-generator/non-truncating-unique-name-generator)]
    (doseq [clause clauses]
      (unique-name-fn (or (lib.options/clause-name clause)
                          (lib.metadata.calculation/column-name query stage-number clause))))
    (unique-name-fn (lib.metadata.calculation/column-name query stage-number new-clause))))
