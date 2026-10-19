(ns metabase-enterprise.dependencies.models.dependency-status
  (:require
   [medley.core :as m]
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

(defn upsert-status!
  "Record that the dependencies of the entity `entity-type` `entity-id` were computed from its `version` by the current
  analysis."
  [entity-type entity-id version]
  (dependencies.db/upsert-dependency-status!
   entity-type entity-id models.dependency/current-dependency-analysis-version version))

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
  "Find a batch of instances of type `entity-type` and maximum size `batch-size` whose dependencies were not computed
  from their current version by the current analysis, as `[instance version]` pairs. Prioritizes changed entities over
  outdated analyses."
  [entity-type batch-size]
  (let [rows      (dependencies.db/dependency-pending-entities entity-type batch-size models.dependency/current-dependency-analysis-version)
        instances (when (seq rows)
                    (m/index-by :id (dependencies.db/instances entity-type (into #{} (map :id) rows))))]
    (into []
          (keep (fn [{:keys [id updated_at]}]
                  (when-let [instance (get instances id)]
                    [instance updated_at])))
          rows)))

(defn has-pending-entities?
  "Returns true if there are any entities whose dependencies were not computed from their current version by the
  current analysis, or deleted entities whose status the dependency job has yet to clean up."
  []
  (boolean
   (some (fn [entity-type]
           (or (seq (dependencies.db/dependency-pending-entities entity-type 1 models.dependency/current-dependency-analysis-version))
               (seq (dependencies.db/dependency-deleted-entity-ids entity-type 1))))
         deps.dependency-types/backfillable-dependency-types)))
