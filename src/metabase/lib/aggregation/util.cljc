(ns metabase.lib.aggregation.util
  (:require
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util.unique-name-generator :as lib.util.unique-name-generator]))

(defn- taken-names
  "Build a set of names already in use by existing aggregation `clauses`. Clauses with explicit `:name` use that;
  unnamed clauses get a name via the unique-name-generator based on their column name."
  [query stage-number clauses]
  (let [unique-name-fn (lib.util.unique-name-generator/non-truncating-unique-name-generator)]
    (into #{}
          (map (fn [clause]
                 (or (lib.options/clause-name clause)
                     (unique-name-fn (lib.metadata.calculation/column-name query stage-number clause)))))
          clauses)))

(defn- next-available-name
  "Given a set of `taken` names and a `default-name`, return `default-name` if available, otherwise
  `default-name_2`, `default-name_3`, etc."
  [taken default-name]
  (if-not (contains? taken default-name)
    default-name
    (loop [i 2]
      (let [candidate (str default-name "_" i)]
        (if-not (contains? taken candidate)
          candidate
          (recur (inc i)))))))

(defn unique-aggregation-name
  "Given existing aggregation `clauses` and a `new-clause`, compute a unique `:name` for `new-clause` based on its
  column name, deduplicated against existing clause names."
  [query stage-number clauses new-clause]
  (next-available-name
   (taken-names query stage-number clauses)
   (lib.metadata.calculation/column-name query stage-number new-clause)))
