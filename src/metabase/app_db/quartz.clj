(ns metabase.app-db.quartz
  "Quartz JDBC plumbing over the application DB: a `ConnectionProvider` backed by our connection pool,
  a `ClassLoadHelper` that uses our classloader, and the JDBC backend system properties."
  (:require
   [medley.core :as m]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.classloader.core :as classloader]
   [metabase.task.secure-delegate.core :as secure-delegate]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;; Optional interceptor for wrapping JDBC connections before Quartz uses them.
;; Set by tracing.quartz to add SQL-level tracing. nil means no interception.
(defonce ^:private connection-interceptor (atom nil))

(defn set-connection-interceptor!
  "Set an optional function to wrap JDBC connections before Quartz uses them.
   Called by tracing.quartz to add SQL-level tracing. Pass nil to remove."
  [f]
  (reset! connection-interceptor f))

;; Custom `ConnectionProvider` implementation that uses a dedicated connection pool for the application DB to provide
;; connections.
(defrecord ^:private ConnectionProvider []
  org.quartz.utils.ConnectionProvider
  (initialize [_])
  (getConnection [_]
    ;; get a connection from the dedicated Quartz connection pool. Quartz will close it (i.e., return it to the pool)
    ;; when it's done.
    ;;
    ;; very important! Fetch a new connection from the connection pool rather than reusing a Connection already bound
    ;; to the calling thread (e.g. toucan2's *current-connectable*) -- Quartz manages the connection's whole
    ;; lifecycle (setAutoCommit/commit/rollback/close), and its cluster locking relies on commit/rollback to release
    ;; row locks on the QRTZ_LOCKS table, so it must never share a connection with an outer transaction.
    ;;
    ;; the pool is separate from the main application DB pool so that a Quartz operation triggered by a thread inside
    ;; a `with-transaction` block can't deadlock when application code has saturated the main pool.
    (let [conn (.getConnection (mdb.connection/quartz-data-source))]
      (if-let [interceptor @connection-interceptor]
        (interceptor conn)
        conn)))
  (shutdown [_]))

(when-not *compile-files*
  (System/setProperty "org.quartz.dataSource.db.connectionProvider.class" (.getName ConnectionProvider)))

;; Quartz stores each job's class name in the app DB, and moving or renaming a job renames its class.
;; Without the old name here, the first upgraded node can't find the stored job's class, and deletes the job.
;; It does so at startup, even while an old node is running the job, then reschedules it under the new name.
;; With the old name here, upgraded nodes load the stored row under the current class.
;;
;; Quartz asks for a class by name only, so the lookup goes by class name alone.
;; The `:job-key` or `:job-key-prefix` is a label for readers.
;; No code reads it, and a test checks it against the real job keys.
;;
;; Keep an entry for good, because stored rows keep the old name.
;; The exception is a job whose key changes: remove its entry, and record the change in [[job-key-renames]].
;; A row under the old key would otherwise still load, and keep running beside the newly scheduled job.
;; Without the entry, its class can't be found and it is deleted.
(def job-history
  "The class names each renamed Quartz job has had, oldest first, so the last is its current name.
  The `:job-key` says which job an entry is for.
  A job that is scheduled under many keys has the `:job-key-prefix` that those keys share instead."
  [{:job-key        "metabase-enterprise.cache.job"
    :class-names    ["metabase_enterprise.task.cache.Cache"
                     "metabase_enterprise.cache.task.refresh_cache_configs.Cache"]}
   {:job-key        "metabase.task.IndexValues.job"
    :class-names    ["metabase.task.index_values.ModelIndexRefresh"
                     "metabase.indexed_entities.task.index_values.ModelIndexRefresh"]}
   {:job-key        "metabase.task.PersistencePrune.job"
    :class-names    ["metabase.task.persist_refresh.PersistencePrune"
                     "metabase.model_persistence.task.persist_refresh.PersistencePrune"]}
   {:job-key        "metabase.task.PersistenceRefresh.job"
    :class-names    ["metabase.task.persist_refresh.PersistenceRefresh"
                     "metabase.model_persistence.task.persist_refresh.PersistenceRefresh"]}
   {:job-key        "metabase.task.anonymous-stats.job"
    :class-names    ["metabase.task.send_anonymous_stats.SendAnonymousUsageStats"
                     "metabase.analytics.task.send_anonymous_stats.SendAnonymousUsageStats"]}
   {:job-key        "metabase.task.creator-sentiment-emails.job"
    :class-names    ["metabase.task.creator_sentiment_emails.CreatorSentimentEmail"
                     "metabase.product_feedback.task.creator_sentiment_emails.CreatorSentimentEmail"]}
   {:job-key        "metabase.task.email-remove-legacy-pulse.job"
    :class-names    ["metabase.task.email_remove_legacy_pulse.EmailRemoveLegacyPulse"
                     "metabase.pulse.task.email_remove_legacy_pulse.EmailRemoveLegacyPulse"]}
   {:job-key        "metabase.task.follow-up-emails.job"
    :class-names    ["metabase.task.follow_up_emails.FollowUpEmail"
                     "metabase.product_feedback.task.follow_up_emails.FollowUpEmail"]}
   {:job-key        "metabase.task.notification.send.job"
    :class-names    ["metabase.task.notification.SendNotification"
                     "metabase.notification.task.send.SendNotification"]}
   {:job-key        "metabase.task.on-startup-refresh-channel-cache.job"
    :class-names    ["metabase.task.refresh_slack_channel_user_cache.RefreshCacheOnStartup"
                     "metabase.channel.task.refresh_slack_channel_user_cache.RefreshCacheOnStartup"]}
   {:job-key        "metabase.task.refresh-channel-cache.job"
    :class-names    ["metabase.task.refresh_slack_channel_user_cache.RefreshCache"
                     "metabase.channel.task.refresh_slack_channel_user_cache.RefreshCache"]}
   {:job-key        "metabase.task.search-index.init.job"
    :class-names    ["metabase.task.search_index.SearchIndexInit"
                     "metabase.search.task.search_index.SearchIndexInit"]}
   {:job-key        "metabase.task.search-index.reindex.job"
    :class-names    ["metabase.task.search_index.SearchIndexReindex"
                     "metabase.search.task.search_index.SearchIndexReindex"]}
   {:job-key        "metabase.task.send-pulses.init-send-pulse-triggers.job"
    :class-names    ["metabase.task.send_pulses.InitSendPulseTriggers"
                     "metabase.pulse.task.send_pulses.InitSendPulseTriggers"]}
   {:job-key        "metabase.task.send-pulses.send-pulse.job"
    :class-names    ["metabase.task.send_pulses.SendPulse"
                     "metabase.pulse.task.send_pulses.SendPulse"]}
   {:job-key        "metabase.task.session-cleanup.job"
    :class-names    ["metabase.task.session_cleanup.SessionCleanup"
                     "metabase.session.task.session_cleanup.SessionCleanup"]}
   {:job-key        "metabase.task.sync-and-analyze.job"
    :class-names    ["metabase.task.sync_databases.SyncAndAnalyzeDatabase"
                     "metabase.sync.task.sync_databases.SyncAndAnalyzeDatabase"]}
   {:job-key        "metabase.task.task-history-cleanup.job"
    :class-names    ["metabase.task.task_history_cleanup.TaskHistoryCleanup"
                     "metabase.task_history.task.task_history_cleanup.TaskHistoryCleanup"]}
   {:job-key-prefix "metabase.task.transforms.schedule."
    :class-names    ["metabase_enterprise.transforms.schedule.RunTransforms"
                     "metabase.transforms.schedule.RunTransforms"]}
   {:job-key        "metabase.task.truncate-audit-tables.job"
    :class-names    ["metabase.task.truncate_audit_tables.TruncateAuditTables"
                     "metabase.audit_app.task.truncate_audit_tables.TruncateAuditTables"]}
   {:job-key        "metabase.task.update-field-values.job"
    :class-names    ["metabase.task.sync_databases.UpdateFieldValues"
                     "metabase.sync.task.sync_databases.UpdateFieldValues"]}
   {:job-key        "metabase.task.upgrade-checks.job"
    :class-names    ["metabase.task.upgrade_checks.CheckForNewVersions"
                     "metabase.version.task.upgrade_checks.CheckForNewVersions"]}])

(def job-key-renames
  "Past renames of job keys, each with the class the job had under the old key and under the new one.
  The row stored under an old key is deleted at startup, because its class is gone.
  The log then says why, from `:release` and `:change`.
  The `:release` is the first version with the new key, patch number included.
  It names each release line when the rename was backported, as in \"x.58.7 and x.59.3\"."
  [{:release   "x.50.0"
    :old-key   "metabase-enterprise.Caching.job"
    :old-class "metabase_enterprise.task.caching.Caching"
    :new-key   "metabase-enterprise.cache.job"
    :new-class "metabase_enterprise.task.cache.Cache"
    :change    "Renamed only, and within x.50 development, so the old key never shipped."}
   {:release   "x.52.1"
    :old-key   "metabase.task.search-index.job"
    :old-class "metabase.task.search_index.SearchIndexing"
    :new-key   "metabase.task.search-index.reindex.job"
    :new-class "metabase.task.search_index.SearchIndexReindex"
    :change    "Became durable, when a separate job for incremental updates was added beside it."}
   {:release   "x.59.1"
    :old-key   "metabase-enterprise.transforms.canceling"
    :old-class "metabase_enterprise.transforms.canceling.CancelOldTransformRuns"
    :new-key   "metabase.transforms.canceling"
    :new-class "metabase.transforms.canceling.CancelOldTransformRuns"
    :change    "Moved out of enterprise, with no change to the job."}
   {:release   "x.59.1"
    :old-key   "metabase-enterprise.transforms.jobs.timeout-job"
    :old-class "metabase_enterprise.transforms.jobs.TimeoutOldRuns"
    :new-key   "metabase.transforms.jobs.timeout-job"
    :new-class "metabase.transforms.jobs.TimeoutOldRuns"
    :change    "Moved out of enterprise, with no change to the job, which was removed in x.63."}
   {:release   "x.59.1"
    :old-key   "metabase-enterprise.transforms.timeout"
    :old-class "metabase_enterprise.transforms.timeout.TimeoutTransforms"
    :new-key   "metabase.transforms.timeout"
    :new-class "metabase.transforms.timeout.TimeoutTransforms"
    :change    "Moved out of enterprise, with no change to the job."}
   {:release   "x.60.1"
    :old-key   "metabase.task.metabot-v3.suggested-prompts-generator.job"
    :old-class "metabase_enterprise.metabot_v3.task.suggested_prompts_generator.SuggestedPromptsGenerator"
    :new-key   "metabase.task.metabot.suggested-prompts-generator.job"
    :new-class "metabase.metabot.task.suggested_prompts_generator.SuggestedPromptsGenerator"
    :change    "Moved out of enterprise with the rest of Metabot."}])

(defn job-key-rename
  "Returns the entry of [[job-key-renames]] for the old job key `job-key`, or nil when there is none."
  [job-key]
  (m/find-first #(= job-key (:old-key %)) job-key-renames))

(defn- current-class-names
  "Returns the current class name for each class name in `history`, which is shaped like [[job-history]]."
  [history]
  (u/for-map [{:keys [class-names]} history
              class-name            class-names]
    [class-name (peek class-names)]))

(def ^:private stored-class-name->current
  "The current class name for each class name in [[job-history]]."
  (current-class-names job-history))

(defn- load-class ^Class [^String class-name]
  ;; a name with no history is its own current name
  (Class/forName (get stored-class-name->current class-name class-name) true (classloader/the-classloader)))

(defrecord ^:private ClassLoadHelper []
  org.quartz.spi.ClassLoadHelper
  (initialize [_])
  (getClassLoader [_]
    (classloader/the-classloader))
  (loadClass [_ class-name]
    (load-class class-name))
  (loadClass [_ class-name _]
    (load-class class-name)))

(when-not *compile-files*
  (System/setProperty "org.quartz.scheduler.classLoadHelper.class" (.getName ClassLoadHelper)))

(defonce ^:private jdbc-property-setters
  ;; Fns of the db-type that [[set-jdbc-backend-properties!]] runs right before the scheduler initializes.
  ;; They let a module that depends on `app-db`, such as `mq`, install its own Quartz `DriverDelegate`.
  (atom []))

(defn register-jdbc-property-setter!
  "Register `f`, a fn of the app-db `db-type`, to run when Quartz's JDBC backend properties are set.
  Setters run in registration order, just before the scheduler initializes."
  [f]
  (swap! jdbc-property-setters conj f))

(defn set-jdbc-backend-properties!
  "Set the appropriate system properties needed so Quartz can connect to the JDBC backend. (Since we don't know our DB
  connection properties ahead of time, we'll need to set these at runtime rather than Setting them in the
  `quartz.properties` file.)

  Installs Metabase's per-DB `DriverDelegate` (see [[metabase.task.secure-delegate.core]]): a
  `StdJDBCDelegate`/`PostgreSQLDelegate` subclass that reads BLOB columns through a class allow-list, so
  Quartz reconstructs only the plain-data classes Metabase's job data is made of. Then runs any setters
  registered via [[register-jdbc-property-setter!]]. A registered setter that throws is logged and
  skipped so the scheduler still gets a working delegate."
  [db-type]
  (secure-delegate/install! db-type)
  (doseq [setter @jdbc-property-setters]
    (try
      (setter db-type)
      (catch Throwable t
        (log/warnf "A registered Quartz JDBC property setter failed; continuing: %s" (ex-message t))))))
