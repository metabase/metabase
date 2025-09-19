(ns metabase-enterprise.dependencies.task.backfill
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [environ.core :as env]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private entities [:model/Card :model/Transform :model/NativeQuerySnippet])

(defn- backfill-entity-batch!
  [model-kw batch-size]
  (let [model-name (name model-kw)
        target-version models.dependency/current-dependency-analysis-version
        ids (t2/select-pks-vec model-kw :dependency_analysis_version [:< target-version] {:limit batch-size})]
    (when (seq ids)
      (log/infof "Processing a batch of %s %ss..." (count ids) model-name))
    (reduce (fn [total id]
              (+ total
                 (try
                   ;; this should update the dependency table via a toucan2 update hook
                   (t2/update! model-kw id :dependency_analysis_version [:< target-version]
                               {:dependency_analysis_version target-version})
                   (catch Exception e
                     (log/errorf e "Error backfilling dependencies for %s %s" model-name id)
                     0))))
            0
            ids)))

(defn- long-env-value
  [env-var-kw default]
  (or (parse-long (env/env env-var-kw "")) default))

(defn- get-batch-size []
  (long-env-value :mb-dependency-backfill-batch-size 20))

(defn- get-delay-minutes []
  (long-env-value :mb-dependency-backfill-delay-minutes 60))

(defn- get-variance-minutes []
  (long-env-value :mb-dependency-backfill-variance-minutes 10))

(defn- backfill-dependencies
  "Job to backfill dependencies for all entities."
  []
  (reduce (fn [remaining model-kw]
            (let [processed (backfill-entity-batch! model-kw remaining)
                  remaining (- remaining processed)]
              (cond-> remaining
                (< remaining 1) reduced)))
          (get-batch-size)
          entities))

(declare schedule-next-run!)

(task/defjob
  ^{:doc "Backfill the dependency table."
    org.quartz.DisallowConcurrentExecution true}
  BackfillDependencies [_ctx]
  (log/info "Executing BackfillDependencies job...")
  (when (< (backfill-dependencies) 1)
    (let [delay-seconds    (* (get-delay-minutes) 60)
          variance-seconds (* (get-variance-minutes) 60)
          delay-in-seconds (max 0 (+ (- delay-seconds variance-seconds) (rand-int (* 2 variance-seconds))))]
      (schedule-next-run! delay-in-seconds))))

(def ^:private job-key     "metabase.task.dependency-backfill.job")
(def ^:private trigger-key "metabase.task.dependency-backfill.trigger")

(defn- schedule-next-run!
  [delay-in-seconds]
  (let [job      (jobs/build (jobs/of-type BackfillDependencies) (jobs/with-identity job-key))
        start-at (java.util.Date. (long (+ (System/currentTimeMillis) (* delay-in-seconds 1000))))
        trigger  (triggers/build
                  (triggers/with-identity (triggers/key trigger-key))
                  (triggers/for-job job-key)
                  (triggers/start-at start-at))]
    (log/info "Scheduling next run in" delay-in-seconds "seconds.")
    (task/schedule-task! job trigger)))

(defmethod task/init! ::DependencyBackfill [_]
  (if (pos? (get-batch-size))
    (schedule-next-run! (rand-int (* (get-variance-minutes) 60)))
    (log/info "Not starting dependency backfill job because the batch size is not positive")))
