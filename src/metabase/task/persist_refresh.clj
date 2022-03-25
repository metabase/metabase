(ns metabase.task.persist-refresh
  (:require [metabase.task :as task]
            [clojure.tools.logging :as log]
            [clojurewerkz.quartzite.conversion :as qc]
            [clojurewerkz.quartzite.jobs :as jobs]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [clojurewerkz.quartzite.triggers :as triggers]
            [metabase.models.database :refer [Database]]
            [metabase.models.persisted-info :refer [PersistedInfo]]
            [metabase.util.cron :as cron-util]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [metabase.driver.ddl.interface :as ddl.i]
            [toucan.db :as db])
  (:import [org.quartz CronTrigger JobDetail JobKey TriggerKey]))

;; copied from task/sync_databases.clj
(defn ^:private job-context->database-id
  "Get the Database ID referred to in `job-context`."
  [job-context]
  (u/the-id (get (qc/from-job-data job-context) "db-id")))

(defn- refresh-tables!' [database-id]
  (let [database (Database database-id)
        persisted (db/select PersistedInfo :database_id database-id, :state "persisted")]
    (log/info (trs "Starting persisted model refresh task for Database {0}." database-id))
    (doseq [p persisted]
      (try
        (ddl.i/refresh! (:engine database) database p)
        (catch Exception e
          (log/info e (trs "Error refreshing persisting model with card-id {0}" (:card_id p))))))
    ;; look for any stragglers that we can try to delete
    (let [deleteable (db/select PersistedInfo :state "deleteable")
          db-id->db  (into {} (map (juxt :id identity))
                           (db/select Database :id [:in (into #{} (map :database_id) deleteable)]))]
      (doseq [d deleteable]
        (let [database (-> d :database_id db-id->db)]
          (log/info (trs "Unpersisting model with card-id {0}" (:card_id d)))
          (try
            (ddl.i/unpersist! (:engine database) database d)
            (catch Exception e
              (log/info e (trs "Error unpersisting model with card-id {0}" (:card_id d))))))))))

(defn refresh-tables! [job-context]
  (when-let [database-id (job-context->database-id job-context)]
    (refresh-tables!' database-id)))

(jobs/defjob PersistenceRefresh [job-context]
  (refresh-tables! job-context))

(def persistence-job-key "metabase.task.PersistenceRefresh.job")

(def ^:private persistence-job
  (jobs/build
   (jobs/with-description "Persisted Model refresh task")
   (jobs/of-type PersistenceRefresh)
   (jobs/with-identity (jobs/key persistence-job-key))
   (jobs/store-durably)))

(defn- trigger-key [database]
  (triggers/key (format "metabase.task.PersistenceRefresh.trigger.%d" (u/the-id database))))

(defn- trigger [database]
  (triggers/build
   (triggers/with-description (format "Refresh models for database %d" (u/the-id database)))
   (triggers/with-identity (trigger-key database))
   (triggers/using-job-data {"db-id" (u/the-id database)})
   (triggers/for-job (jobs/key persistence-job-key))
   (triggers/start-now)
   (triggers/with-schedule
     (cron/schedule
      ;; every 8 hours
      (cron/cron-schedule "0 0 0/8 * * ? *")
      (cron/with-misfire-handling-instruction-do-nothing)))))

(defn schedule-persistence-for-database
  [database]
  (let [tggr (trigger database)]
    (log/info
     (u/format-color 'green
                     "Scheduling persistence refreshes for database %d: trigger: %s"
                     (u/the-id database) (.. ^org.quartz.Trigger tggr getKey getName)))
    (task/add-trigger! tggr)))

(defn unschedule-persistence-for-database
  [database]
  (task/delete-trigger! (trigger-key database)))

(comment
  (unschedule-persistence-for-database 19)
  )

(defn- job-init
  []
  (task/add-job! persistence-job))

(defmethod task/init! ::PersistRefresh
  [_]
  (job-init))
