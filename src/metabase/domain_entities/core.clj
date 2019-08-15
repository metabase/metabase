(ns metabase.domain-entities.core
  (:require [clojure.string :as str]
            [medley.core :as m]
            [metabase.domain-entities.specs :refer [domain-entity-specs MBQL DomainEntitySpec]]
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
  [entity {:keys [field domain_entity has_many dimension]}]
  (cond
    dimension (some #(isa? (field-type %) dimension) ((some-fn :fields :result_metadata) entity))
    field     (some (comp #{field} :name) ((some-fn :fields :result_metadata) entity))))

(s/defn satisfies-requierments? :- s/Bool
  "Does source entity satisfies requierments of given spec?"
  [entity :- SourceEntity, {:keys [required_attributes]} :- DomainEntitySpec]
  (every? (partial has-attribute? entity) required_attributes))

(def ^:private ^{:arglists '([t])} number-of-ancestors
  (comp count ancestors))

(s/defn ^:private most-specific-domain-entity :- (s/maybe DomainEntitySpec)
  [candidates :- [DomainEntitySpec]]
  (->> candidates
       (sort-by (juxt (comp number-of-ancestors :type) (comp count :required_attributes)))
       last))

(s/defn ^:private instantiate-dimensions
  [bindings :- Bindings, source :- SourceName, entities]
  (into (empty entities) ; this way we don't care if we're dealing with a map or a vec
        (for [entity entities
              :when (every? (get-in bindings [source :dimensions])
                            (mbql.u/match entity [:dimension dimension] dimension))]
          (resolve-dimension-clauses bindings source entity))))

(defn- best-match-for-dimension
  ;; Pick the field most suitable to be a dimension.
  ;;
  ;; This is a rough heuristic relying on:
  ;; 1) how we do type classification (see `metabase.sync.analyze.classifiers.name`), and
  ;; 2) how our type hierarchy works.
  ;;
  ;; The idea is that we want the *least* specific type available. Reason being, more specific
  ;; means more additional meaning which probably diverges from our intention (or the spec is bad
  ;; and should use a more specific type).
  ;;
  ;; If all field types are of the same specificity, the longer names probably have additional
  ;; qualifiers which we don't understan, nor are we interested in.
  ;;
  ;; Eg. if there are fields named `start` and `billing_period_start`,  we probably want the former
  ;; as a match for out `:type/CreationTimestamp`.
  [fields]
  (->> fields
       (sort-by (juxt (comp number-of-ancestors field-type) (comp count :name)))
       first))

(defn- fields->dimensions
  [{:keys [required_attributes optional_attributes]} fields]
  (into {}
        (comp (filter (some-fn :field :dimension))
              (map (fn [{:keys [field dimension]}]
                     (if dimension
                       [(name dimension) (->> fields
                                              (filter #(isa? (field-type %) dimension))
                                              best-match-for-dimension)]
                       ;; We assume names are unique
                       [field (m/find-first (comp #{field} :name) fields)]))))
        (concat required_attributes optional_attributes)))

(defn- instantiate-domain-entity
  [table {:keys [name description metrics segments breakout_dimensions type] :as spec}]
  (let [dimensions (fields->dimensions spec (:fields table))
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
             most-specific-domain-entity
             (instantiate-domain-entity table))))

(defn with-domain-entity
  "Fake hydration function."
  [tables]
  (for [table tables]
    (assoc table :domain_entity (domain-entity-for-table table))))
