(ns metabase-enterprise.dependencies.models.dependency
  (:require
   [clojure.set :as set]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.schema :as dependencies.schema]
   [metabase-enterprise.sandbox.schema]
   [metabase.actions.schema :as actions.schema]
   [metabase.documents.schema :as documents.schema]
   [metabase.graph.core :as graph]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.measures.schema]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.segments.schema]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.core :as t2]))

(def current-dependency-analysis-version
  "Current version of the dependency analysis logic.
  This should be incremented when the dependency analysis logic changes.

  Version history:
  - 1: Initial version
  - 2: Added implicitly joined tables
  - 3: Added segments
  - 4: Tracked unreferenced and broken entities
  - 5: Added the source tables of Python transforms
  - 6: Enabled native entity validation
  - 7: Native queries depend on the cards they reference but no longer on those cards' tables, and record whether
       they name tables that match nothing"
  7)

(methodical/defmethod t2/table-name :model/Dependency [_model] :dependency)

(derive :model/Dependency :metabase/model)

(t2/deftransforms :model/Dependency
  {:from_entity_type mi/transform-keyword
   :to_entity_type mi/transform-keyword})

(mr/def ::entity-with-id
  "Any map with an optional `:id`, whatever else it holds."
  [:map {::mr/deliberately-open true, :description "a Toucan, metadata, or user-supplied entity"}
   [:id {:optional true} [:maybe ::deps.dependency-types/entity-id]]])

(def ^:private EntitiesMap
  "Entities as `{entity-type [entity-or-id]}`, nil for none of a type: each one an entity ID, or a map whose `:id` is
  one (skipped when nil), such as a Toucan entity, a `MetadataProvider` entity, or user input."
  [:map-of
   ::deps.dependency-types/dependency-types
   [:maybe
    [:or
     [:sequential [:or ::deps.dependency-types/entity-id ::entity-with-id]]
     [:set [:or ::deps.dependency-types/entity-id ::entity-with-id]]]]])

(def ^:private UncheckedEntityId
  "A dependency entity ID as a caller gives it, which [[ensure-entity-id]] checks."
  [:schema {::mr/deliberately-open true, :description "an unchecked dependency entity id"} :any])

(def ^:private DependenciesByType
  "The dependencies of an entity as `{entity-type #{entity-id}}`, with the IDs not yet checked."
  [:map-of ::dependencies.schema/entity-type [:set UncheckedEntityId]])

(def ^:private KeyFn
  "[[key-dependents]] or [[key-dependencies]], called with nodes and the two edge restrictions."
  [:-> [:sequential ::dependencies.schema/node] ::dependencies.schema/edge-restriction ::dependencies.schema/edge-restriction
   ::dependencies.schema/child-map])

(mu/defn- deps-children :- ::dependencies.schema/child-map
  "Get dependency children with optional visibility filtering.

  Returns a map from [src-type src-id] tuples to sets of [dst-type dst-id] tuples representing dependencies.

  `destination-filter` and `source-filter` are filter specs (see `metabase-enterprise.dependencies.db`'s
  `edge-restriction-expr`: nil, `{:visible {...}}`, `{:broken? true}`, `{:types #{...}}`, or
  `{:entity-type ... :ids #{...}}`) restricting the destination (child) and source (parent) side of each edge,
  respectively."
  [{:keys [src-type src-id dst-type dst-id key-seq destination-filter source-filter]}
   :- [:map {:closed true}
       [:src-type           [:enum :from_entity_type :to_entity_type]]
       [:src-id             [:enum :from_entity_id :to_entity_id]]
       [:dst-type           [:enum :from_entity_type :to_entity_type]]
       [:dst-id             [:enum :from_entity_id :to_entity_id]]
       [:key-seq            [:sequential ::dependencies.schema/node]]
       [:destination-filter ::dependencies.schema/edge-restriction]
       [:source-filter      ::dependencies.schema/edge-restriction]]]
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
             (u/group-by first second key-seq)))

(mu/defn- key-dependents :- ::dependencies.schema/child-map
  "Get the dependent entity keys for the entity keys in `key-seq`.

  Entity keys are [entity-type entity-id] tuples. Returns a map from source entity keys
  to sets of dependent (downstream) entity keys.

  `destination-filter` and `source-filter` are filter specs restricting the dependent (child) and queried (parent)
  side of each edge, respectively — see [[deps-children]]."
  ([key-seq :- [:sequential ::dependencies.schema/node]]
   (key-dependents key-seq nil nil))
  ([key-seq            :- [:sequential ::dependencies.schema/node]
    destination-filter :- ::dependencies.schema/edge-restriction
    source-filter      :- ::dependencies.schema/edge-restriction]
   (deps-children
    {:src-type            :to_entity_type
     :src-id              :to_entity_id
     :dst-type            :from_entity_type
     :dst-id              :from_entity_id
     :key-seq             key-seq
     :destination-filter  destination-filter
     :source-filter       source-filter})))

