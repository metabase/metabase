(ns metabase-enterprise.transforms.schedule
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase.driver :as driver]
   [metabase.events.core :as events]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.util TimeZone)
   (org.quartz CronTrigger TriggerKey)))

(set! *warn-on-reflection* true)

(def ^:private job-key (jobs/key "metabase.task.transforms.schedule.job"))

(defn- timezone
  []
  (or (driver/report-timezone)
      (qp.timezone/system-timezone-id)
      "UTC"))

(defn- trigger-key
  ^TriggerKey [transform-id]
  (triggers/key (format "metabase.task.transforms.trigger.transform.%d" transform-id)))

(defn- build-trigger
  ^CronTrigger [transform-id schedule]
  (triggers/build
   (triggers/with-description (format "Transform %d" transform-id))
   (triggers/with-identity (trigger-key transform-id))
   (triggers/using-job-data {"transform-id" transform-id})
   (triggers/for-job job-key)
   (triggers/start-now)
   (triggers/with-schedule
    (cron/schedule
     (cron/cron-schedule schedule)
     (cron/in-time-zone (TimeZone/getTimeZone ^String (timezone)))
      ;; We want to fire the trigger once even if the previous triggers missed
     (cron/with-misfire-handling-instruction-fire-and-proceed)))
   ;; higher than sync
   (triggers/with-priority 6)))

(defn- create-trigger!
  "Create a trigger for a transform."
  [{:keys [id schedule] :as _transform}]
  (when schedule
    (log/info "Creating trigger for transform" id "with schedule" schedule)
    (task/add-trigger! (build-trigger id schedule))))

(defn- delete-trigger-for-transform-id!
  [id trigger]
  (log/info "Deleting trigger for transform" id "with schedule" (:schedule trigger))
  (task/delete-trigger! (-> trigger :key triggers/key)))

(defn- update-trigger!
  "Update the trigger for a transform."
  [{:keys [id schedule] :as transform}]
  (let [existing-trigger (first (task/existing-triggers job-key (trigger-key id)))]
    (if (not= schedule (:schedule existing-trigger))
      (do
        (when existing-trigger
          (delete-trigger-for-transform-id! id existing-trigger))
        (when schedule
          (create-trigger! transform)))
      (log/info "No changes to trigger for transform" id "with schedule" schedule))))

(defn- delete-trigger!
  "Delete the trigger for a transform."
  [transform-id]
  (when-first [trigger (task/existing-triggers job-key (trigger-key transform-id))]
    (delete-trigger-for-transform-id! transform-id trigger)))

(task/defjob ^{:doc "Execute a transform."}
  ExecuteTransform
  [context]
  (let [{:strs [transform-id]} (qc/from-job-data context)]
    (when-let [transform (t2/select-one :model/Transform transform-id)]
      (task-history/with-task-history {:task         "execute-transform"
                                       :db_id        (-> transform :source :query :database)
                                       :task_details {:trigger_type :transform/cron
                                                      :transform_id transform-id
                                                      :schedule     (:schedule transform)}}
        (transforms.execute/exec-transform transform)))))

(defmethod task/init! ::ExecuteTransform [_]
  (let [execute-transform-job (jobs/build
                               (jobs/with-identity job-key)
                               (jobs/with-description "Execute Transform")
                               (jobs/of-type ExecuteTransform)
                               (jobs/store-durably))]
    (task/add-job! execute-transform-job)))

(doseq [event ["transform-create" "transform-update" "transform-delete"]
        :let [local-kw (keyword (str *ns*) event)
              global-kw (keyword "event" event)]]
  (derive local-kw :metabase/event)
  (derive global-kw local-kw))

(methodical/defmethod events/publish-event! ::transform-create
  [_topic {transform :object}]
  (create-trigger! transform))

(methodical/defmethod events/publish-event! ::transform-update
  [_topic {transform :object}]
  (update-trigger! transform))

(methodical/defmethod events/publish-event! ::transform-delete
  [_topic {transform :object}]
  (delete-trigger! transform))
