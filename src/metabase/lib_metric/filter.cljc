(ns metabase.lib-metric.filter
  "Functions for computing filterable dimensions with filter positions and operators."
  (:require
   [metabase.lib-metric.definition :as definition]
   [metabase.lib-metric.dimension :as dimension]
   [metabase.lib.types.isa :as lib.types.isa]
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

;;; -------------------------------------------------- Filter Operators --------------------------------------------------

(def ^:private default-operators
  "Default operators available for all column types."
  [:is-null :not-null])

(def ^:private string-operators
  "String filter operators. Note: FE uses :is-empty/:not-empty instead of :is-null/:not-null for strings."
  [:is-empty :not-empty := :!= :contains :does-not-contain :starts-with :ends-with])

(def ^:private number-operators
  "Numeric filter operators."
  [:is-null :not-null := :!= :> :>= :< :<= :between])

(def ^:private boolean-operators
  "Boolean filter operators. Note: :!= is not supported."
  [:is-null :not-null :=])

(def ^:private temporal-operators
  "Date/datetime filter operators."
  [:is-null :not-null := :!= :> :< :between])

(def ^:private coordinate-operators
  "Coordinate filter operators. Note: :is-null/:not-null not supported for coordinates."
  [:= :!= :> :>= :< :<= :between :inside])

(def ^:private time-operators
  "Time-only filter operators."
  [:is-null :not-null :> :< :between])

(defn operators-for-dimension
  "Get available filter operators for a dimension based on its type.
   Returns a vector of operator keywords.
   Type checking follows the same hierarchy as metabase.lib, applied to dimension metadata."
  [dimension]
  (cond
    (lib.types.isa/string-or-string-like? dimension) string-operators
    (lib.types.isa/coordinate? dimension)            coordinate-operators
    (lib.types.isa/boolean? dimension)               boolean-operators
    (lib.types.isa/time? dimension)                  time-operators
    (lib.types.isa/temporal? dimension)              temporal-operators
    (lib.types.isa/numeric? dimension)               number-operators
    :else                                            default-operators))

(defn filterable-dimension-operators
  "Get available filter operators for a dimension.
   Returns a vector of operator keywords directly (e.g., [:= :!= :contains ...]).
   Unlike metabase.lib which wraps operators in maps, this returns simple keywords."
  [dimension]
  (operators-for-dimension dimension))

;;; -------------------------------------------------- Filterable Dimensions --------------------------------------------------

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
       (assoc dim
              :filter-positions (get positions (:id dim) [])
              :operators (operators-for-dimension dim)))
     dimensions)))

;;; -------------------------------------------------- Add Filter --------------------------------------------------

(defn add-filter
  "Add a filter clause to a metric definition.
   Returns a new definition with the filter added to the :filters vector."
  [definition filter-clause]
  (update definition :filters (fnil conj []) filter-clause))
