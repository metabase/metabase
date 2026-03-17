(ns metabase-enterprise.dependencies.models.dependency-status
  (:require
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DependencyStatus [_model] :dependency_status)

(derive :model/DependencyStatus :metabase/model)

(t2/deftransforms :model/DependencyStatus
  {:entity_type mi/transform-keyword})

(def ^:private mark-stale-batch-size
  "Maximum number of entity IDs to process in a single query to avoid parameter limits."
  1000)

(defn mark-stale!
  "Mark entities of `entity-type` with ids in `entity-ids` as stale for dependency recalculation.
  Creates entries if they don't exist, or sets stale=true if they do."
  [entity-type entity-ids]
  (doseq [batch (partition-all mark-stale-batch-size entity-ids)]
    (let [existing-ids (or (t2/select-fn-set :entity_id :model/DependencyStatus
                                             :entity_type entity-type
                                             :entity_id [:in batch])
                           #{})]
      (when (seq existing-ids)
        (t2/update! :model/DependencyStatus
                    :entity_type entity-type
                    :entity_id [:in existing-ids]
                    {:stale true}))
      (let [new-ids (remove existing-ids batch)]
        (when (seq new-ids)
          (t2/insert! :model/DependencyStatus
                      (mapv (fn [id]
                              {:entity_type entity-type
                               :entity_id id
                               :dependency_analysis_version 0
                               :stale true})
                            new-ids)))))))

(defn upsert-status!
  "Upsert a dependency_status entry, setting stale=false and version to current."
  [entity-type entity-id]
  (let [update {:dependency_analysis_version models.dependency/current-dependency-analysis-version
                :stale false}
        existing-id (t2/select-one-fn :id [:model/DependencyStatus :id]
                                      :entity_type entity-type
                                      :entity_id entity-id)]
    (if existing-id
      (t2/update! :model/DependencyStatus existing-id update)
      (t2/insert! :model/DependencyStatus
                  (assoc update
                         :entity_type entity-type
                         :entity_id entity-id)))))

(defn instances-for-dependency-calculation
  "Find a batch of instances of type `entity-type` and maximum size `batch-size` that need
  dependency calculation: stale=true OR version < current OR no entry.
  Returns full entity objects. Prioritizes stale over outdated."
  [entity-type batch-size]
  (let [model (deps.dependency-types/dependency-type->model entity-type)
        table-name (t2/table-name model)
        id-field (keyword (name table-name) "id")
        table-wildcard (keyword (name table-name) "*")]
    (t2/select model
               {:select [table-wildcard]
                :from table-name
                :left-join [:dependency_status [:and
                                                [:= :dependency_status.entity_id id-field]
                                                [:= :dependency_status.entity_type (name entity-type)]]]
                :where [:or
                        [:= :dependency_status.stale true]
                        [:<
                         [:coalesce :dependency_status.dependency_analysis_version 0]
                         models.dependency/current-dependency-analysis-version]]
                :order-by [[[:case [:= :dependency_status.stale true] [:inline 0] :else [:inline 1]]]]
                :limit batch-size})))

(defn has-stale-entities?
  "Check if there are any stale dependency_status records."
  []
  (t2/exists? :model/DependencyStatus :stale true))
