(ns metabase-enterprise.dependencies.models.dependency
  (:require
   [clojure.set :as set]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase.graph.core :as graph]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.core :as t2]))

(def current-dependency-analysis-version
  "Current version of the dependency analysis logic.
  This should be incremented when the dependency analysis logic changes."
  3)

(methodical/defmethod t2/table-name :model/Dependency [_model] :dependency)

(derive :model/Dependency :metabase/model)

(t2/deftransforms :model/Dependency
  {:from_entity_type mi/transform-keyword
   :to_entity_type mi/transform-keyword})

(defn- deps-children
  "Get dependency children with optional database-level filtering.

  Returns a map from [src-type src-id] tuples to sets of [dst-type dst-id] tuples representing dependencies.

  When `destination-filter-fn` is provided, it should be a function accepting two arguments
  (entity-type-field, entity-id-field) and returning a HoneySQL WHERE clause for filtering destination entities."
  ([src-type src-id dst-type dst-id key-seq]
   (deps-children src-type src-id dst-type dst-id key-seq nil))
  ([src-type src-id dst-type dst-id key-seq destination-filter-fn]
   (let [base-filter (cond-> [:and]
                       destination-filter-fn (conj (destination-filter-fn dst-type dst-id)))]
     (transduce (map (fn [[entity-type entity-keys]]
                       (let [full-filter (conj base-filter
                                               [:= src-type (name entity-type)]
                                               [:in src-id entity-keys])
                             deps (t2/select :model/Dependency {:where full-filter})]
                         (u/group-by (juxt src-type src-id)
                                     (juxt dst-type dst-id)
                                     conj #{}
                                     deps))))
                merge {}
                (u/group-by first second key-seq)))))

(defn- key-dependents
  "Get the dependent entity keys for the entity keys in `key-seq`.

  Entity keys are [entity-type entity-id] tuples. Returns a map from source entity keys
  to sets of dependent (downstream) entity keys.

  When `destination-filter-fn` is provided, it should be a function accepting two arguments
  (entity-type-field, entity-id-field) and returning a HoneySQL WHERE clause for filtering."
  ([key-seq]
   (key-dependents key-seq nil))
  ([key-seq destination-filter-fn]
   (deps-children :to_entity_type :to_entity_id :from_entity_type :from_entity_id key-seq destination-filter-fn)))

(defn- key-dependencies
  "Get the dependency entity keys for the entity keys in `key-seq`.

  Entity keys are [entity-type entity-id] tuples. Returns a map from source entity keys
  to sets of dependency (upstream) entity keys.

  When `destination-filter-fn` is provided, it should be a function accepting two arguments
  (entity-type-field, entity-id-field) and returning a HoneySQL WHERE clause for filtering."
  ([key-seq]
   (key-dependencies key-seq nil))
  ([key-seq destination-filter-fn]
   (deps-children :from_entity_type :from_entity_id :to_entity_type :to_entity_id key-seq destination-filter-fn)))

(p/deftype+ DependencyGraph [children-fn]
  graph/Graph
  (children-of [_this key-seq]
    (children-fn key-seq)))

(defn graph-dependents
  "Return a dependency graph for finding dependents (downstream entities)."
  []
  (->DependencyGraph key-dependents))

(defn graph-dependencies
  "Return a dependency graph for finding dependencies (upstream entities)."
  []
  (->DependencyGraph key-dependencies))

(defn- filtered-graph
  "Create a dependency graph with database-level filtering.

  Arguments:
  - `key-fn`: Either key-dependencies or key-dependents, determining graph direction
  - `destination-filter-fn`: Function accepting (entity-type-field, entity-id-field)
    and returning a HoneySQL WHERE clause"
  [key-fn destination-filter-fn]
  (->DependencyGraph
   (fn [key-seq]
     (key-fn key-seq destination-filter-fn))))

(defn filtered-graph-dependencies
  "Create a permission-aware dependency graph for finding upstream dependencies.

  Arguments:
  - `destination-filter-fn`: Function accepting (entity-type-field, entity-id-field)
    and returning a HoneySQL WHERE clause for filtering destination entities"
  [destination-filter-fn]
  (filtered-graph key-dependencies destination-filter-fn))

