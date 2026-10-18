(ns metabase-enterprise.dependencies.models.dependency-status
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DependencyStatus [_model] :dependency_status)

(derive :model/DependencyStatus :metabase/model)

(t2/deftransforms :model/DependencyStatus
  {:entity_type mi/transform-keyword})

(defn mark-stale!
  "Mark the entities in `type->ids`, `{entity-type ids}`, stale for dependency recalculation, creating their statuses
  if they don't exist and clearing a failure so a failed entity is computed again."
  [type->ids]
  (doseq [[entity-type ids] type->ids
          id                ids]
    (dependencies.db/mark-dependency-status-stale! entity-type id)))

(defn upsert-status!
  "Upsert a dependency_status entry, setting stale=false, version to current, and whether the entity names tables that
  match nothing."
  [entity-type entity-id unresolved-tables?]
  (dependencies.db/upsert-dependency-status!
   entity-type entity-id models.dependency/current-dependency-analysis-version unresolved-tables?))

(defmulti hydrate-for-deps
  "Hydrate a batch of instances with data needed for dependency calculation.
  Dispatches on entity-type keyword. Default is identity (no hydration needed)."
  {:arglists '([entity-type instances])}
  (fn [entity-type _instances] entity-type))

(defmethod hydrate-for-deps :default [_ instances] instances)

(defmethod hydrate-for-deps :dashboard [_ instances]
  (t2/hydrate instances [:dashcards :series]))

(defmethod hydrate-for-deps :action [_ instances]
  (let [queries (when (seq instances)
                  (dependencies.db/query-action-queries (mapv :id instances)))]
    (mapv (fn [{:keys [id] :as action}]
            (cond-> action
              (contains? queries id) (assoc :dataset_query (queries id))))
          instances)))

(defn instances-for-dependency-calculation
  "Find a batch of instances of type `entity-type` and maximum size `batch-size` that need
  dependency calculation: no status row yet, stale=true, OR version < current, and not terminal.
  Returns full entity objects. Prioritizes stale over outdated."
  [entity-type batch-size]
  (dependencies.db/instances-for-dependency-calculation entity-type
                                                        batch-size
                                                        models.dependency/current-dependency-analysis-version))

(defn has-stale-or-outdated?
  "Returns true if there are any entities needing dependency calculation: no status row yet,
  stale=true, OR version < current (not terminal), or deleted entities whose status the dependency
  job has yet to clean up. Defined in terms of [[instances-for-dependency-calculation]] so it stays consistent with what
  the dependency job processes."
  []
  (boolean
   (some (fn [entity-type]
           (or (seq (instances-for-dependency-calculation entity-type 1))
               (seq (dependencies.db/deleted-entity-ids entity-type 1))))
         deps.dependency-types/backfillable-dependency-types)))

(defn record-failure!
  "Mark the entity `entity-type` `entity-id` terminal after its dependency calculation failed, so it is not computed
  again until it is marked stale."
  [entity-type entity-id]
  (dependencies.db/mark-dependency-status-terminal! entity-type entity-id))
