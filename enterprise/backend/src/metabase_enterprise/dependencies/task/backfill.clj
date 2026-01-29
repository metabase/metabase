(ns metabase-enterprise.dependencies.task.backfill
  "Implements a task that brings all entities with dependencies tracked in the dependency table
  (see [[metabase-enterprise.dependencies.models.dependency]]) up to date, that is, makes sure
  the dependency table contains fresh entries.

  This is done by finding entities whose dependency_analysis_version is less than
  [[metabase-enterprise.dependencies.models.dependency/current-dependency-analysis-version]] and
  updates this field. In most cases this triggers an event handler that calculates the dependencies
  and populates the dependency table. For cards, the event is emitted by the job handler itself,
  because the update of the record doesn't trigger the event handler. "
  (:require
   [java-time.api :as t]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task-util :as deps.task-util]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
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

(def ^:private entities
  "The list of models to backfill.

  This is not the same as deps.dependency-types/models, because tables shouldn't be backfilled.  Instead, links
  involving tables are found via analysis of the other side of the relation."
  [:model/Card
   :model/Transform
   :model/NativeQuerySnippet
   :model/Dashboard
   :model/Document
   :model/Sandbox
   :model/Segment
   :model/Measure])

;; In-memory state for tracking failed entities
;; Stores {:model/Type {id {:fail-count N :next-retry-timestamp M}}}
(def ^:private retry-state
  (zipmap entities (repeatedly #(ConcurrentHashMap.))))

;; Stores {:model/Type #{id1 id2 ...}} for entities that have exceeded MAX_RETRIES
(def ^:private terminally-broken
  (zipmap entities (repeatedly #(ConcurrentHashMap/newKeySet))))

(def ^:private max-retries 5)

(defn- processable-ids [model-kw batch-size]
  (let [target-version models.dependency/current-dependency-analysis-version
        terminally-broken-ids ^Set (terminally-broken model-kw)
        retry-state-map ^Map (retry-state model-kw)
        current-time (current-millis)]
    (into []
          (comp
           (map :id)
           (filter (fn [id]
                     (and (not (.contains terminally-broken-ids id))
                          (let [entity-retry-info (.get retry-state-map id)]
                            (or (nil? entity-retry-info)
                                (>= current-time (:next-retry-timestamp entity-retry-info)))))))
           (take batch-size))
          (t2/reducible-select [model-kw :id] :dependency_analysis_version [:< target-version]))))

(def ^:private custom-backfill-events
  {:model/Card :event/card-dependency-backfill
   :model/Dashboard :event/dashboard-dependency-backfill})

(defn- custom-backfill-entity!
  [model-kw event id target-version]
  ;; We don't want to change the entity at all, we just want to update the dependency data and
  ;; mark the entity as processed for this dependency analysis version.
  (let [update-count (t2/update! model-kw id :dependency_analysis_version [:< target-version]
                                 {:dependency_analysis_version target-version})]
    (when-let [entity (and (pos? update-count)
                           (t2/select-one model-kw id))]
      (events/publish-event! event {:object entity}))
    update-count))

(defn- backfill-entity!
  [model-kw id target-version]
  (log/debug "Backfilling " (name model-kw) id)
  (u/prog1
    (t2/with-transaction [_]
      (if-let [event (custom-backfill-events model-kw)]
        (custom-backfill-entity! model-kw event id target-version)
        (t2/update! model-kw id :dependency_analysis_version [:< target-version]
                    {:dependency_analysis_version target-version})))
    (log/debug "Backfilled " (name model-kw) id)))

(defn- backfill-entity-batch!
  [model-kw batch-size]
  (let [model-name (name model-kw)
        target-version models.dependency/current-dependency-analysis-version
        retry-state-map ^Map (retry-state model-kw)
        terminally-broken-set ^Set (terminally-broken model-kw)
        ids (processable-ids model-kw batch-size)] ; Use the new get-processable-ids
    (when (seq ids)
      (log/infof "Processing a batch of %s %s(s)..." (count ids) model-name))
    (reduce (fn [total id]
              (+ total
                 (try
                   ;; this should update the dependency table via a toucan2 update hook
                   (let [update-count (backfill-entity! model-kw id target-version)]
                     (.remove retry-state-map id)
                     update-count)
                   (catch Exception e
                     (let [current-time (current-millis)
                           entity-retry-info (.get retry-state-map id)
                           failure-count (inc (:fail-count entity-retry-info 0))
                           retry-minutes (* failure-count (deps.settings/dependency-backfill-delay-minutes))
                           new-next-retry-timestamp (+ current-time (* retry-minutes 60 1000))]
                       (if (> failure-count max-retries)
                         (do (log/errorf e "Entity %s %s failed %d times, marking as terminally broken."
                                         model-name id failure-count)
                             (.add terminally-broken-set id)
                             (.remove retry-state-map id)) ; Remove from retry map
                         (do (log/warnf e "Entity %s %s failed, failure count: %d, next retry no sooner than %d minutes."
                                        model-name id failure-count retry-minutes)
                             (.put retry-state-map id {:fail-count failure-count
                                                       :next-retry-timestamp new-next-retry-timestamp}))))
                     0))))
            0
            ids)))

(defn- backfill-dependencies!
  "Job to backfill dependencies for all entities.
  Returns true if a full batch has been selected, nil or false otherwise."
  []
  (when (premium-features/has-feature? :dependencies)
    (-> (reduce (fn [batch-size model-kw]
                  (if (< batch-size 1)
                    (reduced 0)
                    (let [processed (backfill-entity-batch! model-kw batch-size)]
                      (when (pos? processed)
                        (log/info "Updated" processed "entities."))
                      (- batch-size processed))))
                (deps.settings/dependency-backfill-batch-size)
                entities)
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
