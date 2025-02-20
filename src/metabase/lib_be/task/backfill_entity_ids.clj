(ns metabase.lib-be.task.backfill-entity-ids
  (:require [clojurewerkz.quartzite.conversion :as conversion]
            [clojurewerkz.quartzite.jobs :as jobs]
            [clojurewerkz.quartzite.triggers :as triggers]
            [clojurewerkz.quartzite.scheduler :as scheduler]
            [clojurewerkz.quartzite.schedule.simple :as simple]
            [metabase.models.serialization :as serdes]
            [metabase.task :as task]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(def ^:dynamic *repeat-ms* 2000)
(def ^:dynamic *batch-size* 50)

(defn backfill-entity-ids!-inner [model]
  (try
    (t2/with-transaction [_conn]
      (let [table-name (t2/table-name model)
            rows (t2/select model
                            {:select [:*]
                             :from table-name
                             :where [:= :entity_id nil]
                             :limit *batch-size*})]
        (when (seq rows)
          (log/info (str "Updating " (count rows) " rows of " model))
          (doseq [row rows]
            (t2/update! model (:id row) {:entity_id (serdes/backfill-entity-id row)}))
          true)))
    (catch Exception e
      ;; On exception, log the error and retry.  Presumably, if there is a networking hiccup and we lose access to the
      ;; db for a time while bckfilling, we want to continue backfilling as soon as we get db access back.
      (log/error (str "Exception updating " model ": " (.getMessage e)))
      true)))

(def ^:private backfill-entity-ids-job-key "metabase.lib-be.task.backfill-entity-ids.job")
(def ^:private backfill-entity-ids-database-trigger-key "metabase.lib-be.task.backfill-entity-ids.trigger.database")
(def ^:private backfill-entity-ids-table-trigger-key "metabase.lib-be.task.backfill-entity-ids.trigger.table")
(def ^:private backfill-entity-ids-field-trigger-key "metabase.lib-be.task.backfill-entity-ids.trigger.field")

(def ^:private model-key
  {:model/Database backfill-entity-ids-database-trigger-key
   :model/Table backfill-entity-ids-table-trigger-key
   :model/Field backfill-entity-ids-field-trigger-key})

(def ^:private next-model
  {:model/Database :model/Table
   :model/Table :model/Field})

(def ^:private initial-model :model/Database)

(comment
  ;; Deletes all entity ids for when you want to test the backfill job
  (doseq [model (set (flatten (seq next-model)))]
    (t2/update! model {} {:entity_id nil})))

(declare start-job!)

(defn backfill-entity-ids! [ctx]
  (let [ctx-map (conversion/from-job-data ctx)
        model (ctx-map "model")]
    (when-not (backfill-entity-ids!-inner model)
      (log/info "Finished updating " model)
      (task/delete-trigger! (triggers/key (model-key model)))
      (when-let [new-model (next-model model)]
        (start-job! new-model)))))

(jobs/defjob BackfillEntityIds [ctx]
  (backfill-entity-ids! ctx))

(defn- start-job! [model]
  (log/info "Starting to update " model)
  (let [job (jobs/build
              (jobs/of-type BackfillEntityIds)
              (jobs/using-job-data {"model" model})
              (jobs/with-identity (jobs/key backfill-entity-ids-job-key)))
        trigger (triggers/build
                  (triggers/with-identity (triggers/key (model-key model)))
                  (triggers/start-now)
                  (triggers/with-schedule
                    (simple/schedule
                      (simple/with-interval-in-milliseconds *repeat-ms*)
                      (simple/repeat-forever))))]
    (task/schedule-task! job trigger)))

(defmethod task/init! ::BackfillEntityIds [_]
  (start-job! initial-model))
