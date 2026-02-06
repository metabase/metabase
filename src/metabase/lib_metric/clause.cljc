(ns metabase.lib-metric.clause
  "Functions for manipulating clauses in MetricDefinitions.
   Clauses are MBQL expressions stored in :filters and :projections vectors.
   Each clause has a :lib/uuid in its options map for identification."
  (:require
   [metabase.lib.options :as lib.options]))

(defn- find-clause-location
  "Find a clause by its UUID in the definition's :filters or :projections.
   Returns [location idx] where location is :filters or :projections,
   or nil if not found."
  [definition target-uuid]
  (letfn [(find-in-vec [v]
            (some (fn [[idx clause]]
                    (when (= target-uuid (lib.options/uuid clause))
                      idx))
                  (map-indexed vector v)))]
    (if-let [idx (find-in-vec (:filters definition))]
      [:filters idx]
      (when-let [idx (find-in-vec (:projections definition))]
        [:projections idx]))))

(defn replace-clause
  "Replace a clause in the definition with a new clause.
   Finds the target clause by its :lib/uuid and replaces it with new-clause.
   Returns the definition unchanged if target clause is not found."
  [definition target-clause new-clause]
  (let [target-uuid (lib.options/uuid target-clause)]
    (if-let [[location idx] (find-clause-location definition target-uuid)]
      (assoc-in definition [location idx] new-clause)
      definition)))

(defn remove-clause
  "Remove a clause from the definition.
   Finds the clause by its :lib/uuid and removes it from :filters or :projections.
   Returns the definition unchanged if clause is not found."
  [definition clause]
  (let [target-uuid (lib.options/uuid clause)]
    (if-let [[location idx] (find-clause-location definition target-uuid)]
      (update definition location (fn [v]
                                    (into (subvec v 0 idx)
                                          (subvec v (inc idx)))))
      definition)))

(defn swap-clauses
  "Swap two clauses in the definition.
   Finds both clauses by their :lib/uuid and swaps their positions.
   Works within the same vector (both filters, both projections) or across vectors.
   Returns the definition unchanged if either clause is not found."
  [definition source-clause target-clause]
  (let [source-uuid (lib.options/uuid source-clause)
        target-uuid (lib.options/uuid target-clause)]
    (if-let [[source-loc source-idx] (find-clause-location definition source-uuid)]
      (if-let [[target-loc target-idx] (find-clause-location definition target-uuid)]
        (let [source-val (get-in definition [source-loc source-idx])
              target-val (get-in definition [target-loc target-idx])]
          (-> definition
              (assoc-in [source-loc source-idx] target-val)
              (assoc-in [target-loc target-idx] source-val)))
        definition)
      definition)))
