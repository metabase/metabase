(ns metabase-enterprise.dependencies.store.database
  "AppDB-backed [[DependencyStore]] and [[DependencyGraph]] via Toucan2 (for runtime)."
  (:require
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.store :as deps.store]
   [metabase.graph.core :as graph.core]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; DatabaseDependencyGraph — live queries against the dependency table
;;; ===========================================================================

(defrecord DatabaseDependencyGraph []
  deps.store/DependencyGraph
  (direct-upstream [_ entity-type entity-id]
    (let [g   (models.dependency/filtered-graph-dependencies nil nil)
          key [entity-type entity-id]]
      (deps.store/nodes->deps-map (get (graph.core/children-of g [key]) key #{}))))

  (direct-downstream [_ entity-type entity-id]
    (let [g   (models.dependency/filtered-graph-dependents nil nil)
          key [entity-type entity-id]]
      (deps.store/nodes->deps-map (get (graph.core/children-of g [key]) key #{}))))

  (transitive-upstream [_ entity-type entity-id]
    (let [g   (models.dependency/filtered-graph-dependencies nil nil)
          key [entity-type entity-id]]
      (deps.store/nodes->deps-map (graph.core/transitive g [key]))))

  (transitive-downstream [_ entity-type entity-id]
    (let [g   (models.dependency/filtered-graph-dependents nil nil)
          key [entity-type entity-id]]
      (deps.store/nodes->deps-map (graph.core/transitive g [key]))))

  (find-cycle [_ entity-type entity-id]
    (let [g   (models.dependency/filtered-graph-dependencies nil nil)
          key [entity-type entity-id]]
      (graph.core/find-cycle g [key]))))

;;; ===========================================================================
;;; DatabaseDependencyStore
;;; ===========================================================================

(defrecord DatabaseDependencyStore []
  deps.store/DependencyStore
  (store-deps! [_ entity-type entity-id deps-by-type]
    (models.dependency/replace-dependencies!
     entity-type entity-id deps-by-type))

  (delete-deps! [_ entity-type entity-id]
    (models.dependency/replace-dependencies!
     entity-type entity-id {}))

  (deps.store/graph [_]
    (->DatabaseDependencyGraph)))

(defn database-dependency-store
  "Create a [[deps.store/DependencyStore]] backed by the AppDB `dependency` table."
  []
  (->DatabaseDependencyStore))
