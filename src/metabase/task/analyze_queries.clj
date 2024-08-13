(ns metabase.task.analyze-queries
  "The background worker which performs the analysis of queries, and updates the database in accordance.
  Restricts the CPU and database load corresponding to this analysis via a crude rate limiting algorithm that puts the
  worker to sleep such that it is active at most [[max-cpu-usage-fraction]] of the time."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.public-settings :as public-settings]
   [metabase.query-analysis :as query-analysis]
   [metabase.query-analysis.failure-map :as failure-map]
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private max-cpu-usage-fraction 0.2)

(def ^:private wait-ratio
  (/ (- 1 max-cpu-usage-fraction) max-cpu-usage-fraction))

(def ^:private fail-wait-ms (* 2 1000))

(def ^:private min-wait-ms 5)

(def ^:private max-wait-ms (* 10 1000))

(defn- wait-proportional ^long [time-taken-ms]
  (->> time-taken-ms
       (* wait-ratio)
       (max min-wait-ms)
       (min max-wait-ms)))

(defn- wait-fail ^long [time-taken-ms]
  (max fail-wait-ms (wait-proportional time-taken-ms)))

(defn- analyzer-loop* [stop-after next-card-id-fn]
  (loop [remaining stop-after]
    (when (public-settings/query-analysis-enabled)
      (let [card-or-id (next-card-id-fn)
            card-id    (u/the-id card-or-id)
            timer      (u/start-timer)
            card       (query-analysis/->analyzable card-or-id)]
        (if (failure-map/non-retryable? card)
          (log/warnf "Skipping analysis of Card %s as its query has caused failures in the past." card-id)
          (try
            (query-analysis/analyze-card! card)
            (failure-map/track-success! card)
            (let [sleep-ms (wait-proportional (u/since-ms timer))]
              (log/infof "Waiting %s millis before analysing further cards after finishing Card %s" sleep-ms card-id)
              (Thread/sleep sleep-ms))
            (catch Exception e
              (log/errorf e "Error analysing and updating query for Card %s" card-id)
              (failure-map/track-failure! card)
              (Thread/sleep (wait-fail (u/since-ms timer))))))
        (cond
          (nil? remaining) (recur nil)
          (> remaining 1) (recur (dec remaining)))))))

(defn- analyzer-loop!
  ([]
   (analyzer-loop! nil))
  ([stop-after]
   (analyzer-loop* stop-after query-analysis/next-card-or-id!))
  ([stop-after queue]
   (analyzer-loop! stop-after queue Long/MAX_VALUE))
  ([stop-after queue timeout]
   (analyzer-loop* stop-after (partial query-analysis/next-card-or-id! queue timeout))))

(jobs/defjob ^{DisallowConcurrentExecution true
               :doc                        "Analyze "}
  QueryAnalyzer [_ctx]
  (analyzer-loop!))

(defmethod task/init! ::BackfillQueryField [_]
  (let [job     (jobs/build
                 (jobs/of-type QueryAnalyzer)
                 (jobs/with-identity (jobs/key "metabase.task.analyze-queries.job")))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key "metabase.task.analyze-queries.trigger"))
                 (triggers/with-schedule
                  (simple/schedule (simple/with-interval-in-minutes 1)))
                 (triggers/start-now))]
    (task/schedule-task! job trigger)))
