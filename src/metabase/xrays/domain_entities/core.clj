(ns metabase.xrays.domain-entities.core
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.card :refer [Card]]
   [metabase.models.table :as table :refer [Table]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.domain-entities.specs :refer [domain-entity-specs MBQL]]
   [toucan2.core :as t2]))

(def ^:private ^{:arglists '([field])} field-type
  "Return the most specific type of a given field."
  (some-fn :semantic_type :base_type))

(def SourceName
  "A reference to a `SourceEntity`."
  :string)

(def ^:private DimensionReference :string)

(def DimensionBindings
  "Mapping from dimension name to the corresponding instantiated MBQL snippet"
  [:map-of DimensionReference MBQL])

(def SourceEntity
  "A source for a card. Can be either a table or another card."
  [:or (ms/InstanceOf Table) (ms/InstanceOf Card)])

(def Bindings
  "Top-level lexical context mapping source names to their corresponding entity and constituent dimensions. See also
  `DimensionBindings`."
  [:map-of
   SourceName
   [:map
    [:dimensions DimensionBindings]
    [:entity {:optional true} SourceEntity]]])

(mu/defn ^:private get-dimension-binding :- MBQL
  [bindings            :- Bindings
   source              :- SourceName
   dimension-reference :- DimensionReference]
  (let [[table-or-dimension maybe-dimension] (str/split dimension-reference #"\.")]
    (if maybe-dimension
      (let [field-clause (get-in bindings [table-or-dimension :dimensions maybe-dimension])]
        (cond-> field-clause
          (not= source table-or-dimension) (mbql.u/assoc-field-options :join-alias table-or-dimension)))
      (get-in bindings [source :dimensions table-or-dimension]))))

(mu/defn resolve-dimension-clauses
  "Instantiate all dimension reference in given (nested) structure"
  [bindings :- Bindings
   source   :- SourceName
   obj]
  (lib.util.match/replace obj
    [:dimension dimension] (->> dimension
                                (get-dimension-binding bindings source)
                                (resolve-dimension-clauses bindings source))))

(mu/defn mbql-reference :- MBQL
  "Return MBQL clause for a given field-like object."
  [{:keys [id name base_type]}]
  (if id
    [:field id nil]
    [:field name {:base-type base_type}]))

(defn- has-attribute?
  [entity {:keys [field _domain_entity _has_many]}]
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
                            (lib.util.match/match entity [:dimension dimension] dimension))]
          (resolve-dimension-clauses bindings source entity))))

(defn- instantiate-domain-entity
  [table {:keys [name description metrics segments breakout_dimensions type]}]
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
     :source_table        (u/the-id table)
     :name                name}))

(defn domain-entity-for-table
  "Find the best fitting domain entity for given table."
  [table]
  (let [table (t2/hydrate table :fields)]
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
