(ns metabase.transforms.schedule
  (:require
   [clojurewerkz.quartzite.conversion :as conversion]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.driver :as driver]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.jobs :as transforms.jobs]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.settings :as transforms.settings]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.util TimeZone)
   (org.quartz CronTrigger CronExpression JobKey TriggerKey)))

(set! *warn-on-reflection* true)

(mr/def ::trigger-info
  "A Quartz trigger as `metabase.task.core/existing-triggers` describes it."
  [:map {:closed true}
   [:description         [:maybe :string]]
   [:end-time            [:maybe inst?]]
   [:final-fire-time     [:maybe inst?]]
   [:key                 :string]
   [:state               [:maybe :string]]
   [:next-fire-time      [:maybe inst?]]
   [:previous-fire-time  [:maybe inst?]]
   [:priority            :int]
   [:start-time          [:maybe inst?]]
   [:may-fire-again?     :boolean]
   [:data                [:map-of :string :string]]
   [:schedule            :string]
   [:timezone            :string]
   [:misfire-instruction :string]])

(mu/defn validate-cron-expression :- :boolean
  "Returns true if valid, false otherwise."
  [expr :- :string]
  (try
    ;; throwing is its only mechanism:
    (CronExpression/validateExpression expr)
    true
    (catch Exception _ false)))

(mu/defn- job-key :- (ms/InstanceOfClass JobKey)
  [job-id :- ms/PositiveInt]
  (jobs/key (str "metabase.task.transforms.schedule." job-id)))

(mu/defn- timezone :- :string
  []
  (or (driver/report-timezone)
      (qp.timezone/system-timezone-id)
      "UTC"))

(mu/defn- trigger-key :- (ms/InstanceOfClass TriggerKey)
  [job-id :- ms/PositiveInt]
  (triggers/key (str "metabase.task.transforms.trigger." job-id)))

(mu/defn- build-trigger :- (ms/InstanceOfClass CronTrigger)
  [job-id   :- ms/PositiveInt
   schedule :- :string]
  (triggers/build
   (triggers/with-description (str "Transform Job Schedule " job-id))
   (triggers/with-identity (trigger-key job-id))
   (triggers/for-job (job-key job-id))
   (triggers/start-now)
   (triggers/with-schedule
    (cron/schedule
     (cron/cron-schedule schedule)
     (cron/in-time-zone (TimeZone/getTimeZone ^String (timezone)))
     ;; We want to fire the trigger once even if the previous triggers missed
     ;; (potentially several times)
     (cron/with-misfire-handling-instruction-fire-and-proceed)))
   ;; higher than sync
   (triggers/with-priority 6)))

(mu/defn- create-trigger! :- [:maybe inst?]
  "Creates the trigger for a transform job."
  [job-id   :- ms/PositiveInt
   schedule :- [:maybe :string]]
  (when schedule
    (log/info "Creating trigger for transform job" job-id "with schedule" schedule)
    (task/add-trigger! (build-trigger job-id schedule))))

(mu/defn existing-trigger :- [:maybe ::trigger-info]
  "Return the existing trigger for `job-id-or-trigger`, or nil, if the trigger doesn't exist."
  [job-id-or-trigger :- ms/PositiveInt]
  (first (task/existing-triggers (job-key job-id-or-trigger)
                                 (trigger-key job-id-or-trigger))))

(mu/defn delete-trigger! :- [:maybe :boolean]
  "Delete the trigger for a transform job. Leaves the underlying Quartz job definition intact so it
  can be re-scheduled later via [[initialize-job!]]."
  ([job-id-or-trigger :- [:or ms/PositiveInt ::trigger-info]]
   (if (number? job-id-or-trigger)
     (if-let [trigger (existing-trigger job-id-or-trigger)]
       (delete-trigger! trigger)
       (log/info "No trigger for this transform job exists"))
     (do
       (log/info "Deleting trigger for transform job with schedule" (:schedule job-id-or-trigger))
       (task/delete-trigger! (-> job-id-or-trigger :key triggers/key))))))

(task/defjob ^{:doc "Run transforms."
               org.quartz.DisallowConcurrentExecution true}
  RunTransforms
  [context]
  (let [job-id   (-> (conversion/from-job-data context)
                     (get "job-id"))
        ;; Read the kill switch at fire time rather than trying to keep Quartz triggers in sync
        ;; with the setting: it is global, env-overridable, and falls back to the token feature
        ;; when unset, so there is no reliable toggle event to hook trigger deletion to.
        enabled? (transforms.settings/transforms-enabled)]
    (task-history/with-task-history {:task "run-transforms"
                                     :task_details (cond-> {:job-id job-id
                                                            :run-method :cron}
                                                     (not enabled?) (assoc :skipped-reason "transforms-disabled"))}
      (if enabled?
        (do
          (log/info "Executing scheduled run of transform job" job-id)
          (transforms.jobs/run-job! job-id {:run-method :cron}))
        ;; Skip before run-job! creates a transform_job_run row: every transform would be
        ;; skipped by the feature check anyway and the run would be recorded as "successful",
        ;; which is misleading. The task_history row above still records the skipped firing.
        (log/info "Skipping scheduled run of transform job" job-id "because transforms are disabled")))))

(mu/defn initialize-job! :- [:maybe inst?]
  "Initialize a schedule for a transform job."
  [{job-id :id :keys [schedule]} :- ::transforms.schema/transform-job]
  (log/info "Initializing schedule for transform job" job-id)
  (let [job (jobs/build
             (jobs/with-identity (job-key job-id))
             (jobs/with-description (str "Run Transform job " job-id))
             (jobs/using-job-data {"job-id" job-id})
             (jobs/of-type RunTransforms)
             (jobs/store-durably))
        trigger (build-trigger job-id schedule)]
    (task/schedule-task! job trigger)))

(mu/defn update-job! :- [:maybe inst?]
  "Update the trigger for a transform job."
  [job-id   :- ms/PositiveInt
   schedule :- [:maybe :string]]
  (log/info "Updating schedule for transform job" job-id "to" schedule)
  (let [existing-trigger (first (task/existing-triggers (job-key job-id) (trigger-key job-id)))]
    (if (not= schedule (:schedule existing-trigger))
      (do
        (when existing-trigger
          (delete-trigger! existing-trigger))
        (when schedule
          (create-trigger! job-id schedule)))
      (log/info "No changes to the trigger for transform job" job-id))))

(mu/defn delete-job! :- [:maybe :boolean]
  "Delete a job."
  [job-id :- ms/PositiveInt]
  (log/info "Deleting schedule for transform job" job-id)
  (task/delete-task! (job-key job-id) (trigger-key job-id)))

(defmethod task/init! ::RunTransform [_]
  (log/info "Initializing transform job execution jobs")
  (->> (transforms.db/active-jobs)
       (run! initialize-job!)))
