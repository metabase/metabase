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
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.log :as log]
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
   :model/Segment])

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

(defn- backfill-card!
  [id target-version]
  ;; We don't want to change the card at all, we just want to update the dependency data and
  ;; mark the card as processed for this dependency analysis version.
  (let [update-count (t2/update! :model/Card id :dependency_analysis_version [:< target-version]
                                 {:dependency_analysis_version target-version})]
    (when-let [card (and (pos? update-count)
                         (t2/select-one :model/Card id))]
      (events/publish-event! :event/card-dependency-backfill {:object card}))
    update-count))

(defn- backfill-entity!
  [model-kw id target-version]
  (log/debug "Backfilling " (name model-kw) id)
  (u/prog1 (t2/with-transaction [_]
             (case model-kw
               :model/Card (backfill-card! id target-version)
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
      (let [delay-seconds    (* (deps.settings/dependency-backfill-delay-minutes) 60)
            variance-seconds (* (deps.settings/dependency-backfill-variance-minutes) 60)
            delay-in-seconds (max 0 (+ (- delay-seconds variance-seconds) (rand-int (* 2 variance-seconds))))]
        (schedule-next-run! delay-in-seconds (.getScheduler ctx)))
      (log/info "No more entities to backfill for, stopping."))))

(def ^:private job-key     "metabase.task.dependency-backfill.job")
(def ^:private trigger-key "metabase.task.dependency-backfill.trigger")

(defn- schedule-next-run!
  ([delay-in-seconds] (schedule-next-run! delay-in-seconds nil))
  ([delay-in-seconds scheduler]
   (let [start-at (java.util.Date. (long (+ (current-millis) (* delay-in-seconds 1000))))
         trigger  (triggers/build
                   (triggers/with-identity (triggers/key (str trigger-key \. (random-uuid))))
                   (triggers/for-job job-key)
                   (triggers/start-at start-at))]
     (log/info "Scheduling next run at" start-at)
     (if scheduler
       ;; re-scheduling from the job
       (qs/add-trigger scheduler trigger)
       ;; first schedule
       (let [job (jobs/build (jobs/of-type BackfillDependencies) (jobs/with-identity job-key))]
         (task/schedule-task! job trigger))))))

(defmethod task/init! ::DependencyBackfill [_]
  (if (pos? (deps.settings/dependency-backfill-batch-size))
    (schedule-next-run! (rand-int (* (deps.settings/dependency-backfill-variance-minutes) 60)))
    (log/info "Not starting dependency backfill job because the batch size is not positive")))
