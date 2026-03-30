(ns metabase-enterprise.dependencies.models.dependency-status
  (:require
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DependencyStatus [_model] :dependency_status)

(derive :model/DependencyStatus :metabase/model)

(t2/deftransforms :model/DependencyStatus
  {:entity_type mi/transform-keyword})

(defn mark-stale!
  "Mark entities of `entity-type` with ids in `entity-ids` as stale for dependency recalculation.
  Creates entries if they don't exist, or sets stale=true if they do.
  Uses [[app-db/update-or-insert!]] for cross-database atomicity."
  [entity-type entity-ids]
  (doseq [id entity-ids]
    (app-db/update-or-insert!
     :model/DependencyStatus
     {:entity_type entity-type :entity_id id}
     (fn [existing]
       (if existing
         {:stale true}
         {:stale true
          :dependency_analysis_version 0})))))

(defn upsert-status!
  "Upsert a dependency_status entry, setting stale=false and version to current.
  Uses [[app-db/update-or-insert!]] for cross-database atomicity."
  [entity-type entity-id]
  (app-db/update-or-insert!
   :model/DependencyStatus
   {:entity_type entity-type :entity_id entity-id}
   (fn [_existing]
     {:dependency_analysis_version models.dependency/current-dependency-analysis-version
      :stale false})))

(defmulti hydrate-for-deps
  "Hydrate a batch of instances with data needed for dependency calculation.
  Dispatches on entity-type keyword. Default is identity (no hydration needed)."
  {:arglists '([entity-type instances])}
  (fn [entity-type _instances] entity-type))

(defmethod hydrate-for-deps :default [_ instances] instances)

(defmethod hydrate-for-deps :dashboard [_ instances]
  (t2/hydrate instances [:dashcards :series]))

(defn instances-for-dependency-calculation
  "Find a batch of instances of type `entity-type` and maximum size `batch-size` that need
  dependency calculation: stale=true OR version < current.
  Only processes entities that have a dependency_status entry.
  Returns full entity objects, hydrated for dependency calculation.
  Prioritizes stale over outdated."
  [entity-type batch-size]
  (let [model (deps.dependency-types/dependency-type->model entity-type)
        table-name (t2/table-name model)
        id-field (keyword (name table-name) "id")
        table-wildcard (keyword (name table-name) "*")]
    (t2/select model
               {:select [table-wildcard]
                :from table-name
                :inner-join [:dependency_status [:and
                                                 [:= :dependency_status.entity_id id-field]
                                                 [:= :dependency_status.entity_type (name entity-type)]]]
                :where [:or
                        [:= :dependency_status.stale true]
                        [:< :dependency_status.dependency_analysis_version
                         models.dependency/current-dependency-analysis-version]]
                :order-by [[[:case [:= :dependency_status.stale true] [:inline 0] :else [:inline 1]]]]
                :limit batch-size})))
