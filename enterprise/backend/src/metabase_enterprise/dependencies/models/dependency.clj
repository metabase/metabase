(ns metabase-enterprise.dependencies.models.dependency
  (:require
   [clojure.set :as set]
   [metabase.graph.core :as graph]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.core :as t2]))

(def current-dependency-analysis-version
  "Current version of the dependency analysis logic.
  This should be incremented when the dependency analysis logic changes."
  1)

(methodical/defmethod t2/table-name :model/Dependency [_model] :dependency)

(derive :model/Dependency :metabase/model)

(t2/deftransforms :model/Dependency
  {:from_entity_type mi/transform-keyword
   :to_entity_type   mi/transform-keyword})

(defn- deps-children [src-type src-id dst-type dst-id key-seq]
  ;; Group all keys with the same type together, so we make O(types) indexed [[t2/select]] calls, not O(n).
  (transduce (map (fn [[entity-type entity-keys]]
                    (let [deps (t2/select :model/Dependency
                                          src-type entity-type
                                          src-id   [:in entity-keys])]
                      (u/group-by (juxt src-type src-id)
                                  (juxt dst-type dst-id)
                                  conj #{}
                                  deps))))
             merge {}
             (u/group-by first second key-seq)))

(defn- key-dependents
  "Get the dependent entity keys for the entity keys in `entity-keys`.
  Entity keys are [entity-type, entity-id] pairs. See [[entity-type->model]]."
  [key-seq]
  (deps-children :to_entity_type :to_entity_id :from_entity_type :from_entity_id key-seq))

(p/deftype+ DependencyGraph [children-fn]
  graph/Graph
  (children-of [_this key-seq]
    (children-fn key-seq)))

;; NOTE: We can easily construct a graph of upstream dependencies too, if it's useful.
(defn- graph-dependents []
  (->DependencyGraph key-dependents))

(defn transitive-dependents
  "Given a map of updated entities `{entity-type [{:id 1, ...} ...]}`, return a map of its transitive dependents
  as `{entity-type #{4 5 6}}` - that is, a map from downstream entity type to a set of IDs.

  Uses the provided `graph`, or defaults to the `:model/Dependency` table in AppDB.

  The inputs must be maps containing `:id`; anything without an `:id` is skipped. They could be Toucan entities,
  `MetadataProvider` entities, user input, etc.

  **Excludes** the input entities from the list of dependents!"
  ([updated-entities] (transitive-dependents nil updated-entities))
  ([graph updated-entities]
   (let [graph    (or graph (graph-dependents))
         starters (for [[entity-type updates] updated-entities
                        entity                updates
                        :when (:id entity)]
                    [entity-type (:id entity)])]
     (->> (graph/transitive graph starters) ; This returns a flat list.
          (u/group-by first second conj #{})))))

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
                  :from_entity_id   entity-id
                  :to_entity_type   to-entity-type
                  :to_entity_id     to-entity-id})]
    (t2/with-transaction [_conn]
      (when (seq to-remove)
        (t2/delete! :model/Dependency :id [:in to-remove]))
      (when (seq to-add)
        (t2/insert! :model/Dependency to-add)))))
