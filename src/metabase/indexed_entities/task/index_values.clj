(ns metabase.indexed-entities.task.index-values
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.driver :as driver]
   [metabase.indexed-entities.models.model-index :as model-index]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util TimeZone)
   (org.quartz ObjectAlreadyExistsException)))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:unused-private-var]}
;; Possible values for the :state field on model index records.
;; Unused, but kept here for reference.
(def ^:private model-index-states
  #{"indexed" "initial" "error" "overflow"})

(defn- should-deindex?
  "Whether to unindex the the model indexing job.
  Will deindex if the model or model_index do not exist, if the model is no longer a model, or if archived."
  [model model-index]
  (or (nil? model) (nil? model-index)
      (not= (:type model) :model)
      (:archived model)))

(defn- model-index-trigger-key
  [model-index-id]
  (triggers/key
   (format "metabase.task.IndexValues.trigger.%d" model-index-id)))

(defn- refresh-index!
  "Refresh the index on a model. Note, if the index should be removed (no longer a model, archived,
  etc, (see [[should-deindex?]])) will delete the indexing job."
  [model-index-id]
  (let [model-index (t2/select-one :model/ModelIndex :id model-index-id)
        model       (when model-index
                      (t2/select-one :model/Card :id (:model_id model-index)))]
    (if (should-deindex? model model-index)
      (u/ignore-exceptions
        (let [trigger-key (model-index-trigger-key model-index-id)]
          (task/delete-trigger! trigger-key)
          (t2/delete! :model/ModelIndex model-index-id)))
      (model-index/add-values! model-index))))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Refresh model indexed columns"}
  ModelIndexRefresh [job-context]
  (let [{:strs [model-index-id]} (qc/from-job-data job-context)]
    (refresh-index! model-index-id)))

(def ^:private refresh-model-index-key
  "Job key string for refresh job. Call `(jobs/key refresh-model-index-key)` if you need the org.quartz.JobKey
  instance."
  "metabase.task.IndexValues.job")

(def ^:private refresh-job
  (jobs/build
   (jobs/with-description "Indexed Value Refresh task")
   (jobs/of-type ModelIndexRefresh)
   (jobs/with-identity (jobs/key refresh-model-index-key))
   (jobs/store-durably)))

(defn- refresh-trigger ^org.quartz.CronTrigger [model-index]
  (triggers/build
   (triggers/with-description (format "Refresh index on model %d" (:model_id model-index)))
   (triggers/with-identity (model-index-trigger-key (:id model-index)))
   (triggers/using-job-data {"model-index-id" (u/the-id model-index)})
   (triggers/for-job (jobs/key refresh-model-index-key))
   (triggers/start-now)
   (triggers/with-schedule
    (cron/schedule
     (cron/cron-schedule (:schedule model-index))
     (cron/in-time-zone (TimeZone/getTimeZone (or (driver/report-timezone)
                                                  (qp.timezone/system-timezone-id)
                                                  "UTC")))
     (cron/with-misfire-handling-instruction-do-nothing)))))

(defn add-indexing-job
  "Public API to start indexing a model."
  [model-index]
  (let [trigger (refresh-trigger model-index)]
    (log/info (u/format-color :green "Scheduling indexing for model: %s" (:model_id model-index)))
    (try (task/add-trigger! trigger)
         (catch ObjectAlreadyExistsException _e
           (log/info (u/format-color :red "Index already present for model: %s" (:model_id model-index))))
         (catch Exception e
           (log/warnf e "Error scheduling indexing for model: %s" (:model_id model-index))))))

(defn remove-indexing-job
  "Public API to remove an indexing job on a model."
  [model-index]
  (let [trigger-key (model-index-trigger-key (:id model-index))]
    (task/delete-trigger! trigger-key)))

(defn- recreate-missing-triggers!
  "Ensure all model indexes in the database have triggers in Quartz."
  []
  (try
    (let [existing-trigger-model-index-ids (try
                                             (->> (task/job-info refresh-model-index-key)
                                                  :triggers
                                                  (keep #(get-in % [:data "model-index-id"]))
                                                  set)
                                             (catch Exception e
                                               (log/warn e "Error fetching existing triggers from Quartz, will recreate all triggers")
                                               #{}))
          missing-trigger-model-indexes (if (seq existing-trigger-model-index-ids)
                                          (t2/select :model/ModelIndex :id [:not-in existing-trigger-model-index-ids])
                                          (t2/select :model/ModelIndex))]
      (when (seq missing-trigger-model-indexes)
        (log/infof "Found %d model index(es) without triggers, recreating..."
                   (count missing-trigger-model-indexes))
        (doseq [model-index missing-trigger-model-indexes]
          (try
            (add-indexing-job model-index)
            (catch Exception e
              (log/errorf e "Error re-adding indexing job for model-index: %d" (:id model-index)))))))
    (catch Exception e
      (log/error e "Error during model index trigger recreation"))))

(defn- job-init!
  []
  (task/add-job! refresh-job)
  (recreate-missing-triggers!))

(defmethod task/init! ::ModelIndexValues
  [_]
  (job-init!))