(defn filtered-graph-dependents
  "Create a permission-aware dependency graph for finding downstream dependents.

  Arguments:
  - `destination-filter-fn`: Function accepting (entity-type-field, entity-id-field)
    and returning a HoneySQL WHERE clause for filtering destination entities"
  [destination-filter-fn]
  (filtered-graph key-dependents destination-filter-fn))

(defn entities->nodes
  "Converts a map of entities `{entity-type [{:id 1, ...} ...]}` into a list of nodes `[[entity-type entity-id]]`."
  [entities-map]
  (for [[entity-type entities] entities-map
        entity entities
        :when (:id entity)]
    [entity-type (:id entity)]))

(defn group-nodes
  "Groups a list of nodes `[[entity-type entity-id]]` by their type."
  [nodes]
  (u/group-by first second conj #{} nodes))

(defn transitive-dependents
  "Given a map of entities `{entity-type [{:id 1, ...} ...]}`, return a map of its transitive dependents
  as `{entity-type #{4 5 6}}` - that is, a map from downstream entity type to a set of IDs.

  Uses the provided `graph`, or defaults to the `:model/Dependency` table in AppDB.

  The inputs must be maps containing `:id`; anything without an `:id` is skipped. They could be Toucan entities,
  `MetadataProvider` entities, user input, etc.

  **Excludes** the input entities from the list of dependents!"
  ([entities-map] (transitive-dependents nil entities-map))
  ([graph entities-map]
   (let [graph (or graph (graph-dependents))
         starters (entities->nodes entities-map)]
     (->> (graph/transitive graph starters) ; This returns a flat list.
          group-nodes))))

(mu/defn is-native-entity? :- :boolean
  "Checks whether an entity involves native sql.  `entity` can either be a toucan object or a metadata object."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity]
  (boolean
   (case entity-type
     :card (some-> entity
                   ((some-fn :dataset-query :dataset_query))
                   lib/any-native-stage?)
     :transform (some-> entity
                        :source
                        :query
                        lib/any-native-stage?)
     :snippet true
     false)))

(defn- native-lookup-map [children]
  (let [grouped (-> (graph/all-map-nodes children)
                    group-nodes)]
    (into {}
          (mapcat (fn [[node-type ids]]
                    (let [model (deps.dependency-types/dependency-type->model node-type)]
                      (t2/select-fn-vec (fn [entity]
                                          [[node-type (:id entity)]
                                           (is-native-entity? node-type entity)])
                                        model :id [:in ids]))))
          grouped)))

(defn transitive-mbql-dependents
  "Equivalent to `transitive-dependents`, except it excludes any native cards/transforms/segments and their children.

  Also, the order is more flexible (though consistent between runs).

  Note that this does not check the passed in entities for native-ness -- the filter is only applied to their
  transitive children."
  ([entities-map]
   (transitive-mbql-dependents nil entities-map))
  ([graph entities-map]
   (let [start-nodes (set (entities->nodes entities-map))
         children (graph/transitive-children-of (or graph (graph-dependents)) (seq start-nodes))
         native-lookup (native-lookup-map children)]
     (group-nodes
      (graph/keep-children (fn [node]
                             (cond
                               (start-nodes node) nil
                               (native-lookup node) ::graph/stop
                               :else node))
                           children)))))

(defn replace-dependencies!
  "Replace the dependencies of the entity of type `entity-type` with id `entity-id` with
  the ones specified in `dependencies-by-type`. "
  [entity-type entity-id dependencies-by-type]
  (let [current-dependencies (t2/select [:model/Dependency :id :to_entity_type :to_entity_id]
                                        :from_entity_type entity-type
                                        :from_entity_id entity-id)
        to-remove (keep (fn [{:keys [id to_entity_type to_entity_id]}]
                          (when-not (get-in dependencies-by-type [to_entity_type to_entity_id])
                            id))
                        current-dependencies)
        current-by-type (-> (group-by :to_entity_type current-dependencies)
                            (update-vals #(into #{} (map :to_entity_id) %)))
        to-add (for [[to-entity-type ids] dependencies-by-type
                     to-entity-id (set/difference ids (current-by-type to-entity-type))]
                 {:from_entity_type entity-type
                  :from_entity_id entity-id
                  :to_entity_type to-entity-type
                  :to_entity_id to-entity-id})]
    (t2/with-transaction [_conn]
      (when (seq to-remove)
        (t2/delete! :model/Dependency :id [:in to-remove]))
      (when (seq to-add)
        (t2/insert! :model/Dependency to-add)))))
