(ns metabase.lib-be.task.backfill-entity-ids
  (:require
   [clojurewerkz.quartzite.conversion :as conversion]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [medley.core :as m]
   [metabase.models.serialization :as serdes]
   [metabase.settings.core :refer [defsetting]]
   [metabase.task :as task]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *drain-batch-size*
  "The number of records the drain entity ids job will process at once"
  60)
(def ^:dynamic *backfill-batch-size*
  "The number of records the backfill entity ids job will process at once.  Defaults to slightly smaller than
  *drain-batch-size* so that if the user adds a few entities to the cache, the entire thing will still drain in one
  batch."
  50)
(def ^:private min-repeat-ms
  "The minimum acceptable repeat rate for the backfill entity ids job"
  1000)
(defsetting backfill-entity-ids-repeat-ms
  (deferred-tru "Frequency for running backfill entity ids and drain entity ids jobs in ms.  Minimum value is 1000, and any value at or below 0 will disable the job entirely.")
  :type       :integer
  :visibility :internal
  :audit      :never
  :export?    true
  :default    3000)

(defn- get-rows-to-drain
  "Fetches the next *drain-batch-size* rows from serdes/entity-id-cache"
  []
  (->> (for [[model inner] @serdes/entity-id-cache
             [id entity-id] inner]
         [model id @entity-id])
       (take *drain-batch-size*)))

(defn- backfill-entity-ids!-inner
  "Given a model, gets a batch of objects from the db and adds entity-ids.  Returns whether there is more rows to backfill."
  [model]
  (try
    (if (empty? (get-rows-to-drain))
      (let [new-rows (t2/select model :entity_id nil {:limit (if (= model :model/Field)
                                                               ;; Backfill fields one at a time because we cache all
                                                               ;; fields from a given table at once
                                                               1
                                                               *backfill-batch-size*)})]
        (log/info "Backfill: Added " (count new-rows) " rows of " model " to the entity-id cache")
        (seq new-rows))
      true)
    (catch Exception e
      (log/error e (str "Backfill: Exception fetching entity-ids for " model)))))

(defn- add-entity-id!
  "Adds an entity-id to the model with a given id.  Returns [model id] on success and nil on failure."
  [^java.sql.Connection conn model id entity-id]
  (let [savepoint (.setSavepoint conn)]
    (try
      (t2/update! (t2/table-name model) id {:entity_id entity-id})
      [model id]
      (catch Exception e
        (.rollback conn savepoint)
        (log/error e (str "Drain: Exception updating entity-id for " model " with id " id))
        nil))))

(defn- drain-entity-ids!
  "Fetches *drain-batch-size* rows from serdes/entity-id-cache, writes those entity-ids into the db, and then removes
  those rows from the cache."
  []
  (t2/with-transaction [conn]
    (let [vals (get-rows-to-drain)
          successes (into #{} (keep #(apply add-entity-id! conn %)) vals)]
      (when (seq vals)
        (swap! serdes/entity-id-cache #(reduce m/dissoc-in % successes))
        (log/info "Drain: Updated entity ids for " (count vals) " rows")))))

(def ^:private backfill-job-key "metabase.lib-be.task.backfill-entity-ids.job")
(def ^:private backfill-database-trigger-key "metabase.lib-be.task.backfill-entity-ids.trigger.database")
(def ^:private backfill-table-trigger-key "metabase.lib-be.task.backfill-entity-ids.trigger.table")
(def ^:private backfill-field-trigger-key "metabase.lib-be.task.backfill-entity-ids.trigger.field")
(def ^:private backfill-card-trigger-key "metabase.lib-be.task.backfill-entity-ids.trigger.card")
(def ^:private drain-job-key "metabase.lib-be.task.drain-entity-ids.job")
(def ^:private drain-trigger-key "metabase.lib-be.task.drain-entity-ids.trigger")

(def ^:private model-key
  {:model/Database backfill-database-trigger-key
   :model/Table backfill-table-trigger-key
   :model/Field backfill-field-trigger-key
   :model/Card backfill-card-trigger-key})

(def ^:private next-model
  {:model/Database :model/Table
   :model/Table :model/Field
   :model/Field :model/Card})

(def ^:private initial-model :model/Database)

(comment
  ;; Deletes all entity ids for when you want to test the backfill job
  (doseq [model (set (flatten (seq next-model)))]
    (t2/update! (t2/table-name model) {} {:entity_id nil})))

(defn- backfill-job-running?
  "Checks if a backfill entity ids job is currently running"
  []
  (task/job-exists? backfill-job-key))

(declare start-backfill-job!)

(defn- backfill-entity-ids!
  "Implementation for the backfill entity ids job"
  [ctx]
  (let [ctx-map (conversion/from-job-data ctx)
        model (get ctx-map "model")]
    (when-not (backfill-entity-ids!-inner model)
      (log/info "Backfill: Finished backfilling entity-ids for" model)
      (task/delete-task! (jobs/key backfill-job-key) (triggers/key (model-key model)))
      (when-let [new-model (next-model model)]
        (start-backfill-job! new-model)))))

(task/defjob  ^{:doc "Selects batches of dbs/tables/fields to add them to the cache and backfill queue."}
  BackfillEntityIds [ctx]
  (backfill-entity-ids! ctx))

(task/defjob ^{:doc "Drains the entity-id cache and updates the db with the new entity ids"}
  DrainEntityIds [_ctx]
  (drain-entity-ids!))

(defn- get-repeat-ms
  "Gets the desired repeat ms for the backfill and drain jobs.  Nil means those jobs are disabled."
  []
  (let [repeat-ms (backfill-entity-ids-repeat-ms)]
    (cond
      (<= repeat-ms 0) nil
      (< repeat-ms min-repeat-ms) (do (log/warnf "backfill-entity-ids-repeat-ms of %dms is too low, using %dms"
                                                 repeat-ms
                                                 min-repeat-ms)
                                      min-repeat-ms)
      :else repeat-ms)))

(defn- start-drain-job!
  "Starts a drain entity ids job"
  []
  (let [repeat-ms (get-repeat-ms)]
    (cond
      (nil? repeat-ms) (log/info (str "Not starting backfill-entity-ids drain task because backfill-entity-ids-repeat-ms is " (backfill-entity-ids-repeat-ms)))

      :else (do (log/info "Drain: Starting to drain entity-ids")
                (let [job (jobs/build
                           (jobs/of-type DrainEntityIds)
                           (jobs/with-identity (jobs/key drain-job-key)))
                      trigger (triggers/build
                               (triggers/with-identity (triggers/key drain-trigger-key))
                               (triggers/start-now)
                               (triggers/with-schedule
                                (simple/schedule
                                 (simple/with-interval-in-milliseconds repeat-ms)
                                 (simple/repeat-forever))))]
                  (task/schedule-task! job trigger))))))

(defn- start-backfill-job!
  "Starts a backfill entity ids job for model"
  [model]
  (let [repeat-ms (get-repeat-ms)]
    (cond
      (backfill-job-running?) (log/info "Not starting backfill-entity-ids backfill task because it is already running")
      (nil? repeat-ms) (log/info (str "Not starting backfill-entity-ids backfill task because backfill-entity-ids-repeat-ms is " (backfill-entity-ids-repeat-ms)))

      :else (do (log/info "Backfill: Starting to backfill entity-ids for" model)
                (let [job (jobs/build
                           (jobs/of-type BackfillEntityIds)
                           (jobs/using-job-data {"model" model})
                           (jobs/with-identity (jobs/key backfill-job-key)))
                      trigger (triggers/build
                               (triggers/with-identity (triggers/key (model-key model)))
                               (triggers/start-now)
                               (triggers/with-schedule
                                (simple/schedule
                                 (simple/with-interval-in-milliseconds repeat-ms)
                                 (simple/repeat-forever))))]
                  (task/schedule-task! job trigger))))))

(defmethod task/init! ::BackfillEntityIds [_]
  (start-backfill-job! initial-model))

(defmethod task/init! ::DrainEntityIds [_]
  (start-drain-job!))
