(ns metabase.xrays.domain-entities.core
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   ;; legacy usage, do not use legacy MBQL stuff in new code.
   ^{:clj-kondo/ignore [:deprecated-namespace :discouraged-namespace]} [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.domain-entities.specs :as domain-entities.specs :refer [*domain-entity-specs* MBQL]]
   [toucan2.core :as t2]))

(mu/defn field-type :- [:or
                        ::lib.schema.common/base-type
                        ::lib.schema.common/semantic-or-relation-type]
  "Return the most specific type of a given field."
  [field :- [:map
             [:base_type ::lib.schema.common/base-type]]]
  ((some-fn :semantic_type :base_type) field))

(def SourceName
  "A reference to a `SourceEntity`."
  :string)

(def ^:private DimensionReference :string)

(def DimensionBindings
  "Mapping from dimension name to the corresponding instantiated MBQL snippet"
  [:map-of DimensionReference MBQL])

(def SourceEntity
  "A source for a card. Can be either a table or another card."
  (ms/InstanceOf #{:model/Table :model/Card}))

(def Bindings
  "Top-level lexical context mapping source names to their corresponding entity and constituent dimensions. See also
  `DimensionBindings`."
  [:map-of
   SourceName
   [:map
    [:dimensions DimensionBindings]
    [:entity {:optional true} SourceEntity]]])

(mu/defn- get-dimension-binding :- MBQL
  [bindings            :- Bindings
   source              :- SourceName
   dimension-reference :- DimensionReference]
  (let [[table-or-dimension maybe-dimension] (str/split dimension-reference #"\.")]
    (if maybe-dimension
      (let [field-clause (get-in bindings [table-or-dimension :dimensions maybe-dimension])]
        ;; legacy usage, do not use legacy MBQL stuff in new code.
        #_{:clj-kondo/ignore [:deprecated-var]}
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
  [{:keys [id name base_type]} :- [:map
                                   [:base_type ::lib.schema.common/base-type]]]
  (if id
    [:field id nil]
    [:field name {:base-type base_type}]))

(mu/defn- has-attribute?
  [entity          :- SourceEntity
   {:keys [field]} :- ::domain-entities.specs/attribute]
  (cond
    field (some (fn [col]
                  (when (or (isa? (field-type col) field)
                            (= (:name col) (name field)))
                    col))
                ((some-fn :fields :result_metadata) entity))))

(mu/defn satisfies-requirements?
  "Does source entity satisfies requirements of given spec?"
  [entity                         :- [:or SourceEntity]
   {:keys [required_attributes]} :- domain-entities.specs/DomainEntitySpec]
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
                            (lib.util.match/match-many entity [:dimension dimension] dimension))]
          (resolve-dimension-clauses bindings source entity))))

(mu/defn- instantiate-domain-entity :- ::domain-entities.specs/instantiated-domain-entity
  [table                                                                :- (ms/InstanceOf :model/Table)
   {:keys [name description metrics segments breakout_dimensions type]} :- domain-entities.specs/DomainEntitySpec]
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

(mu/defn domain-entity-for-table :- [:maybe ::domain-entities.specs/instantiated-domain-entity]
  "Find the best fitting domain entity for given table."
  [table :- (ms/InstanceOf :model/Table)]
  (let [table (t2/hydrate table :fields)]
    (some->> @*domain-entity-specs*
             vals
             (filter (partial satisfies-requirements? table))
             best-match
             (instantiate-domain-entity table))))

(defn with-domain-entity
  "Fake hydration function."
  [tables]
  (for [table tables]
    ;; TODO (Cam 9/29/25) -- this key is only used in Clojure-land, there's no reason we should use snake-case for it
    (assoc table :domain_entity (domain-entity-for-table table))))
