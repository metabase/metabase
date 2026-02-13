(ns metabase.model-persistence.task.persist-refresh
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.events.core :as events]
   [metabase.model-persistence.models.persisted-info :as persisted-info]
   [metabase.model-persistence.settings :as model-persistence.settings]
   [metabase.query-processor.middleware.limit :as limit]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.tracing.attributes :as trace-attrs]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [potemkin.types :as p]
   [toucan2.core :as t2])
  (:import
   (java.util TimeZone)
   (org.quartz ObjectAlreadyExistsException Trigger)))

(set! *warn-on-reflection* true)

(defn- job-context->job-type
  [job-context]
  (select-keys (qc/from-job-data job-context) ["db-id" "persisted-id" "type"]))

(p/defprotocol+ Refresher
  "This protocol is just a wrapper of the ddl.interface multimethods to ease for testing. Rather than defing some
   multimethods on fake engine types, just work against this, and it will dispatch to the ddl.interface normally, or
   allow for easy to control custom behavior in tests."
  (refresh! [this database definition dataset-query]
    "Refresh a persisted model. Returns a map with :state that is :success or :error. If :state is :error, includes a
    key :error with a string message. See [[metabase.driver.ddl.interface/refresh!]] for more information.")
  (unpersist! [this database persisted-info]))

(def ^:private dispatching-refresher
  "Refresher implementation that dispatches to the multimethods in [[metabase.driver.ddl.interface]]."
  (reify Refresher
    (refresh! [_ database definition card]
      (binding [persisted-info/*allow-persisted-substitution* false]
        (let [query (limit/disable-max-results (:dataset_query card))]
          (ddl.i/refresh! (:engine database) database definition query))))
    (unpersist! [_ database persisted-info]
      (ddl.i/unpersist! (:engine database) database persisted-info))))

(defn- refresh-with-stats! [refresher database stats persisted-info]
  ;; Since this could be long running, double check state just before refreshing
  (when (contains? (persisted-info/refreshable-states) (t2/select-one-fn :state :model/PersistedInfo :id (:id persisted-info)))
    (tracing/with-span :tasks "task.persist.refresh-model" {:db/id           (u/the-id database)
                                                            :persist/card-id (:card_id persisted-info)
                                                            :persist/table   (:table_name persisted-info)}
      (log/infof "Attempting to refresh persisted model %s." (:card_id persisted-info))
      (let [card (t2/select-one :model/Card :id (:card_id persisted-info))
            definition (persisted-info/metadata->definition (:result_metadata card)
                                                            (:table_name persisted-info))
            _ (t2/update! :model/PersistedInfo (u/the-id persisted-info)
                          {:definition definition,
                           :query_hash (persisted-info/query-hash (:dataset_query card))
                           :active false,
                           :refresh_begin :%now,
                           :refresh_end nil,
                           :state "refreshing"
                           :state_change_at :%now})
            {:keys [state error]} (try
                                    (refresh! refresher database definition card)
                                    (catch Exception e
                                      (log/infof e "Error refreshing persisting model with card-id %s"
                                                 (:card_id persisted-info))
                                      {:state :error :error (ex-message e)}))]
        (t2/update! :model/PersistedInfo (u/the-id persisted-info)
                    {:active (= state :success),
                     :refresh_end :%now,
                     :state (if (= state :success) "persisted" "error")
                     :state_change_at :%now
                     :error (when (= state :error) error)})
        (if (= :success state)
          (update stats :success inc)
          (-> stats
              (update :error-details conj {:persisted-info-id (:id persisted-info)
                                           :error error})
              (update :error inc)))))))

(defn- error-details
  [results]
  (some-> results :error-details seq))

(mu/defn- publish-refresh-error-event!
  "Fire off an event that will eventually send an email to the admin if there are any errors in the persisted model
  refresh task."
  [db-id task-details]
  (try
    (let [error-details       (error-details task-details)
          error-details-by-id (m/index-by :persisted-info-id error-details)
          persisted-infos     (->> (t2/hydrate (t2/select :model/PersistedInfo :id [:in (keys error-details-by-id)])
                                               [:card :collection] :database)
                                   (map #(assoc % :error (get-in error-details-by-id [(:id %) :error]))))]
      (events/publish-event! :event/persisted-model-refresh-error
                             {:database-id     db-id
                              :persisted-infos persisted-infos
                              :trigger         (:trigger task-details)}))
    (catch Exception e
      (log/error e "Error sending persist refresh email"))))

(defn- save-task-history!
  "Create a task history entry with start, end, and duration. :task will be `task-type`, `db-id` is optional,
  and :task_details will be the result of `thunk`."
  [task-type db-id thunk]
  (task-history/with-task-history {:task            task-type
                                   :db_id           db-id
                                   :on-success-info (fn [_update-map task-details]
                                                      (let [error (error-details task-details)]
                                                        (when (and error (= "persist-refresh" task-type))
                                                          (publish-refresh-error-event! db-id task-details))
                                                        {:task_details task-details
                                                         :status       (if error :failed :success)}))}
    (thunk)))

(defn- prune-deletables!
  "Seam for tests to pass in specific deletables to drop."
  [refresher deletables]
  (when (seq deletables)
    (let [db-id->db    (m/index-by :id (t2/select :model/Database :id [:in (map :database_id deletables)]))
          unpersist-fn (fn []
                         (reduce (fn [stats persisted-info]
                                   ;; Since this could be long running, double check state just before deleting
                                   (let [current-state (t2/select-one-fn :state :model/PersistedInfo :id (:id persisted-info))
                                         card-info     (t2/select-one [:model/Card :archived :type :card_schema]
                                                                      :id (:card_id persisted-info))]
                                     (if (or (contains? (persisted-info/prunable-states) current-state)
                                             (:archived card-info)
                                             (not= (:type card-info) :model))
                                       (let [database (-> persisted-info :database_id db-id->db)]
                                         (log/infof "Unpersisting model with card-id %s" (:card_id persisted-info))
                                         (tracing/with-span :tasks "task.persist.unpersist-model" {:db/id           (:database_id persisted-info)
                                                                                                   :persist/card-id (:card_id persisted-info)}
                                           (try
                                             (unpersist! refresher database persisted-info)
                                             (when-not (= "off" current-state)
                                               (t2/delete! :model/PersistedInfo :id (:id persisted-info)))
                                             (update stats :success inc)
                                             (catch Exception e
                                               (log/infof e "Error unpersisting model with card-id %s" (:card_id persisted-info))
                                               (update stats :error inc)))))
                                       (update stats :skipped inc))))
                                 {:success 0, :error 0, :skipped 0}
                                 deletables))]
      (save-task-history! "unpersist-tables" nil unpersist-fn))))

(defn- deletable-models
  "Returns persisted info records that can be unpersisted. Will select records that have moved into a deletable state
  after a sufficient delay to ensure no queries are running against them and to allow changing mind. Also selects
  persisted info records pointing to cards that are no longer models, archived cards/models, and all records where the corresponding
  card or database has been permanently deleted."
  []
  (let [hsql {:select    [:p.*]
              :from      [[:persisted_info :p]]
              :left-join [[:report_card :c] [:= :c.id :p.card_id]]
              :where     [:or
                          [:and
                           [:in :state (persisted-info/prunable-states)]
                           ;; Buffer deletions for an hour if the
                           ;; prune job happens soon after setting state.
                           ;; 1. so that people have a chance to change their mind.
                           ;; 2. if a query is running against the cache, it doesn't get ripped out.
                           [:< :state_change_at
                            (h2x/add-interval-honeysql-form (mdb/db-type) :%now -1 :hour)]]
                          [:= :c.type "question"]
                          [:= :c.archived true]
                          ;; card_id is set to null when the corresponding card is deleted
                          [:= :p.card_id nil]]}]
    (tracing/with-span :tasks "task.persist.find-deletable" {:db/statement (trace-attrs/sanitize-sql hsql)}
      (t2/select :model/PersistedInfo hsql))))

(defn- refreshable-models
  "Returns refreshable models for a database id. Must still be models and not archived."
  [database-id]
  (let [hsql {:select    [:p.* :c.type :c.archived :c.name]
              :from      [[:persisted_info :p]]
              :left-join [[:report_card :c] [:= :c.id :p.card_id]]
              :where     [:and
                          [:= :p.database_id database-id]
                          [:in :p.state (persisted-info/refreshable-states)]
                          [:= :c.archived false]
                          [:= :c.type "model"]]}]
    (tracing/with-span :tasks "task.persist.find-refreshable" {:db/id database-id :db/statement (trace-attrs/sanitize-sql hsql)}
      (t2/select :model/PersistedInfo hsql))))

(defn- prune-all-deletable!
  "Prunes all deletable PersistInfos, should not be called from tests as
   it will orphan cache tables if refresher is replaced."
  [refresher]
  (let [deletables (deletable-models)]
    (prune-deletables! refresher deletables)))

(defn- refresh-tables!
  "Refresh tables backing the persisted models. Updates all persisted tables with that database id which are in a state
  of \"persisted\"."
  [database-id refresher]
  (log/infof "Starting persisted model refresh task for Database %s." database-id)
  (persisted-info/ready-unpersisted-models! database-id)
  (let [database  (t2/select-one :model/Database :id database-id)
        persisted (refreshable-models database-id)
        thunk     (fn []
                    (reduce (partial refresh-with-stats! refresher database)
                            {:success 0, :error 0, :trigger "Scheduled"}
                            persisted))
        {:keys [error success]} (save-task-history! "persist-refresh" database-id thunk)]
    (log/infof "Finished persisted model refresh task for Database %s with %s successes and %s errors."
               database-id success error)))

(defn- refresh-individual!
  "Refresh an individual model based on [[PersistedInfo]]."
  [persisted-info-id refresher]
  (let [persisted-info (t2/select-one :model/PersistedInfo :id persisted-info-id)
        database       (when persisted-info
                         (t2/select-one :model/Database :id (:database_id persisted-info)))]
    (if (and persisted-info database)
      (do
        (save-task-history! "persist-refresh" (u/the-id database)
                            (partial refresh-with-stats!
                                     refresher
                                     database
                                     {:success 0 :error 0, :trigger "Manual"}
                                     persisted-info))
        (log/infof "Finished updated model-id %s from persisted-info %s."
                   (:card_id persisted-info) (u/the-id persisted-info)))
      (log/infof "Unable to refresh model with card-id %s" (:card_id persisted-info)))))

(defn- refresh-job-fn!
  "Refresh tables. Gets the database id from the job context and calls `refresh-tables!'`."
  [job-context]
  (let [{:strs [type db-id persisted-id] :as _payload} (job-context->job-type job-context)]
    (case type
      "database"   (refresh-tables!     db-id        dispatching-refresher)
      "individual" (refresh-individual! persisted-id dispatching-refresher)
      (log/infof "Unknown payload type %s" type))))

(defn- prune-job-fn!
  [_job-context]
  (prune-all-deletable! dispatching-refresher))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Refresh persisted tables job"}
  PersistenceRefresh [job-context]
  (refresh-job-fn! job-context))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Remove deletable persisted tables"}
  PersistencePrune [job-context]
  (prune-job-fn! job-context))

(def ^:private refresh-job-key
  "Job key string for refresh job. Call `(jobs/key refresh-job-key)` if you need the org.quartz.JobKey
  instance."
  "metabase.task.PersistenceRefresh.job")

(def ^:private prune-job-key
  "Job key string for prune job. Call `(jobs/key prune-job-key)` if you need the org.quartz.JobKey
  instance."
  "metabase.task.PersistencePrune.job")

(def ^:private refresh-job
  (jobs/build
   (jobs/with-description "Persisted Model refresh task")
   (jobs/of-type PersistenceRefresh)
   (jobs/with-identity (jobs/key refresh-job-key))
   (jobs/store-durably)))

(def ^:private prune-job
  (jobs/build
   (jobs/with-description "Persisted Model prune task")
   (jobs/of-type PersistencePrune)
   (jobs/with-identity (jobs/key prune-job-key))
   (jobs/store-durably)))

(def ^:private prune-scheduled-trigger-key
  (triggers/key "metabase.task.PersistencePrune.scheduled.trigger"))

(def ^:private prune-once-trigger-key
  (triggers/key "metabase.task.PersistencePrune.once.trigger"))

(defn- database-trigger-key [database]
  (triggers/key (format "metabase.task.PersistenceRefresh.database.trigger.%d" (u/the-id database))))

(defn- individual-trigger-key [persisted-info]
  (triggers/key (format "metabase.task.PersistenceRefresh.individual.trigger.%d"
                        (u/the-id persisted-info))))

(defn- cron-schedule
  "Return a cron schedule that fires every `hours` hours."
  [cron-spec]
  (cron/schedule
   (cron/cron-schedule cron-spec)
   (cron/in-time-zone (TimeZone/getTimeZone (or (driver/report-timezone)
                                                (qp.timezone/system-timezone-id)
                                                "UTC")))
   (cron/with-misfire-handling-instruction-do-nothing)))

(comment
  (let [[start-hour start-minute] (map parse-long (str/split "00:00" #":"))
        hours 1]

    (if (= 24 hours)
      (format "0 %d %d * * ? *" start-minute start-hour)
      (format "0 %d %d/%d * * ? *" start-minute start-hour hours))))

(def ^:private prune-scheduled-trigger
  (triggers/build
   (triggers/with-description "Prune deletable PersistInfo once per hour")
   (triggers/with-identity prune-scheduled-trigger-key)
   (triggers/for-job (jobs/key prune-job-key))
   (triggers/start-now)
   (triggers/with-schedule
    (cron-schedule "0 0 0/1 * * ? *"))))

(def ^:private prune-once-trigger
  (triggers/build
   (triggers/with-description "Prune deletable PersistInfo now")
   (triggers/with-identity prune-once-trigger-key)
   (triggers/for-job (jobs/key prune-job-key))
   (triggers/start-now)))

(defn- database-trigger ^org.quartz.CronTrigger [database cron-spec]
  (triggers/build
   (triggers/with-description (format "Refresh models for database %d" (u/the-id database)))
   (triggers/with-identity (database-trigger-key database))
   (triggers/using-job-data {"db-id" (u/the-id database)
                             "type"  "database"})
   (triggers/for-job (jobs/key refresh-job-key))
   (triggers/start-now)
   (triggers/with-schedule
    (cron-schedule cron-spec))))

(defn- individual-trigger ^Trigger [persisted-info]
  (triggers/build
   (triggers/with-description (format "Refresh model %d: persisted-info %d"
                                      (:card_id persisted-info)
                                      (u/the-id persisted-info)))
   (triggers/with-identity (individual-trigger-key persisted-info))
   (triggers/using-job-data {"persisted-id" (u/the-id persisted-info)
                             "type"         "individual"})
   (triggers/for-job (jobs/key refresh-job-key))
   (triggers/start-now)))

(defn schedule-persistence-for-database!
  "Schedule a database for persistence refreshing."
  [database cron-spec]
  (let [trigger (database-trigger database cron-spec)]
    (log/info
     (u/format-color 'green
                     "Scheduling persistence refreshes for database %d: trigger: %s"
                     (u/the-id database) (.. trigger getKey getName)))
    (persisted-info/ready-database! (u/the-id database))
    (try (task/add-trigger! trigger)
         (catch ObjectAlreadyExistsException _e
           (log/info
            (u/format-color 'green "Persistence already present for database %d: trigger: %s"
                            (u/the-id database)
                            (.. trigger getKey getName)))))))

(defn schedule-refresh-for-individual!
  "Schedule a refresh of an individual [[PersistedInfo record]]. Done through quartz for locking purposes."
  [persisted-info]
  (let [trigger (individual-trigger persisted-info)]
    (log/info
     (u/format-color 'green
                     "Scheduling refresh for model: %d"
                     (:card_id persisted-info)))
    (try (task/add-trigger! trigger)
         (catch ObjectAlreadyExistsException _e
           (log/info
            (u/format-color :green "Persistence already present for model %d %s"
                            (:card_id persisted-info)
                            (.. trigger getKey getName)))))))
         ;; other errors?

(defn job-info-by-db-id
  "Fetch all database-ids that have a refresh job scheduled."
  []
  (some->> refresh-job-key
           task/job-info
           :triggers
           (m/index-by (comp #(get % "db-id") :data))))

(defn unschedule-persistence-for-database!
  "Stop refreshing tables for a given database. Should only be called when marking the database as not
  persisting. Tables will be left over and up to the caller to clean up."
  [database]
  (task/delete-trigger! (database-trigger-key database)))

(defn- unschedule-all-refresh-triggers!
  "Unschedule all job triggers."
  [job-key]
  (let [trigger-keys (->> (task/job-info job-key)
                          :triggers
                          (map :key))]
    (doseq [tk trigger-keys]
      (task/delete-trigger! (triggers/key tk)))))

(defn reschedule-refresh!
  "Reschedule refresh for all enabled databases. Removes all existing triggers, and schedules refresh for databases with
  `:persist-models-enabled` in the settings at
  interval [[model-persistence.settings/persisted-model-refresh-cron-schedule]]."
  []
  (let [dbs-with-persistence (filter (comp :persist-models-enabled :settings) (t2/select :model/Database))
        cron-schedule        (model-persistence.settings/persisted-model-refresh-cron-schedule)]
    (unschedule-all-refresh-triggers! refresh-job-key)
    (doseq [db dbs-with-persistence]
      (schedule-persistence-for-database! db cron-schedule))))

(defn enable-persisting!
  "Enable persisting
   - The prune job is scheduled anew.
   - Refresh jobs are added when persist is enabled on a db."
  []
  (unschedule-all-refresh-triggers! prune-job-key)
  (task/add-trigger! prune-scheduled-trigger))

(defn disable-persisting!
  "Disable persisting
   - All PersistedInfo are marked for deletion.
   - Refresh job triggers are removed.
   - Prune scheduled job trigger is removed.
   - The prune job is triggered to run immediately. "
  []
  (persisted-info/mark-for-pruning! {})
  (unschedule-all-refresh-triggers! refresh-job-key)
  (task/delete-trigger! prune-scheduled-trigger-key)
  ;; ensure we clean up marked for deletion
  (task/add-trigger! prune-once-trigger))

(defn- job-init!
  []
  (task/add-job! refresh-job))

(defmethod task/init! ::PersistRefresh
  [_]
  (job-init!)
  (reschedule-refresh!))

(defmethod task/init! ::PersistPrune
  [_]
  (task/add-job! prune-job)
  (when (model-persistence.settings/persisted-models-enabled)
    (enable-persisting!)))