(mu/defn direct-dependents :- ::dependencies.schema/child-map
  "Returns the direct dependents for the given entity key sequence."
  [key-seq :- [:sequential ::dependencies.schema/node]]
  (key-dependents key-seq))

(mu/defn- key-dependencies :- ::dependencies.schema/child-map
  "Get the dependency entity keys for the entity keys in `key-seq`.

  Entity keys are [entity-type entity-id] tuples. Returns a map from source entity keys
  to sets of dependency (upstream) entity keys.

  `destination-filter` and `source-filter` are filter specs restricting the dependency (child) and queried (parent)
  side of each edge, respectively — see [[deps-children]]."
  ([key-seq :- [:sequential ::dependencies.schema/node]]
   (key-dependencies key-seq nil nil))
  ([key-seq            :- [:sequential ::dependencies.schema/node]
    destination-filter :- ::dependencies.schema/edge-restriction
    source-filter      :- ::dependencies.schema/edge-restriction]
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
    (children-fn (vec key-seq))))

(mu/defn graph-dependents :- ::graph/graph
  "Return a dependency graph for finding dependents (downstream entities)."
  []
  (->DependencyGraph key-dependents))

(mu/defn graph-dependencies :- ::graph/graph
  "Return a dependency graph for finding dependencies (upstream entities)."
  []
  (->DependencyGraph key-dependencies))

(mu/defn- filtered-graph :- ::graph/graph
  "Create a dependency graph with visibility filtering.

  Arguments:
  - `key-fn`: Either key-dependencies or key-dependents, determining graph direction
  - `destination-filter`: Filter spec restricting the child side of a dependency — see [[deps-children]]
  - `source-filter`: Filter spec restricting the parent side of a dependency"
  [key-fn             :- KeyFn
   destination-filter :- ::dependencies.schema/edge-restriction
   source-filter      :- ::dependencies.schema/edge-restriction]
  (->DependencyGraph
   (fn [key-seq]
     (key-fn key-seq destination-filter source-filter))))

(mu/defn filtered-graph-dependencies :- ::graph/graph
  "Create a permission-aware dependency graph for finding upstream dependencies.

  Arguments:
  - `destination-filter`: Filter spec restricting destination entities — see [[deps-children]]
  - `source-filter`: Optional filter spec restricting the parent side of a dependency"
  ([destination-filter :- ::dependencies.schema/edge-restriction]
   (filtered-graph-dependencies destination-filter nil))
  ([destination-filter :- ::dependencies.schema/edge-restriction
    source-filter      :- ::dependencies.schema/edge-restriction]
   (filtered-graph key-dependencies destination-filter source-filter)))

(mu/defn filtered-graph-dependents :- ::graph/graph
  "Create a permission-aware dependency graph for finding downstream dependents.

  Arguments:
  - `destination-filter`: Filter spec restricting destination entities — see [[deps-children]]
  - `source-filter`: Optional filter spec restricting the parent side of a dependency"
  ([destination-filter :- ::dependencies.schema/edge-restriction]
   (filtered-graph-dependents destination-filter nil))
  ([destination-filter :- ::dependencies.schema/edge-restriction
    source-filter      :- ::dependencies.schema/edge-restriction]
   (filtered-graph key-dependents destination-filter source-filter)))

(mu/defn entities->nodes :- [:sequential ::dependencies.schema/node]
  "Converts a map of entities `{entity-type [{:id 1, ...} ...]}` or entity IDs `{entity-type [1]}` into a list of nodes
  `[[entity-type entity-id]]`."
  [entities-map :- EntitiesMap]
  (for [[entity-type entities] entities-map
        entity entities
        :let [id (if (number? entity)
                   entity
                   (:id entity))]
        :when id]
    [entity-type id]))

(mu/defn group-nodes :- ::dependencies.schema/type->ids
  "Groups a list of nodes `[[entity-type entity-id]]` by their type."
  [nodes :- [:sequential ::dependencies.schema/node]]
  (u/group-by first second conj #{} nodes))

(mu/defn transitive-dependents :- ::dependencies.schema/type->ids
  "Given a map of entities `{entity-type [{:id 1, ...} ...]}`, return a map of its transitive dependents
  as `{entity-type #{4 5 6}}` - that is, a map from downstream entity type to a set of IDs.

  Uses the provided `graph`, or defaults to the `:model/Dependency` table in AppDB.

  The inputs must be maps containing `:id`; anything without an `:id` is skipped. They could be Toucan entities,
  `MetadataProvider` entities, user input, etc.

  **Excludes** the input entities from the list of dependents!"
  ([entities-map :- EntitiesMap]
   (transitive-dependents nil entities-map))
  ([graph        :- [:maybe ::graph/graph]
    entities-map :- EntitiesMap]
   (let [graph (or graph (graph-dependents))
         starters (entities->nodes entities-map)]
     (->> (graph/transitive graph starters) ; This returns a flat list.
          group-nodes))))

(mu/defn is-native-entity? :- :boolean
  "Checks whether an entity involves native sql.  `entity` can either be a toucan object or a metadata object."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity      :- [:multi {:dispatch (fn [x] (if (:lib/type x) :lib-metadata :row))}
                   [:lib-metadata [:multi {:dispatch :lib/type}
                                   [:metadata/card                 ::lib.schema.metadata/card]
                                   [:metadata/transform            ::lib.schema.metadata/transform]
                                   [:metadata/native-query-snippet ::lib.schema.metadata/native-query-snippet]
                                   [:metadata/table                ::lib.schema.metadata/table]]]
                   [:row [:or
                          ::queries.schema/card
                          :metabase.warehouse-schema.schema/table
                          :metabase.native-query-snippets.schema/native-query-snippet
                          ::transforms.schema/transform
                          :metabase.dashboards.schema/dashboard
                          ::documents.schema/document
                          :metabase-enterprise.sandbox.schema/sandbox
                          :metabase.segments.schema/segment
                          :metabase.measures.schema/measure
                          ::actions.schema/action]]]]
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
     :action (= :query (:type entity))
     false)))

