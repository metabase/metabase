(ns metabase.task.persist-refresh
  (:require [clojure.tools.logging :as log]
            [clojurewerkz.quartzite.conversion :as qc]
            [clojurewerkz.quartzite.jobs :as jobs]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [clojurewerkz.quartzite.triggers :as triggers]
            [java-time :as t]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.models.database :refer [Database]]
            [metabase.models.persisted-info :refer [PersistedInfo]]
            [metabase.models.task-history :refer [TaskHistory]]
            [metabase.public-settings :as public-settings]
            [metabase.task :as task]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db])
  (:import [org.quartz ObjectAlreadyExistsException Trigger]))

;; copied from task/sync_databases.clj
(defn ^:private job-context->database-id
  "Get the Database ID referred to in `job-context`."
  [job-context]
  (u/the-id (get (qc/from-job-data job-context) "db-id")))

(def refreshable-states
  "States of `persisted_info` records which can be refreshed."
  #{"persisted" "error"})

(defn- refresh-tables!'
  "Refresh tables backing the persisted models. Updates all persisted tables with that database id which are in a state
  of \"persisted\"."
  [database-id]
  (log/info (trs "Starting persisted model refresh task for Database {0}." database-id))
  (let [database      (Database database-id)
        ;; todo: what states are acceptable here? certainly "error". What about "refreshing"?
        persisted     (db/select PersistedInfo
                                 :database_id database-id, :state [:in refreshable-states])
        start-time    (t/zoned-date-time)
        refresh-stats (reduce (fn [stats p]
                                (try
                                  (ddl.i/refresh! (:engine database) database p)
                                  (update stats :success inc)
                                  (catch Exception e
                                    (log/info e (trs "Error refreshing persisting model with card-id {0}" (:card_id p)))
                                    (update stats :error inc))))
                              {:success 0, :error 0}
                              persisted)
        end-time      (t/zoned-date-time)]
    (log/info (trs "Starting persisted model refresh task for Database {0}." database-id))
    (db/insert! TaskHistory {:task         "persist-refresh"
                             :db_id        database-id
                             :started_at   start-time
                             :ended_at     end-time
                             :duration     (.toMillis (t/duration start-time end-time))
                             :task_details refresh-stats})
    ;; look for any stragglers that we can try to delete
    (let [deleteable (db/select PersistedInfo :state "deleteable")
          db-id->db  (when (seq deleteable)
                       (into {} (map (juxt :id identity))
                             (db/select Database :id [:in (into #{} (map :database_id) deleteable)])))]
      (when (seq deleteable)
        (let [start-time (t/zoned-date-time)
              reap-stats (reduce (fn [stats d]
                                   (let [database (-> d :database_id db-id->db)]
                                     (log/info (trs "Unpersisting model with card-id {0}" (:card_id d)))
                                     (try
                                       (ddl.i/unpersist! (:engine database) database d)
                                       (db/delete! PersistedInfo :id (u/the-id d))
                                       (update stats :success inc)
                                       (catch Exception e
                                         (log/info e (trs "Error unpersisting model with card-id {0}" (:card_id d)))
                                         (update stats :error inc)))))
                                 {:success 0, :error 0}
                                 deleteable)
              end-time   (t/zoned-date-time)]
          (db/insert! TaskHistory {:task         "unpersist-tables"
                                   :started_at   start-time
                                   :ended_at     end-time
                                   :duration     (.toMillis (t/duration start-time end-time))
                                   :task_details reap-stats}))))))

(defn- refresh-tables!
  "Refresh tables. Gets the database id from the job context and calls `refresh-tables!'`."
  [job-context]
  (when-let [database-id (job-context->database-id job-context)]
    (refresh-tables!' database-id)))

(jobs/defjob PersistenceRefresh [job-context]
  (refresh-tables! job-context))

(def persistence-job-key
  "Job key string for persistence job. Call `(jobs/key persistence-job-key)` if you need the org.quartz.JobKey
  instance."
  "metabase.task.PersistenceRefresh.job")

(def ^:private persistence-job
  (jobs/build
   (jobs/with-description "Persisted Model refresh task")
   (jobs/of-type PersistenceRefresh)
   (jobs/with-identity (jobs/key persistence-job-key))
   (jobs/store-durably)))

(defn- trigger-key [database]
  (triggers/key (format "metabase.task.PersistenceRefresh.trigger.%d" (u/the-id database))))

(defn- cron-schedule
  "Return a cron schedule that fires every `hours` hours."
  [hours]
  (cron/schedule
   ;; every 8 hours
   (cron/cron-schedule (if (= hours 24)
                         ;; hack: scheduling for midnight UTC but this does raise the issue of anchor time
                         "0 0 0 * * ? *"
                         (format "0 0 0/%d * * ? *" hours)))
   (cron/with-misfire-handling-instruction-do-nothing)))

(defn- trigger [database interval-hours]
  (triggers/build
   (triggers/with-description (format "Refresh models for database %d" (u/the-id database)))
   (triggers/with-identity (trigger-key database))
   (triggers/using-job-data {"db-id" (u/the-id database)})
   (triggers/for-job (jobs/key persistence-job-key))
   (triggers/start-now)
   (triggers/with-schedule
     (cron-schedule interval-hours))))

(defn schedule-persistence-for-database
  "Schedule a database for persistence refreshing."
  [database interval-hours]
  (let [tggr (trigger database interval-hours)]
    (log/info
     (u/format-color 'green
                     "Scheduling persistence refreshes for database %d: trigger: %s"
                     (u/the-id database) (.. ^Trigger tggr getKey getName)))
    (try (task/add-trigger! tggr)
         (catch ObjectAlreadyExistsException _e
           (log/info
            (u/format-color 'green "Persistence already present for database %d: trigger: %s"
                            (u/the-id database)
                            (.. ^Trigger tggr getKey getName)))))))

(defn unschedule-persistence-for-database
  "Stop refreshing tables for a given database. Should only be called when marking the database as not
  persisting. Tables will be left over and up to the caller to clean up."
  [database]
  (task/delete-trigger! (trigger-key database)))

(defn unschedule-all-triggers
  "Unschedule all database persisted model refresh triggers."
  []
  (let [trigger-keys (->> (task/job-info persistence-job-key)
                          :triggers
                          (map :key))]
    (doseq [tk trigger-keys]
      (task/delete-trigger! (triggers/key tk)))))

(defn reschedule-refresh
  "Reschedule refresh for all enabled databases. Removes all existing triggers, and schedules refresh for databases with
  `:persist-models-enabled` in the options at interval [[public-settings/persisted-model-refresh-interval-hours]]."
  []
  (let [dbs-with-persistence (filter (comp :persist-models-enabled :options) (Database))
        interval-hours       (public-settings/persisted-model-refresh-interval-hours)]
    (unschedule-all-triggers)
    (doseq [db dbs-with-persistence]
      (schedule-persistence-for-database db interval-hours))))

(defn- job-init
  []
  (task/add-job! persistence-job))

(defmethod task/init! ::PersistRefresh
  [_]
  (job-init)
  (reschedule-refresh))
