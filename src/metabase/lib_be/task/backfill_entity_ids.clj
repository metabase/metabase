(ns metabase.lib-be.task.backfill-entity-ids
  (:require [clojurewerkz.quartzite.conversion :as conversion]
            [clojurewerkz.quartzite.jobs :as jobs]
            [clojurewerkz.quartzite.triggers :as triggers]
            [clojurewerkz.quartzite.scheduler :as scheduler]
            [clojurewerkz.quartzite.schedule.simple :as simple]
            [metabase.models.serialization :as serdes]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.task :as task]
            [metabase.util.i18n :refer [deferred-tru]]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(def ^:dynamic *batch-size* 50)
(def min-repeat-ms 1000)
(defsetting backfill-entity-ids-repeat-ms
  (deferred-tru "Frequency for running backfill entity ids job in ms.  Any value below 1000 will disable the job entirely.")
  :type       :integer
  :visibility :internal
  :audit      :never
  :default    2000)

(def failed-rows (atom #{}))

(defn add-failed-row! [id]
  (swap! failed-rows conj id))

(defn reset-failed-rows! []
  (reset! failed-rows #{}))

(defn backfill-entity-ids!-inner [model]
  (try
    (t2/with-transaction [_conn]
      (let [table-name (t2/table-name model)
            rows (t2/select model
                            {:select [:*]
                             :from table-name
                             :where (into [:and [:= :entity_id nil]]
                                          (map (fn [id] [:not [:= :id id]]))
                                          @failed-rows)
                             :limit *batch-size*})]
        (when (seq rows)
          (log/info (str "Adding entity-ids to " (count rows) " rows of " model))
          (doseq [row rows]
            (let [{:keys [id]} row]
              (try
                (t2/update! model id {:entity_id (serdes/backfill-entity-id row)})
                (catch Exception e
                  ;; If we fail to update an individual entity id, add it to the ignore list and continue.  We'll
                  ;; retry them on next sync.
                  (add-failed-row! id)
                  (log/error (str "Exception updating entity-id for " model " with id " id ":") e)))))
          true)))
    (catch Exception e
      ;; If we error outside of updating a single entity id, stop.  We'll retry on next sync.
      (log/error (str "Exception updating entity-ids for " model ":") e))))

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

(defn job-running? []
  (task/job-exists? job-key))

(declare start-job!)

(defn backfill-entity-ids! [ctx]
  (let [ctx-map (conversion/from-job-data ctx)
        model (get ctx-map "model")]
    (when-not (backfill-entity-ids!-inner model)
      (log/info "Finished backfilling entity-ids for" model)
      (task/delete-trigger! (triggers/key (model-key model)))
      (reset-failed-rows!)
      (when-let [new-model (next-model model)]
        (start-job! new-model)))))

(jobs/defjob BackfillEntityIds [ctx]
  (backfill-entity-ids! ctx))

(defn- start-job! [model]
  (cond
    (job-running?) (log/info "Not starting backfill-entity-ids task because it is already running")
    (< (backfill-entity-ids-repeat-ms) min-repeat-ms) (log/info (str "Not starting backfill-entity-ids task because repeat ms is below " min-repeat-ms))

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
                (task/schedule-task! job trigger)))))

(defmethod task/init! ::BackfillEntityIds [_]
  (start-job! initial-model))
