(ns metabase.task.index-values
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.driver :as driver]
   [metabase.models.card :refer [Card]]
   [metabase.models.model-index :as model-index :refer [ModelIndex]]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util TimeZone)
   (org.quartz ObjectAlreadyExistsException)))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:unused-private-var]}
(def ^:private refreshable-states
  "States of a model index that are refreshable."
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
  (let [model-index (t2/select-one ModelIndex :id model-index-id)
        model       (when model-index
                      (t2/select-one Card :id (:model_id model-index)))]
    (if (should-deindex? model model-index)
      (u/ignore-exceptions
       (let [trigger-key (model-index-trigger-key model-index-id)]
         (task/delete-trigger! trigger-key)
         (t2/delete! ModelIndex model-index-id)))
      (model-index/add-values! model-index))))

(jobs/defjob ^{org.quartz.DisallowConcurrentExecution true
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

(defn- job-init!
  []
  (task/add-job! refresh-job))

(defmethod task/init! ::ModelIndexValues
  [_]
  (job-init!))