(mu/defn- native-lookup-map :- [:map-of ::dependencies.schema/node :boolean]
  "Whether each node in `children` is native."
  [children :- ::dependencies.schema/child-map]
  (let [grouped (-> (graph/all-map-nodes children)
                    group-nodes)]
    (into {}
          (mapcat (fn [[node-type ids]]
                    (if (= node-type :card)
                      (let [native (dependencies.db/native-card-ids ids)]
                        (map (fn [id] [[:card id] (contains? native id)]) ids))
                      (mapv (fn [entity]
                              [[node-type (:id entity)]
                               (is-native-entity? node-type entity)])
                            (dependencies.db/entities node-type ids)))))
          grouped)))

(mu/defn transitive-mbql-dependents :- ::dependencies.schema/type->ids
  "Equivalent to `transitive-dependents`, except it excludes any native cards/transforms/segments and their children.

  Also, the order is more flexible (though consistent between runs).

  Note that this does not check the passed in entities for native-ness -- the filter is only applied to their
  transitive children."
  ([entities-map :- EntitiesMap]
   (transitive-mbql-dependents nil entities-map))
  ([graph        :- [:maybe ::graph/graph]
    entities-map :- EntitiesMap]
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

(mu/defn- ensure-entity-id :- ::deps.dependency-types/entity-id
  "`id`, throwing a 400 when it is not a positive integer."
  [id :- UncheckedEntityId]
  (when-not (pos-int? id)
    (throw (ex-info "Dependency entity id must be a positive integer"
                    {:status-code 400, :id id})))
  id)

(mu/defn new-dependencies :- [:sequential [:tuple ::dependencies.schema/entity-type ::deps.dependency-types/entity-id]]
  "The dependencies in `dependencies-by-type` that the entity of type `entity-type` with id `entity-id` doesn't have
  yet, as `[[entity-type entity-id]]`."
  [entity-type          :- ::dependencies.schema/entity-type
   entity-id            :- ms/PositiveInt
   dependencies-by-type :- DependenciesByType]
  (let [current (into #{}
                      (map (juxt :to_entity_type :to_entity_id))
                      (dependencies.db/dependencies-from entity-type entity-id))]
    (vec (for [[to-entity-type ids] dependencies-by-type
               to-entity-id         ids
               :let                 [node [to-entity-type (ensure-entity-id to-entity-id)]]
               :when                (not (current node))]
           node))))

(mu/defn replace-dependencies! :- [:maybe :int]
  "Replace the dependencies of the entity of type `entity-type` with id `entity-id` with the ones specified in
  `dependencies-by-type`, returning the number inserted, or nil when none are."
  [entity-type          :- ::dependencies.schema/entity-type
   entity-id            :- ms/PositiveInt
   dependencies-by-type :- DependenciesByType]
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

(mu/defn swap-dependency! :- :int
  "Efficiently swap a dependency from old-source to new-source during replacement operations.
  This is more efficient than full dependency analysis since we know exactly what changed.

  If the new dependency already exists, we just delete the old one (to avoid duplicate key violation).  If the old
  dependency doesn't exist, this is a no-op.

  Parameters:
  - entity-type: The type of the entity whose dependency is changing (e.g., :card)
  - entity-id: The ID of the entity
  - old-source: The source being replaced, as [source-type source-id] (e.g., [:card 783])
  - new-source: The new source, as [source-type source-id] (e.g., [:table 164])"
  [entity-type                     :- ::dependencies.schema/entity-type
   entity-id                       :- ms/PositiveInt
   [old-source-type old-source-id] :- [:tuple ::dependencies.schema/entity-type ms/PositiveInt]
   [new-source-type new-source-id] :- [:tuple ::dependencies.schema/entity-type ms/PositiveInt]]
  (let [already-present? (dependencies.db/dependency-exists? entity-type entity-id new-source-type new-source-id)]
    (if already-present?
      (dependencies.db/delete-dependency! entity-type entity-id old-source-type old-source-id)
      (dependencies.db/retarget-dependency! entity-type entity-id
                                            old-source-type old-source-id
                                            new-source-type new-source-id))))
