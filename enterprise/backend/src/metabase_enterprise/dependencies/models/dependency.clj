(ns metabase-enterprise.dependencies.models.dependency
  (:require
   [clojure.set :as set]
   [metabase-enterprise.dependencies.db :as dependencies.db]
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
  6)

(methodical/defmethod t2/table-name :model/Dependency [_model] :dependency)

(derive :model/Dependency :metabase/model)

(t2/deftransforms :model/Dependency
  {:from_entity_type mi/transform-keyword
   :to_entity_type mi/transform-keyword})

(defn- deps-children
  "Get dependency children with optional visibility filtering.

  Returns a map from [src-type src-id] tuples to sets of [dst-type dst-id] tuples representing dependencies.

  `destination-filter` and `source-filter` are filter specs (see `metabase-enterprise.dependencies.db`'s
  `edge-restriction-expr`: nil, `{:visible {...}}`, `{:broken? true}`, `{:types #{...}}`, or
  `{:entity-type ... :ids #{...}}`) restricting the destination (child) and source (parent) side of each edge,
  respectively."
  ([{:keys [src-type src-id dst-type dst-id key-seq destination-filter source-filter]}]
   (transduce (map (fn [[entity-type entity-keys]]
                     (let [deps (dependencies.db/dependency-edges
                                 {:src-type src-type :src-id src-id :dst-type dst-type :dst-id dst-id
                                  :entity-type entity-type :entity-ids entity-keys
                                  :destination-restriction destination-filter :source-restriction source-filter})]
                       (u/group-by (juxt src-type src-id)
                                   (juxt dst-type dst-id)
                                   conj #{}
                                   deps))))
              merge {}
              (u/group-by first second key-seq))))

(defn- key-dependents
  "Get the dependent entity keys for the entity keys in `key-seq`.

  Entity keys are [entity-type entity-id] tuples. Returns a map from source entity keys
  to sets of dependent (downstream) entity keys.

  `destination-filter` and `source-filter` are filter specs restricting the dependent (child) and queried (parent)
  side of each edge, respectively — see [[deps-children]]."
  ([key-seq]
   (key-dependents key-seq nil nil))
  ([key-seq destination-filter source-filter]
   (deps-children
    {:src-type            :to_entity_type
     :src-id              :to_entity_id
     :dst-type            :from_entity_type
     :dst-id              :from_entity_id
     :key-seq             key-seq
     :destination-filter  destination-filter
     :source-filter       source-filter})))

(defn direct-dependents
  "Returns the direct dependents for the given entity key sequence."
  [key-seq]
  (key-dependents key-seq))

(defn- key-dependencies
  "Get the dependency entity keys for the entity keys in `key-seq`.

  Entity keys are [entity-type entity-id] tuples. Returns a map from source entity keys
  to sets of dependency (upstream) entity keys.

  `destination-filter` and `source-filter` are filter specs restricting the dependency (child) and queried (parent)
  side of each edge, respectively — see [[deps-children]]."
  ([key-seq]
   (key-dependencies key-seq nil nil))
  ([key-seq destination-filter source-filter]
   (deps-children
    {:src-type            :from_entity_type
     :src-id              :from_entity_id
     :dst-type            :to_entity_type
     :dst-id              :to_entity_id
     :key-seq             key-seq
     :destination-filter  destination-filter
     :source-filter       source-filter})))

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
  "Create a dependency graph with visibility filtering.

  Arguments:
  - `key-fn`: Either key-dependencies or key-dependents, determining graph direction
  - `destination-filter`: Filter spec restricting the child side of a dependency — see [[deps-children]]
  - `source-filter`: Filter spec restricting the parent side of a dependency"
  [key-fn destination-filter source-filter]
  (->DependencyGraph
   (fn [key-seq]
     (key-fn key-seq destination-filter source-filter))))

(defn filtered-graph-dependencies
  "Create a permission-aware dependency graph for finding upstream dependencies.

  Arguments:
  - `destination-filter`: Filter spec restricting destination entities — see [[deps-children]]
  - `source-filter`: Optional filter spec restricting the parent side of a dependency"
  ([destination-filter]
   (filtered-graph-dependencies destination-filter nil))
  ([destination-filter source-filter]
   (filtered-graph key-dependencies destination-filter source-filter)))

(defn filtered-graph-dependents
  "Create a permission-aware dependency graph for finding downstream dependents.

  Arguments:
  - `destination-filter`: Filter spec restricting destination entities — see [[deps-children]]
  - `source-filter`: Optional filter spec restricting the parent side of a dependency"
  ([destination-filter]
   (filtered-graph-dependents destination-filter nil))
  ([destination-filter source-filter]
   (filtered-graph key-dependents destination-filter source-filter)))

(defn entities->nodes
  "Converts a map of entities `{entity-type [{:id 1, ...} ...]}` or entity IDs `{entity-type [1]}` into a list of nodes
  `[[entity-type entity-id]]`."
  [entities-map]
  (for [[entity-type entities] entities-map
        entity entities
        :let [id (if (number? entity)
                   entity
                   (:id entity))]
        :when id]
    [entity-type id]))

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
                    (mapv (fn [entity]
                            [[node-type (:id entity)]
                             (is-native-entity? node-type entity)])
                          (dependencies.db/instances node-type ids))))
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

(defn- ensure-entity-id
  [id]
  (when-not (pos-int? id)
    (throw (ex-info "Dependency entity id must be a positive integer"
                    {:status-code 400, :id id})))
  id)

(defn replace-dependencies!
  "Replace the dependencies of the entity of type `entity-type` with id `entity-id` with
  the ones specified in `dependencies-by-type`. "
  [entity-type entity-id dependencies-by-type]
  (let [current-dependencies (dependencies.db/dependencies-from entity-type entity-id)
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
                  :to_entity_id (ensure-entity-id to-entity-id)})]
    (t2/with-transaction [_conn]
      (when (seq to-remove)
        (dependencies.db/delete-dependencies! to-remove))
      (when (seq to-add)
        (dependencies.db/insert-dependencies! to-add)))))

(defn swap-dependency!
  "Efficiently swap a dependency from old-source to new-source during replacement operations.
  This is more efficient than full dependency analysis since we know exactly what changed.

  If the new dependency already exists, we just delete the old one (to avoid duplicate key violation).  If the old
  dependency doesn't exist, this is a no-op.

  Parameters:
  - entity-type: The type of the entity whose dependency is changing (e.g., :card)
  - entity-id: The ID of the entity
  - old-source: The source being replaced, as [source-type source-id] (e.g., [:card 783])
  - new-source: The new source, as [source-type source-id] (e.g., [:table 164])"
  [entity-type entity-id [old-source-type old-source-id] [new-source-type new-source-id]]
  (let [already-present? (dependencies.db/dependency-exists? entity-type entity-id new-source-type new-source-id)]
    (if already-present?
      (dependencies.db/delete-dependency! entity-type entity-id old-source-type old-source-id)
      (dependencies.db/retarget-dependency! entity-type entity-id
                                            old-source-type old-source-id
                                            new-source-type new-source-id))))
