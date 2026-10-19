(ns metabase-enterprise.dependencies.models.dependency-status
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DependencyStatus [_model] :dependency_status)

(derive :model/DependencyStatus :metabase/model)

(t2/deftransforms :model/DependencyStatus
  {:entity_type mi/transform-keyword})

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

(mu/defn instances-for-dependency-calculation
  "Claim a batch of instances of type `entity-type` and maximum size `batch-size` whose dependencies are stale, were not
  computed yet, or were computed by an older analysis, and return them. Prioritizes stale entities over outdated
  analyses."
  [entity-type :- ::deps.dependency-types/dependency-types
   batch-size  :- ms/PositiveInt]
  (let [ids (dependencies.db/dependency-pending-entity-ids
             entity-type batch-size models.dependency/current-dependency-analysis-version)]
    (when (seq ids)
      (dependencies.db/claim-dependency-statuses! entity-type ids models.dependency/current-dependency-analysis-version)
      (vec (dependencies.db/instances entity-type (set ids))))))

(mu/defn has-pending-entities? :- :boolean
  "Returns true if there are any entities whose dependencies are stale, not computed yet or computed by an older
  analysis, or deleted entities whose status the dependency job has yet to clean up."
  []
  (boolean
   (some (fn [entity-type]
           (or (seq (dependencies.db/dependency-pending-entity-ids
                     entity-type 1 models.dependency/current-dependency-analysis-version))
               (seq (dependencies.db/dependency-deleted-entity-ids entity-type 1))))
         deps.dependency-types/backfillable-dependency-types)))
