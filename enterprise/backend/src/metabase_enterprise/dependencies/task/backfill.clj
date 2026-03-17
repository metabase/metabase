(ns metabase-enterprise.dependencies.task.backfill
  "Implements a task that brings all entities with dependencies tracked in the dependency table
  (see [[metabase-enterprise.dependencies.models.dependency]]) up to date, that is, makes sure
  the dependency table contains fresh entries.

  This is done by querying the dependency_status table for entities that are stale or have an
  outdated dependency_analysis_version. The backfill task computes dependencies and updates
  the dependency_status table."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task-util :as deps.task-util]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.transforms.core :as transforms]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.util Map Set)
   (java.util.concurrent ConcurrentHashMap)))

(set! *warn-on-reflection* true)

(defn- current-millis
  "Returns the current epoch millis. Uses java-time so that clock settings can be used in tests."
  []
  (t/to-millis-from-epoch (t/instant)))

(def ^:private entity-types
  "The list of entity types to backfill.

  This is not the same as deps.dependency-types/models, because tables shouldn't be backfilled.  Instead, links
  involving tables are found via analysis of the other side of the relation."
  [:card :transform :snippet :dashboard :document :sandbox :segment :measure])

;; In-memory state for tracking failed entities
;; Stores {:entity-type {id {:fail-count N :next-retry-timestamp M}}}
(def ^:private retry-state
  (zipmap entity-types (repeatedly #(ConcurrentHashMap.))))

;; Stores {:entity-type #{id1 id2 ...}} for entities that have exceeded MAX_RETRIES
(def ^:private terminally-broken
  (zipmap entity-types (repeatedly #(ConcurrentHashMap/newKeySet))))

(def ^:private max-retries 5)

(defn- processable-instances [entity-type batch-size]
  (let [terminally-broken-ids ^Set (terminally-broken entity-type)
        retry-state-map ^Map (retry-state entity-type)
        current-time (current-millis)]
    (into []
          (comp
           (filter (fn [instance]
                     (let [id (:id instance)]
                       (and (not (.contains terminally-broken-ids id))
                            (let [entity-retry-info (.get retry-state-map id)]
                              (or (nil? entity-retry-info)
                                  (>= current-time (:next-retry-timestamp entity-retry-info))))))))
           (take batch-size))
          (deps.dependency-status/instances-for-dependency-calculation entity-type (* batch-size 2)))))

(defn- drop-outdated-target-dep! [{:keys [id target] :as transform}]
  (let [db-id                (transforms/transform-source-database transform)
        downstream-table-ids (t2/select-fn-set :from_entity_id :model/Dependency
                                               :from_entity_type :table
                                               :to_entity_type   :transform
                                               :to_entity_id     id)
        downstream-tables    (when (seq downstream-table-ids)
                               (t2/select :model/Table :id [:in downstream-table-ids]))
        outdated-tables      (remove (fn [table]
                                       (and (= (:schema table) (:schema target))
                                            (= (:name   table) (:name   target))
                                            (or (not db-id)
                                                (= db-id (:db_id table)))))
                                     downstream-tables)
        not-found-table-ids  (remove (into #{} (map :id) downstream-tables)
                                     downstream-table-ids)]
    (when-let [outdated-downstream-table-ids (seq (into (set not-found-table-ids)
                                                        (map :id) outdated-tables))]
      (t2/delete! :model/Dependency
                  :from_entity_type :table
                  :from_entity_id   [:in outdated-downstream-table-ids]
                  :to_entity_type   :transform
                  :to_entity_id     id))))

(defn- compute-deps-for-entity!
  "Compute and store dependencies for an entity, then update its dependency_status."
  [entity-type entity]
  (log/debug "Computing dependencies for" (name entity-type) (:id entity))
  (t2/with-transaction [_]
    (let [deps-fn (case entity-type
                    :card      deps.calculation/upstream-deps:card
                    :transform deps.calculation/upstream-deps:transform
                    :snippet   deps.calculation/upstream-deps:snippet
                    :dashboard deps.calculation/upstream-deps:dashboard
                    :document  deps.calculation/upstream-deps:document
                    :sandbox   deps.calculation/upstream-deps:sandbox
                    :segment   deps.calculation/upstream-deps:segment
                    :measure   deps.calculation/upstream-deps:measure)
          ;; For dashboards, load dashcards before computing deps
          entity (if (= entity-type :dashboard)
                   (let [dashboard-id (:id entity)
                         dashcards (t2/select :model/DashboardCard :dashboard_id dashboard-id)
                         series-card-ids (when (seq dashcards)
                                           (t2/select-fn-set :card_id :model/DashboardCardSeries
                                                             :dashboardcard_id [:in (map :id dashcards)]))]
                     (assoc entity :dashcards dashcards :series-card-ids series-card-ids))
                   entity)
          deps (try
                 (deps-fn entity)
                 (catch Throwable e
                   (log/error e "Dependency calculation failed" {:entity-type entity-type
                                                                 :entity-id   (:id entity)})
                   nil))]
      (models.dependency/replace-dependencies! entity-type (:id entity) deps)
      ;; Entity-specific cleanup
      (when (= entity-type :transform)
        (drop-outdated-target-dep! entity))
      (deps.dependency-status/upsert-status! entity-type (:id entity)))))

(defn- backfill-entity-batch!
  [entity-type batch-size]
  (let [type-name (name entity-type)
        retry-state-map ^Map (retry-state entity-type)
        terminally-broken-set ^Set (terminally-broken entity-type)
        instances (processable-instances entity-type batch-size)]
    (when (seq instances)
      (log/infof "Processing a batch of %s %s(s)..." (count instances) type-name))
    (reduce (fn [total entity]
              (+ total
                 (try
                   (compute-deps-for-entity! entity-type entity)
                   (.remove retry-state-map (:id entity))
                   1
                   (catch Exception e
                     (let [id (:id entity)
                           current-time (current-millis)
                           entity-retry-info (.get retry-state-map id)
                           failure-count (inc (:fail-count entity-retry-info 0))
                           retry-minutes (* failure-count (deps.settings/dependency-backfill-delay-minutes))
                           new-next-retry-timestamp (+ current-time (* retry-minutes 60 1000))]
                       (if (> failure-count max-retries)
                         (do (log/errorf e "Entity %s %s failed %d times, marking as terminally broken."
                                         type-name id failure-count)
                             (.add terminally-broken-set id)
                             (.remove retry-state-map id))
                         (do (log/warnf e "Entity %s %s failed, failure count: %d, next retry no sooner than %d minutes."
                                        type-name id failure-count retry-minutes)
                             (.put retry-state-map id {:fail-count failure-count
                                                       :next-retry-timestamp new-next-retry-timestamp}))))
                     0))))
            0
            instances)))

(defn- backfill-dependencies!
  "Job to backfill dependencies for all entities.
  Returns true if a full batch has been selected, nil or false otherwise."
  []
  (when (premium-features/has-feature? :dependencies)
    (-> (reduce (fn [batch-size entity-type]
                  (if (< batch-size 1)
                    (reduced 0)
                    (let [processed (backfill-entity-batch! entity-type batch-size)]
                      (when (pos? processed)
                        (log/info "Updated" processed "entities."))
                      (- batch-size processed))))
                (deps.settings/dependency-backfill-batch-size)
                entity-types)
        (< 1))))

(defn- has-pending-retries? []
  (some (fn [^Map model-retry-state]
          (not (.isEmpty model-retry-state)))
        (vals retry-state)))

(declare schedule-next-run!)

(task/defjob
  ^{:doc "Backfill the dependency table."
    org.quartz.DisallowConcurrentExecution true}
  BackfillDependencies [ctx]
  (log/info "Executing BackfillDependencies job...")
  (let [full-batch-selected? (backfill-dependencies!)
        retries? (has-pending-retries?)]
    (if (or full-batch-selected?
            retries?)
      (let [delay-in-seconds (deps.task-util/job-delay
                              (deps.settings/dependency-backfill-delay-minutes)
                              (deps.settings/dependency-backfill-variance-minutes))]
        (schedule-next-run! delay-in-seconds (.getScheduler ctx)))
      (log/info "No more entities to backfill for, stopping."))))

(def ^:private job-key     "metabase.task.dependency-backfill.job")
(def ^:private trigger-key "metabase.task.dependency-backfill.trigger")

(defn- schedule-next-run!
  ([delay-in-seconds] (schedule-next-run! delay-in-seconds nil))
  ([delay-in-seconds scheduler]
   (deps.task-util/schedule-next-run!
    {:job-type         BackfillDependencies
     :job-name         "Dependency Backfill"
     :job-key          job-key
     :trigger-key      trigger-key
     :delay-in-seconds delay-in-seconds
     :scheduler        scheduler})))

(defn trigger-backfill-job!
  "Trigger the BackfillDependencies job to run immediately.
  Use this when entities have been marked stale and need dependency recalculation."
  []
  (schedule-next-run! 0))

(defmethod task/init! ::DependencyBackfill [_]
  (if (pos? (deps.settings/dependency-backfill-batch-size))
    (schedule-next-run! (if config/is-test?
                          0
                          (deps.task-util/job-initial-delay
                           (deps.settings/dependency-backfill-variance-minutes))))
    (log/info "Not starting dependency backfill job because the batch size is not positive")))

(derive ::backfill :metabase/event)
(derive :event/serdes-load ::backfill)
(derive :event/set-premium-embedding-token ::backfill)

(methodical/defmethod events/publish-event! ::backfill
  [_ _]
  (when (premium-features/has-feature? :dependencies)
    (backfill-dependencies!)))
