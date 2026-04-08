(ns metabase.lib.aggregation.util
  (:require
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util.unique-name-generator :as lib.util.unique-name-generator]))

(defn unique-aggregation-name
  "Given existing aggregation `clauses` and a `new-clause`, compute a unique `:name` for `new-clause` based on its
  column name, deduplicated against existing clause names."
  [query stage-number clauses new-clause]
  (let [base-name-fn  (lib.util.unique-name-generator/non-truncating-unique-name-generator)
        taken-name-fn (lib.util.unique-name-generator/non-truncating-unique-name-generator)]
    (doseq [clause clauses
            :let [base-name (lib.metadata.calculation/column-name-method query stage-number clause)]
            clause-name (lib.options/clause-name clause)]
      (base-name-fn base-name)
      (taken-name-fn (or clause-name base-name)))
    (let [new-name (base-name-fn (lib.metadata.calculation/column-name-method query stage-number new-clause))]
      (taken-name-fn new-name))))
