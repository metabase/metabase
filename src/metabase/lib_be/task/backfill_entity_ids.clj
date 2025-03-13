(ns metabase.lib-be.task.backfill-entity-ids
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.conversion :as conversion]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.models.serialization :as serdes]
   [metabase.models.setting :refer [defsetting]]
   [metabase.task :as task]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *batch-size*
  "The number of records the backfill entity ids job will process at once"
  50)
(def ^:dynamic *max-retries*
  "The number of times we will retry hashing in an attempt to find a unique hash"
  20)
(def ^:private min-repeat-ms
  "The minimum acceptable repeat rate for the backfill entity ids job"
  1000)
(defsetting backfill-entity-ids-repeat-ms
  (deferred-tru "Frequency for running backfill entity ids job in ms.  Minimum value is 1000, and any value at or below 0 will disable the job entirely.")
  :type       :integer
  :visibility :internal
  :audit      :never
  :export?    true
  :default    2000)

(defonce ^{:doc "The list of failed rows for the current backfill entity ids job stage"} failed-rows
  (atom #{}))

(defn- add-failed-row!
  "Adds an id to the failed-rows list"
  [id]
  (swap! failed-rows conj id))

(defn- reset-failed-rows!
  "Resets the failed-rows list.  Should be called after the backfill entity ids job finishes with a model."
  []
  (reset! failed-rows #{}))

(defn- backfill-entity-ids!-inner
  "Given a model, gets a batch of objects from the db and adds entity-ids"
  [model]
  (try
    (t2/with-transaction [^java.sql.Connection conn]
      (let [failed-ids @failed-rows
            id-condition (if (seq failed-ids)
                           [:not-in failed-ids]
                           [:!= 0])
            rows (t2/select model :entity_id nil :id id-condition {:limit *batch-size*})]
        (when (seq rows)
          (log/info (str "Adding entity-ids to " (count rows) " rows of " model))
          (loop [[{:keys [id] :as row} & rest :as all] rows
                 retry 0
                 savepoint (.setSavepoint conn)]
            (when row
              (let [needs-retry
                    (try
                      (t2/update! model id {:entity_id (serdes/backfill-entity-id row retry)})
                      false
                      (catch Exception e
                        (.rollback conn savepoint)
                        (if (and (some-> e
                                         ex-cause
                                         .getMessage
                                         (str/includes? " already exists"))
                                 (< retry *max-retries*))
                          (do
                            (log/info (str "Duplicate entity-id found for " model " with id " id ", retried " retry " times"))
                            true)
                          (do
                            ;; If we fail to update an individual entity id, add it to the ignore list and continue.  We'll
                            ;; retry them on next sync.
                            (add-failed-row! id)
                            (log/error (str "Exception updating entity-id for " model " with id " id))
                            (log/error e)
                            false))))]
                (if needs-retry
                  (recur all (inc retry) savepoint)
                  (recur rest 0 (.setSavepoint conn))))))
          true)))
    (catch Exception e
      ;; If we error outside of updating a single entity id, stop.  We'll retry on next sync.
      (log/error (str "Exception updating entity-ids for " model))
      (log/error e))))

(def ^:private job-key "metabase.lib-be.task.backfill-entity-ids.job")
(def ^:private database-trigger-key "metabase.lib-be.task.backfill-entity-ids.trigger.database")
(def ^:private table-trigger-key "metabase.lib-be.task.backfill-entity-ids.trigger.table")
(def ^:private field-trigger-key "metabase.lib-be.task.backfill-entity-ids.trigger.field")

(def ^:private model-key
  {:model/Database database-trigger-key
   :model/Table table-trigger-key
   :model/Field field-trigger-key})

(def ^:private next-model
  {:model/Database :model/Table
   :model/Table :model/Field})

(def ^:private initial-model :model/Database)

(comment
  ;; Deletes all entity ids for when you want to test the backfill job
  (doseq [model (set (flatten (seq next-model)))]
    (t2/update! model {} {:entity_id nil})))

(defn- job-running?
  "Checks if a backfill entity ids job is currently running"
  []
  (task/job-exists? job-key))

(declare start-job!)

(defn- backfill-entity-ids!
  "Implementation for the backfill entity ids job"
  [ctx]
  (let [ctx-map (conversion/from-job-data ctx)
        model (get ctx-map "model")]
    (when-not (backfill-entity-ids!-inner model)
      (log/info "Finished backfilling entity-ids for" model)
      (task/delete-trigger! (triggers/key (model-key model)))
      (reset-failed-rows!)
      (when-let [new-model (next-model model)]
        (start-job! new-model)))))

(jobs/defjob  ^{:doc "Adds entity-ids to databases/tables/fields that are missing them."}
  BackfillEntityIds [ctx]
  (backfill-entity-ids! ctx))

(defn- get-repeat-ms []
  (let [repeat-ms (backfill-entity-ids-repeat-ms)]
    (cond
      (<= repeat-ms 0) nil
      (< repeat-ms min-repeat-ms) (do (log/warnf "backfill-entity-ids-repeat-ms of %dms is too low, using %dms"
                                                 repeat-ms
                                                 min-repeat-ms)
                                      min-repeat-ms)
      :else repeat-ms)))

(defn- start-job!
  "Starts a backfill entity ids job for model"
  [model]
  (let [repeat-ms (get-repeat-ms)]
    (cond
      (job-running?) (log/info "Not starting backfill-entity-ids task because it is already running")
      (nil? repeat-ms) (log/info (str "Not starting backfill-entity-ids task because backfill-entity-ids-repeat-ms is " (backfill-entity-ids-repeat-ms)))

      :else (do (log/info "Starting to backfill entity-ids for" model)
                (let [job (jobs/build
                           (jobs/of-type BackfillEntityIds)
                           (jobs/using-job-data {"model" model})
                           (jobs/with-identity (jobs/key job-key)))
                      trigger (triggers/build
                               (triggers/with-identity (triggers/key (model-key model)))
                               (triggers/start-now)
                               (triggers/with-schedule
                                (simple/schedule
                                 (simple/with-interval-in-milliseconds (backfill-entity-ids-repeat-ms))
                                 (simple/repeat-forever))))]
                  (task/schedule-task! job trigger))))))

(defmethod task/init! ::BackfillEntityIds [_]
  (start-job! initial-model))
