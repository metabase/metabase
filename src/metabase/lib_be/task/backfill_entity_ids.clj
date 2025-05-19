(ns metabase.lib-be.task.backfill-entity-ids
  (:require
   [clojurewerkz.quartzite.conversion :as conversion]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.models.serialization :as serdes]
   [metabase.settings.core :refer [defsetting]]
   [metabase.task.core :as task]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *batch-size*
  "The number of records the backfill entity ids job will process at once"
  50)
(def ^:dynamic *max-retries*
  "The number of times we will retry hashing in an attempt to find a unique hash"
  1000)
(def ^:dynamic *retry-batch-size*
  "The number of entity ids we will try per iteration of retries"
  50)
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

(defn- retry-insert-entity-ids!
  "Searches for a unique entity-id for row and updates row once found.  Returns an exception if the update fails,
  returns :not-found if it fails to find a unique entity-id, and returns nil on success.

  This searches for entity-ids in batches to cut down on db calls."
  [model {:keys [id] :as row} ^java.sql.Connection conn savepoint retry]
  (if (> retry *max-retries*)
    (do (log/info "Failed to find unique entity-id for " model " with id " id " after " retry " retries")
        :not-found)
    (let [end-retry-count (+ retry *retry-batch-size*)
          entity-ids (for [i (range retry end-retry-count)]
                       (serdes/backfill-entity-id row i))
          used-entity-ids (t2/select-fn-set :entity_id model :entity_id [:in entity-ids])
          next-entity-id (some #(and (not (contains? used-entity-ids %))
                                     %)
                               entity-ids)]
      (if next-entity-id
        (try
          (log/info (str "Found unique entity-id for " model " with id " id " in retry batch starting at " retry))
          (t2/update! model id {:entity_id next-entity-id})
          nil
          (catch Exception e
            (.rollback conn savepoint)
            e))
        (do (log/info (str "No unique entity-ids found for " model " with id " id " from increment " retry " to increment " end-retry-count))
            (recur model row conn savepoint end-retry-count))))))

(defn- backfill-entity-ids!-inner
  "Given a model, gets a batch of objects from the db and adds entity-ids. Returns whether there is more rows to
  backfill."
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
          (doseq [{:keys [id] :as row} rows]
            (let [savepoint (.setSavepoint conn)
                  new-entity-id (serdes/backfill-entity-id row)
                  failure
                  (try
                    (t2/update! model id {:entity_id new-entity-id})
                    nil
                    (catch Exception e
                      (.rollback conn savepoint)
                      (if (t2/select-one model :entity_id new-entity-id)
                        (do
                          (log/info (str "Duplicate entity-id found for " model " with id " id))
                          (retry-insert-entity-ids! model row conn savepoint 1))
                        e)))]
              (when failure
                ;; If we fail to update an individual entity id, add it to the ignore list and continue.  We'll
                ;; retry them on next sync.
                (add-failed-row! id)
                (when (instance? Exception failure)
                  (log/error (str "Exception updating entity-id for " model " with id " id))
                  (log/error failure)))))
          true)))
    (catch Exception e
      (log/error (str "Exception updating entity-ids for " model))
      (log/error e)
      true)))

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

;; this var is only used in temporarily commented-out code, so the linter complains
#_{:clj-kondo/ignore [:unused-private-var]}
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

(task/defjob  ^{:doc "Adds entity-ids to databases/tables/fields that are missing them."}
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
  ;; job is currently disabled, see SEM-319 in linear
  #_(start-job! initial-model))
