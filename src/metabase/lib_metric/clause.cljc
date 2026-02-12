(ns metabase.lib-metric.clause
  "Functions for manipulating clauses in MetricDefinitions.
   Clauses are MBQL expressions stored in :filters (as instance-filter entries)
   and :projections (as typed-projection entries with nested dimension references).
   Each clause has a :lib/uuid in its options map for identification."
  (:require
   [metabase.lib.options :as lib.options]))

(defn- find-clause-location
  "Find a clause by its UUID in the definition's :filters or :projections.
   Searches instance-filter entries (checking :filter clause UUIDs) and
   typed-projection entries (checking dimension reference UUIDs).
   Returns [deep-path] or nil if not found.
   For filters: [:filters idx :filter]
   For projections: [:projections proj-idx :projection dim-idx]"
  [definition target-uuid]
  ;; Search filters: each entry is {:lib/uuid ... :filter <mbql-clause>}
  (or (some (fn [[idx entry]]
              (when (= target-uuid (lib.options/uuid (:filter entry)))
                [:filters idx :filter]))
            (map-indexed vector (:filters definition)))
      ;; Search projections: each entry is {:type ... :id ... :projection [dim-refs...]}
      (some (fn [[proj-idx tp]]
              (some (fn [[dim-idx dim-ref]]
                      (when (= target-uuid (lib.options/uuid dim-ref))
                        [:projections proj-idx :projection dim-idx]))
                    (map-indexed vector (:projection tp))))
            (map-indexed vector (:projections definition)))))

(defn replace-clause
  "Replace a clause in the definition with a new clause.
   Finds the target clause by its :lib/uuid and replaces it with new-clause.
   Returns the definition unchanged if target clause is not found."
  [definition target-clause new-clause]
  (let [target-uuid (lib.options/uuid target-clause)]
    (if-let [path (find-clause-location definition target-uuid)]
      (assoc-in definition path new-clause)
      definition)))

(defn remove-clause
  "Remove a clause from the definition.
   Finds the clause by its :lib/uuid and removes it.
   For filters: removes the entire instance-filter entry from :filters.
   For projections: removes the dim-ref from the typed-projection's :projection vector.
   Returns the definition unchanged if clause is not found."
  [definition clause]
  (let [target-uuid (lib.options/uuid clause)]
    (if-let [path (find-clause-location definition target-uuid)]
      (case (first path)
        :filters
        ;; Remove the entire instance-filter entry at [:filters idx]
        (let [idx (second path)
              v   (:filters definition)]
          (update definition :filters
                  (fn [v]
                    (into (subvec v 0 idx) (subvec v (inc idx))))))
        :projections
        ;; Remove the dim-ref at [:projections proj-idx :projection dim-idx]
        (let [proj-idx (nth path 1)
              dim-idx  (nth path 3)
              proj-vec (get-in definition [:projections proj-idx :projection])]
          (update-in definition [:projections proj-idx :projection]
                     (fn [v]
                       (into (subvec v 0 dim-idx) (subvec v (inc dim-idx)))))))
      definition)))

(defn swap-clauses
  "Swap two clauses in the definition.
   Finds both clauses by their :lib/uuid and swaps their values at their respective paths.
   Returns the definition unchanged if either clause is not found."
  [definition source-clause target-clause]
  (let [source-uuid (lib.options/uuid source-clause)
        target-uuid (lib.options/uuid target-clause)]
    (if-let [source-path (find-clause-location definition source-uuid)]
      (if-let [target-path (find-clause-location definition target-uuid)]
        (let [source-val (get-in definition source-path)
              target-val (get-in definition target-path)]
          (-> definition
              (assoc-in source-path target-val)
              (assoc-in target-path source-val)))
        definition)
      definition)))
