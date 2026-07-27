(ns metabase.mq.task.outbox
  "Quartz job that sweeps the transactional outbox ([[metabase.mq.queue.outbox]]). The normal
  after-commit path publishes and deletes outbox rows immediately, so this sweep only ever picks up
  rows a crash left behind between the business commit and the after-commit publish — republishing
  them so the persistence guarantee holds across node failures."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.mq.queue.outbox :as outbox]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private job-key (jobs/key "metabase.mq.task.outbox.job"))
(def ^:private trigger-key (triggers/key "metabase.mq.task.outbox.trigger"))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Republishes transactional-outbox rows orphaned by a crash."}
  FlushMessageOutbox
  [_]
  (let [n (outbox/recover-outbox!)]
    (when (pos? n)
      (log/infof "Recovered %d orphaned queue outbox row(s)" n))))

(defmethod task/init! ::FlushMessageOutbox [_]
  (let [job     (jobs/build
                 (jobs/of-type FlushMessageOutbox)
                 (jobs/with-identity job-key))
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; every 5 minutes
                  (cron/cron-schedule "0 0/5 * * * ? *")))]
    (task/schedule-task! job trigger)))
