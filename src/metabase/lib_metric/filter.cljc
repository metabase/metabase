(ns metabase.lib-metric.filter
  "Functions for computing filterable dimensions with filter positions."
  (:require
   [metabase.lib-metric.definition :as definition]
   [metabase.lib-metric.dimension :as dimension]
   [metabase.util.performance :as perf]))

(defn leading-dimension-ref
  "Extract the dimension UUID from a filter clause's leading argument.
   Filter clauses look like: [:operator opts [:dimension opts uuid] value ...]
   Compound filters (:and, :or, :not) don't have a leading dimension ref.
   Returns the UUID string or nil."
  [filter-clause]
  (when (and (vector? filter-clause)
             (>= (count filter-clause) 3))
    (let [operator (first filter-clause)
          third    (nth filter-clause 2 nil)]
      (when-not (#{:and :or :not} operator)
        (when (and (vector? third)
                   (= :dimension (first third))
                   (>= (count third) 3))
          (nth third 2))))))

(defn build-filter-positions
  "Build a map of {dimension-id -> [filter-indices]} from a sequence of filters.
   Each dimension ID maps to a vector of zero-based indices where it appears."
  [filters]
  (reduce-kv
   (fn [acc idx filter-clause]
     (if-let [dim-id (leading-dimension-ref filter-clause)]
       (update acc dim-id (fnil conj []) idx)
       acc))
   {}
   (vec filters)))

(defn filterable-dimensions
  "Get dimensions that can be used for filtering, with :filter-positions attached.
   Each dimension will have a :filter-positions key containing a vector of indices
   where that dimension is used in the definition's filters."
  [definition]
  (let [provider    (:metadata-provider definition)
        source-type (get-in definition [:source :type])
        source-id   (get-in definition [:source :id])
        dimensions  (case source-type
                      :source/metric  (dimension/dimensions-for-metric provider source-id)
                      :source/measure (dimension/dimensions-for-measure provider source-id)
                      [])
        filters     (definition/filters definition)
        positions   (build-filter-positions filters)]
    (perf/mapv
     (fn [dim]
       (assoc dim :filter-positions (get positions (:id dim) [])))
     dimensions)))
