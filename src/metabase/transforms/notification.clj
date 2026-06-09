(ns metabase.transforms.notification
  "Daily digest of transform job failures, computed from recent `transform_job_run` history."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.app-db.core :as mdb]
   [metabase.channel.urls :as urls]
   [metabase.events.core :as events]
   [metabase.task.core :as task]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- recent-failed-cron-job-runs
  "All cron-scheduled job runs that failed or timed out since `cutoff`, oldest first."
  [cutoff]
  (t2/select [:model/TransformJobRun :job_id :start_time :message]
             {:where    [:and
                         [:= :run_method "cron"]
                         [:in :status ["failed" "timeout"]]
                         [:>= :start_time cutoff]]
              :order-by [[:start_time :asc]]}))

(defn failing-jobs
  "Summarize cron job runs that failed or timed out since `cutoff`, one entry per job."
  [cutoff]
  (let [runs     (recent-failed-cron-job-runs cutoff)
        job-ids  (distinct (map :job_id runs))
        id->name (when (seq job-ids)
                   (t2/select-pk->fn :name :model/TransformJob :id [:in job-ids]))]
    (->> (group-by :job_id runs)
         ;; `runs` is oldest-first, and group-by preserves that within each job's group
         (map (fn [[job-id job-runs]]
                {:job_name      (get id->name job-id)
                 :job_href      (urls/transform-job-url job-id)
                 :failure_count (count job-runs)
                 :first_failed  (some-> (:start_time (first job-runs)) u.date/format)
                 :latest_error  (:message (last job-runs))}))
         (sort-by :first_failed)
         vec)))

(defn digest-info
  "Event info for the failure digest, built from the last day of run history."
  []
  (let [cutoff (h2x/add-interval-honeysql-form (mdb/db-type) :%now -1 :day)
        jobs   (failing-jobs cutoff)]
    {:job_count     (count jobs)
     :failure_count (reduce + 0 (map :failure_count jobs))
     :jobs          jobs}))

(defn send-failure-digest!
  "Publish the daily digest event, unless there were no failures."
  []
  (let [{:keys [jobs] :as info} (digest-info)]
    (if (seq jobs)
      (events/publish-event! :event/transform-failure-digest info)
      (log/info "No transform job failures in the last day; skipping digest."))))

(def ^:private digest-job-key "metabase.transforms.notification.failure-digest-job")
(def ^:private digest-trigger-key "metabase.transforms.notification.failure-digest-trigger")

(task/defjob ^{:doc "Sends the daily transform failure digest."
               org.quartz.DisallowConcurrentExecution true}
  SendTransformFailureDigest [_ctx]
  (send-failure-digest!))

(defmethod task/init! ::SendTransformFailureDigest [_]
  (let [job     (jobs/build
                 (jobs/of-type SendTransformFailureDigest)
                 (jobs/with-identity (jobs/key digest-job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key digest-trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; daily at 08:00
                  (cron/cron-schedule "0 0 8 * * ? *")))]
    (task/schedule-task! job trigger)))
