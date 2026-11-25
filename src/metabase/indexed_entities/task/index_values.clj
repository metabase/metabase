(ns metabase.indexed-entities.task.index-values
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.app-db.core :as mdb]
   [metabase.driver :as driver]
   [metabase.indexed-entities.db :as indexed-entities.db]
   [metabase.indexed-entities.models.model-index :as model-index]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.util TimeZone)
   (org.quartz ObjectAlreadyExistsException)))

(set! *warn-on-reflection* true)

;; Possible values for the :state field on model index records:
#_#{"indexed" "initial" "error" "overflow"}

(defn- should-deindex?
  "Whether to unindex the the model indexing job.
  Will deindex if the model or model_index do not exist, if the model is no longer a model, or if archived."
  [model model-index]
  (or (nil? model) (nil? model-index)
      (not= (:type model) :model)
      (:archived model)))

(defn- refresh-index!
  "Refresh the index on a model. Note, if the index should be removed (no longer a model, archived,
  etc, (see [[should-deindex?]])) will delete the indexing job, also when the index is gone, as with the remote sync
  worktree it was created in."
  [model-index-id]
  (let [model-index (indexed-entities.db/model-index model-index-id)
        model       (when model-index
                      (indexed-entities.db/card (:model_id model-index)))]
    (cond
      (nil? model-index)                (u/ignore-exceptions
                                          (model-index/remove-indexing-job {:id model-index-id}))
      (should-deindex? model model-index) (u/ignore-exceptions
                                            (model-index/delete-model-indexes! [model-index-id]))
      :else                             (model-index/add-values! model-index))))

(task/defjob ModelIndexRefresh
  "Refresh model indexed columns"
  {:saved-class "metabase.indexed_entities.task.index_values.ModelIndexRefresh"
   :concurrent? false}
  [job-context]
  (let [{:strs [model-index-id worktree-id]} (qc/from-job-data job-context)]
    (mdb/with-worktree-scope (mdb/worktree-scope worktree-id)
      (refresh-index! model-index-id))))

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
   (triggers/with-identity (model-index/trigger-key (:id model-index)))
   (triggers/using-job-data (cond-> {"model-index-id" (u/the-id model-index)}
                              (mdb/worktree-id) (assoc "worktree-id" (mdb/worktree-id))))
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
  "Public API to start indexing a model, in the remote sync worktree this thread works in."
  [model-index]
  (let [trigger (refresh-trigger model-index)]
    (log/info (u/format-color :green "Scheduling indexing for model: %s" (:model_id model-index)))
    (try (task/add-trigger! trigger)
         (catch ObjectAlreadyExistsException _e
           (log/info (u/format-color :red "Index already present for model: %s" (:model_id model-index))))
         (catch Exception e
           (log/warnf "Error scheduling indexing for model: %s: %s" (:model_id model-index) (ex-message e))))))

(defn- recreate-missing-triggers!
  "Ensure all model indexes in the database, those of every remote sync worktree included, have triggers in Quartz."
  []
  (try
    (let [existing-trigger-model-index-ids (try
                                             (->> (task/job-info refresh-model-index-key)
                                                  :triggers
                                                  (keep #(get-in % [:data "model-index-id"]))
                                                  set)
                                             (catch Exception e
                                               (log/warnf "Error fetching existing triggers from Quartz, will recreate all triggers: %s" (ex-message e))
                                               #{}))
          recreate! (fn []
                      (let [missing-trigger-model-indexes (if (seq existing-trigger-model-index-ids)
                                                            (indexed-entities.db/model-indexes-except existing-trigger-model-index-ids)
                                                            (indexed-entities.db/all-model-indexes))]
                        (when (seq missing-trigger-model-indexes)
                          (log/infof "Found %d model index(es) without triggers, recreating..."
                                     (count missing-trigger-model-indexes))
                          (doseq [model-index missing-trigger-model-indexes]
                            (try
                              (add-indexing-job model-index)
                              (catch Exception e
                                (log/errorf "Error re-adding indexing job for model-index: %d: %s" (:id model-index) (ex-message e))))))))]
      (mdb/do-in-each-worktree recreate!))
    (catch Exception e
      (log/errorf "Error during model index trigger recreation: %s" (ex-message e)))))

(defn- job-init!
  []
  (task/add-job! refresh-job)
  (recreate-missing-triggers!))

(defmethod task/init! ::ModelIndexValues
  [_]
  (job-init!))
