(ns metabase-enterprise.dependencies.task.entity-check
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- current-millis
  "Returns the current epoch millis. Uses java-time so that clock settings can be used in tests."
  []
  (t/to-millis-from-epoch (t/instant)))

(defn- check-entities!
  []
  (when (premium-features/has-feature? :dependencies)
    (-> (reduce (fn [batch-size entity-type]
                  (if (< batch-size 1)
                    (reduced 0)
                    (let [processed (deps.findings/analyze-batch! entity-type batch-size)]
                      (when (pos? processed)
                        (log/info "Updated" processed "entities of type" entity-type))
                      (- batch-size processed))))
                (deps.settings/dependency-entity-check-batch-size)
                deps.findings/supported-entities)
        (< 1))))

(declare schedule-next-run!)

(task/defjob
  ^{:doc "Check all entities for validity"
    org.quartz.DisallowConcurrentExecution true}
  DependencyEntityCheck [ctx]
  (log/info "Executing DependencyEntityCheck job...")
  (check-entities!)
  (let [delay-seconds    (* (deps.settings/dependency-entity-check-delay-minutes) 60)
        variance-seconds (* (deps.settings/dependency-entity-check-variance-minutes) 60)
        delay-in-seconds (max 0 (+ (- delay-seconds variance-seconds) (rand-int (* 2 variance-seconds))))]
    (schedule-next-run! delay-in-seconds (.getScheduler ctx))))

(def ^:private job-key     "metabase.dependencies.task.entity-check.job")
(def ^:private trigger-key "metabase.dependencies.task.entity-check.trigger")

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
       (let [job (jobs/build (jobs/of-type DependencyEntityCheck) (jobs/with-identity job-key))]
         (task/schedule-task! job trigger))))))

(defmethod task/init! ::DependencyEntityCheck [_]
  (if (pos? (deps.settings/dependency-entity-check-batch-size))
    (schedule-next-run! (rand-int (* (deps.settings/dependency-entity-check-variance-minutes) 60)))
    (log/info "Not starting dependency entity check job because the batch size is not positive")))
