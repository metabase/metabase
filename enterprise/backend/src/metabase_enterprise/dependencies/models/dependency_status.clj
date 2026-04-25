(ns metabase-enterprise.dependencies.models.dependency-status
  (:require
   [java-time.api :as t]
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
  Resets retry state so previously-failed entities get a fresh chance.
  Uses [[app-db/update-or-insert!]] for cross-database atomicity."
  [entity-type entity-ids]
  (doseq [id entity-ids]
    (app-db/update-or-insert!
     :model/DependencyStatus
     {:entity_type entity-type :entity_id id}
     (fn [existing]
       (if existing
         {:stale true :fail_count 0 :next_retry_at nil :terminal false}
         {:stale true :dependency_analysis_version 0})))))

(defn upsert-status!
  "Upsert a dependency_status entry, setting stale=false, version to current,
  and clearing any failure state. Uses [[app-db/update-or-insert!]] for cross-database atomicity."
  [entity-type entity-id]
  (app-db/update-or-insert!
   :model/DependencyStatus
   {:entity_type entity-type :entity_id entity-id}
   (fn [_existing]
     {:dependency_analysis_version models.dependency/current-dependency-analysis-version
      :stale false
      :fail_count 0
      :next_retry_at nil})))

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
  dependency calculation: no status row yet, stale=true, OR version < current.
  Excludes terminal entities and entities whose retry delay hasn't elapsed.
  Returns full entity objects. Prioritizes stale over outdated.
  Uses Java time (not DB time) so tests with [[mt/with-clock]] work correctly."
  [entity-type batch-size]
  (let [model (deps.dependency-types/dependency-type->model entity-type)
        table-name (t2/table-name model)
        id-field (keyword (name table-name) "id")
        table-wildcard (keyword (name table-name) "*")
        now (t/offset-date-time)]
    (t2/select model
               {:select [table-wildcard]
                :from table-name
                :left-join [:dependency_status [:and
                                                [:= :dependency_status.entity_id id-field]
                                                [:= :dependency_status.entity_type (name entity-type)]]]
                :where [:or
                        ;; No status row yet — needs initial processing.
                        [:= :dependency_status.entity_id nil]
                        [:and
                         ;; Needs processing: stale or version outdated
                         [:or
                          [:= :dependency_status.stale true]
                          [:< :dependency_status.dependency_analysis_version
                           models.dependency/current-dependency-analysis-version]]
                         ;; Not terminally broken
                         [:= :dependency_status.terminal false]
                         ;; Retry delay has elapsed (or no delay set)
                         [:or
                          [:is :dependency_status.next_retry_at nil]
                          [:<= :dependency_status.next_retry_at now]]]]
                :order-by [[[:case [:= :dependency_status.stale true] [:inline 0] :else [:inline 1]]]]
                :limit batch-size})))

(defn has-pending-retries?
  "Returns true if there are any entities waiting to be retried (not terminal, with a set retry time)."
  []
  (t2/exists? :model/DependencyStatus
              :terminal false
              :next_retry_at [:not= nil]))

(defn has-stale-or-outdated?
  "Returns true if there are any entities needing dependency calculation:
  stale=true OR version < current, not terminal, and retry delay elapsed."
  []
  (let [now (t/offset-date-time)]
    (t2/exists? :model/DependencyStatus
                {:where [:and
                         [:or
                          [:= :stale true]
                          [:< :dependency_analysis_version
                           models.dependency/current-dependency-analysis-version]]
                         [:= :terminal false]
                         [:or
                          [:is :next_retry_at nil]
                          [:<= :next_retry_at now]]]})))

(defn record-failure!
  "Record a failed dependency calculation attempt for an entity.
  Increments fail_count and sets next_retry_at based on exponential backoff.
  If max retries exceeded, marks the entity as terminal."
  [entity-type entity-id max-retries delay-minutes]
  (when-let [status (t2/select-one :model/DependencyStatus
                                   :entity_type entity-type
                                   :entity_id entity-id)]
    (let [new-fail-count (inc (:fail_count status 0))]
      (if (> new-fail-count max-retries)
        (t2/update! :model/DependencyStatus (:id status)
                    {:fail_count new-fail-count
                     :terminal true
                     :next_retry_at nil})
        (let [retry-minutes (* new-fail-count delay-minutes)]
          (t2/update! :model/DependencyStatus (:id status)
                      {:fail_count new-fail-count
                       :next_retry_at (when (pos? retry-minutes)
                                        (t/plus (t/offset-date-time) (t/minutes retry-minutes)))}))))))
