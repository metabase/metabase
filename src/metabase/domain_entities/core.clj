(ns metabase.domain-entities.core
  (:require [clojure.string :as str]
            [medley.core :as m]
            [metabase.domain-entities.specs :refer [domain-entity-specs MBQL]]
            [metabase.mbql.util :as mbql.u]
            [metabase.models
             [card :refer [Card]]
             [table :as table :refer [Table]]]
            [metabase.util :as u]
            [schema.core :as s]))

(def ^:private ^{:arglists '([field])} field-type
  "Return the most specific type of a given field."
  (some-fn :special_type :base_type))

(def SourceName
  "A reference to a `SourceEntity`."
  s/Str)

(def ^:private DimensionReference s/Str)

(def DimensionBindings
  "Mapping from dimension name to the corresponding instantiated MBQL snippet"
  {DimensionReference MBQL})

(def SourceEntity
  "A source for a card. Can be either a table or another card."
  (s/cond-pre (type Table) (type Card)))

(def Bindings
  "Top-level lexial context mapping source names to their corresponding entity and constituent dimensions. See also `DimensionBindings`."
  {SourceName {(s/optional-key :entity)     SourceEntity
               (s/required-key :dimensions) DimensionBindings}})

(s/defn ^:private get-dimension-binding :- MBQL
  [bindings :- Bindings, source :- SourceName, dimension-reference :- DimensionReference]
  (let [[table-or-dimension maybe-dimension] (str/split dimension-reference #"\.")]
    (if maybe-dimension
      (cond->> (get-in bindings [table-or-dimension :dimensions maybe-dimension])
        (not= source table-or-dimension) (vector :joined-field table-or-dimension))
      (get-in bindings [source :dimensions table-or-dimension]))))

(s/defn resolve-dimension-clauses
  "Instantiate all dimension reference in given (nested) structure"
  [bindings :- Bindings, source :- SourceName, obj]
  (mbql.u/replace obj
    [:dimension dimension] (->> dimension
                                (get-dimension-binding bindings source)
                                (resolve-dimension-clauses bindings source))))

(s/defn mbql-reference :- MBQL
  "Return MBQL clause for a given field-like object."
  [{:keys [id name base_type]}]
  (if id
    [:field-id id]
    [:field-literal name base_type]))

(defn- has-attribute?
  [entity {:keys [field domain_entity has_many]}]
  (cond
    field (some (fn [col]
                  (when (or (isa? (field-type col) field)
                            (= (:name col) (name field)))
                    col))
                ((some-fn :fields :result_metadata) entity))))

(defn satisfies-requierments?
  "Does source entity satisfies requierments of given spec?"
  [entity {:keys [required_attributes]}]
  (every? (partial has-attribute? entity) required_attributes))

(defn- best-match
  [candidates]
  (->> candidates
       (sort-by (juxt (comp count ancestors :type) (comp count :required_attributes)))
       last))

(defn- instantiate-dimensions
  [bindings source entities]
  (into (empty entities) ; this way we don't care if we're dealing with a map or a vec
        (for [entity entities
              :when (every? (get-in bindings [source :dimensions])
                            (mbql.u/match entity [:dimension dimension] dimension))]
          (resolve-dimension-clauses bindings source entity))))

(defn- instantiate-domain-entity
  [table {:keys [name description required_attributes optional_attributes metrics segments breakout_dimensions type]}]
  (let [dimensions (into {} (for [field (:fields table)]
                              [(-> field field-type clojure.core/name) field]))
        bindings   {name {:entity     table
                          :dimensions (m/map-vals mbql-reference dimensions)}}]
    {:metrics             (instantiate-dimensions bindings name metrics)
     :segments            (instantiate-dimensions bindings name segments)
     :breakout_dimensions (instantiate-dimensions bindings name breakout_dimensions)
     :dimensions          dimensions
     :type                type
     :description         description
     :source_table        (u/get-id table)
     :name                name}))

(defn domain-entity-for-table
  "Find the best fitting domain entity for given table."
  [table]
  (let [table (assoc table :fields (table/fields table))]
    (some->> @domain-entity-specs
             vals
             (filter (partial satisfies-requierments? table))
             best-match
             (instantiate-domain-entity table))))

(defn with-domain-entity
  "Fake hydration function."
  [tables]
  (for [table tables]
    (assoc table :domain_entity (domain-entity-for-table table))))
