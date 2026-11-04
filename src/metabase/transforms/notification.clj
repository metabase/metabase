(ns metabase.transforms.notification
  "Daily digest of transform job failures, computed from recent `transform_job_run` history."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.channel.urls :as urls]
   [metabase.driver :as driver]
   [metabase.events.core :as events]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task.core :as task]
   [metabase.transforms.db :as transforms.db]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::failing-job
  [:map {:closed true}
   [:job_name      [:maybe :string]]
   [:job_href      :string]
   [:failure_count :int]
   [:first_failed  [:maybe :string]]
   [:latest_error  [:maybe :string]]])

(mu/defn- recent-failed-cron-job-runs :- [:sequential [:map {:closed true}
                                                       [:job_id     ms/PositiveInt]
                                                       [:start_time [:maybe ms/TemporalInstant]]
                                                       [:message    [:maybe :string]]]]
  "Cron job runs that failed or timed out in `[start, end)`, oldest first."
  [start :- ms/TemporalInstant
   end   :- ms/TemporalInstant]
  (transforms.db/failed-cron-job-runs-between start end))

(mu/defn failing-jobs :- [:sequential ::failing-job]
  "Summarize failed/timed-out cron job runs in `[start, end)`, one entry per job."
  [start :- ms/TemporalInstant
   end   :- ms/TemporalInstant]
  (let [runs     (recent-failed-cron-job-runs start end)
        job-ids  (distinct (map :job_id runs))
        id->name (when (seq job-ids)
                   (transforms.db/job-names-by-id job-ids))]
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

(mu/defn- digest-timezone :- (ms/InstanceOfClass java.time.ZoneId)
  "Zone for the digest's calendar-day boundaries, matching transform scheduling."
  []
  (t/zone-id (or (driver/report-timezone)
                 (qp.timezone/system-timezone-id)
                 "UTC")))

(mu/defn digest-info :- [:map {:closed true}
                         [:job_count     :int]
                         [:failure_count :int]
                         [:jobs          [:sequential ::failing-job]]]
  "Event info for the failure digest, covering the previous calendar day."
  []
  (let [yesterday           (u.date/add (t/zoned-date-time (digest-timezone)) :day -1)
        {:keys [start end]} (u.date/range yesterday :day)
        jobs                (failing-jobs start end)]
    {:job_count     (count jobs)
     :failure_count (reduce + 0 (map :failure_count jobs))
     :jobs          jobs}))

(mu/defn send-failure-digest! :- :nil
  "Publish the daily digest event, unless there were no failures."
  []
  (let [{:keys [jobs] :as info} (digest-info)]
    (if (seq jobs)
      (events/publish-event! :event/transform-failure-digest info)
      (log/info "No transform job failures yesterday; skipping digest."))
    nil))

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
