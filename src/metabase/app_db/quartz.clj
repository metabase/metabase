(ns metabase.app-db.quartz
  "Quartz JDBC plumbing over the application DB: a `ConnectionProvider` backed by our connection pool,
  a `ClassLoadHelper` that uses our classloader, and the JDBC backend system properties."
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.classloader.core :as classloader]
   [metabase.task.secure-delegate.core :as secure-delegate]
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

;; Quartz stores each job's class name in the app DB, and moving a job's namespace or renaming its type renames
;; its class. Without the old name here, the first upgraded node deletes the stored job as classless at startup,
;; even while an old node is running it, and reschedules it under the new name. With it, upgraded nodes load the
;; stored row under the current class.
;;
;; Each entry is keyed by the job's key, to record which job the names belong to, and lists the names the class
;; has had under that key. The lookup goes by class name alone, because Quartz asks for a class by name only. So
;; when a job's key changes, remove its entry: a row under the old key would otherwise still load, and keep running
;; beside the newly scheduled job. Without the entry the row is deleted as classless. Otherwise keep entries for
;; good: stored rows keep the old name.
;;
;; Job keys renamed in the past, to help explain a stored row under a key no job uses.
;; Add to it when a key changes, with the release, each key above the class it had, and how the job changed:
;;
;;   0.50  old  metabase-enterprise.Caching.job
;;              metabase_enterprise.task.caching.Caching
;;         new  metabase-enterprise.cache.job
;;              metabase_enterprise.task.cache.Cache
;;         > renamed only, and within 0.50 development, so the old key never shipped
;;
;;   0.52  old  metabase.task.search-index.job
;;              metabase.task.search_index.SearchIndexing
;;         new  metabase.task.search-index.reindex.job
;;              metabase.task.search_index.SearchIndexReindex
;;         > became durable, when a separate job for incremental updates was added beside it
;;
;;   0.59  old  metabase-enterprise.transforms.canceling
;;              metabase_enterprise.transforms.canceling.CancelOldTransformRuns
;;         new  metabase.transforms.canceling
;;              metabase.transforms.canceling.CancelOldTransformRuns
;;         > moved out of enterprise, with no change to the job
;;
;;   0.59  old  metabase-enterprise.transforms.jobs.timeout-job
;;              metabase_enterprise.transforms.jobs.TimeoutOldRuns
;;         new  metabase.transforms.jobs.timeout-job
;;              metabase.transforms.jobs.TimeoutOldRuns
;;         > moved out of enterprise, with no change to the job, which was removed in 0.63
;;
;;   0.59  old  metabase-enterprise.transforms.timeout
;;              metabase_enterprise.transforms.timeout.TimeoutTransforms
;;         new  metabase.transforms.timeout
;;              metabase.transforms.timeout.TimeoutTransforms
;;         > moved out of enterprise, with no change to the job
;;
;;   0.60  old  metabase.task.metabot-v3.suggested-prompts-generator.job
;;              metabase_enterprise.metabot_v3.task.suggested_prompts_generator.SuggestedPromptsGenerator
;;         new  metabase.task.metabot.suggested-prompts-generator.job
;;              metabase.metabot.task.suggested_prompts_generator.SuggestedPromptsGenerator
;;         > moved out of enterprise with the rest of Metabot
(def job-history
  "Every name each renamed Quartz job's class has had, by the job's key, oldest first, so the last is its
  current name."
  {;; the key's stem is itself a job key, whose string form starts with its group
   "DEFAULT.metabase-enterprise.semantic-search.indexer.job"
   ["metabase_enterprise.semantic_search.task.indexer.SemanticSearchIndexer"
    "metabase_enterprise.search.semantic.task.indexer.SemanticSearchIndexer"]
   "metabase-enterprise.cache.job"
   ["metabase_enterprise.task.cache.Cache"
    "metabase_enterprise.cache.task.refresh_cache_configs.Cache"]
   "metabase-enterprise.entity-retrieval.sync.job"
   ["metabase_enterprise.entity_retrieval.task.sync.OsiAiContextSync"
    "metabase_enterprise.search.entity_retrieval.task.sync.OsiAiContextSync"]
   "metabase.task.IndexValues.job"
   ["metabase.task.index_values.ModelIndexRefresh"
    "metabase.indexed_entities.task.index_values.ModelIndexRefresh"]
   "metabase.task.PersistencePrune.job"
   ["metabase.task.persist_refresh.PersistencePrune"
    "metabase.model_persistence.task.persist_refresh.PersistencePrune"]
   "metabase.task.PersistenceRefresh.job"
   ["metabase.task.persist_refresh.PersistenceRefresh"
    "metabase.model_persistence.task.persist_refresh.PersistenceRefresh"]
   "metabase.task.anonymous-stats.job"
   ["metabase.task.send_anonymous_stats.SendAnonymousUsageStats"
    "metabase.analytics.task.send_anonymous_stats.SendAnonymousUsageStats"]
   "metabase.task.creator-sentiment-emails.job"
   ["metabase.task.creator_sentiment_emails.CreatorSentimentEmail"
    "metabase.product_feedback.task.creator_sentiment_emails.CreatorSentimentEmail"]
   "metabase.task.email-remove-legacy-pulse.job"
   ["metabase.task.email_remove_legacy_pulse.EmailRemoveLegacyPulse"
    "metabase.pulse.task.email_remove_legacy_pulse.EmailRemoveLegacyPulse"]
   "metabase.task.follow-up-emails.job"
   ["metabase.task.follow_up_emails.FollowUpEmail"
    "metabase.product_feedback.task.follow_up_emails.FollowUpEmail"]
   "metabase.task.notification.send.job"
   ["metabase.task.notification.SendNotification"
    "metabase.notification.task.send.SendNotification"]
   "metabase.task.on-startup-refresh-channel-cache.job"
   ["metabase.task.refresh_slack_channel_user_cache.RefreshCacheOnStartup"
    "metabase.channel.task.refresh_slack_channel_user_cache.RefreshCacheOnStartup"]
   "metabase.task.refresh-channel-cache.job"
   ["metabase.task.refresh_slack_channel_user_cache.RefreshCache"
    "metabase.channel.task.refresh_slack_channel_user_cache.RefreshCache"]
   "metabase.task.search-index.init.job"
   ["metabase.task.search_index.SearchIndexInit"
    "metabase.search.task.search_index.SearchIndexInit"]
   "metabase.task.search-index.reindex.job"
   ["metabase.task.search_index.SearchIndexReindex"
    "metabase.search.task.search_index.SearchIndexReindex"]
   "metabase.task.semantic-index-cleanup.job"
   ["metabase_enterprise.semantic_search.task.index_cleanup.SemanticIndexCleanup"
    "metabase_enterprise.search.semantic.task.index_cleanup.SemanticIndexCleanup"]
   "metabase.task.semantic-index-repair.job"
   ["metabase_enterprise.semantic_search.task.index_repair.SemanticIndexRepair"
    "metabase_enterprise.search.semantic.task.index_repair.SemanticIndexRepair"]
   "metabase.task.semantic-metric-collector.job"
   ["metabase_enterprise.semantic_search.task.metric_collector.SemanticMetricCollector"
    "metabase_enterprise.search.semantic.task.metric_collector.SemanticMetricCollector"]
   "metabase.task.semantic-search.usage-trimmer.job"
   ["metabase_enterprise.semantic_search.task.usage_trimmer.SemanticSearchUsageTrimmer"
    "metabase_enterprise.search.semantic.task.usage_trimmer.SemanticSearchUsageTrimmer"]
   "metabase.task.send-pulses.init-send-pulse-triggers.job"
   ["metabase.task.send_pulses.InitSendPulseTriggers"
    "metabase.pulse.task.send_pulses.InitSendPulseTriggers"]
   "metabase.task.send-pulses.send-pulse.job"
   ["metabase.task.send_pulses.SendPulse"
    "metabase.pulse.task.send_pulses.SendPulse"]
   "metabase.task.session-cleanup.job"
   ["metabase.task.session_cleanup.SessionCleanup"
    "metabase.session.task.session_cleanup.SessionCleanup"]
   "metabase.task.sync-and-analyze.job"
   ["metabase.task.sync_databases.SyncAndAnalyzeDatabase"
    "metabase.sync.task.sync_databases.SyncAndAnalyzeDatabase"]
   "metabase.task.task-history-cleanup.job"
   ["metabase.task.task_history_cleanup.TaskHistoryCleanup"
    "metabase.task_history.task.task_history_cleanup.TaskHistoryCleanup"]
   ;; There is one job per transform job, so this is the prefix their keys share. Nothing looks an entry up by
   ;; its key, so a prefix works here.
   "metabase.task.transforms.schedule."
   ["metabase_enterprise.transforms.schedule.RunTransforms"
    "metabase.transforms.schedule.RunTransforms"]
   "metabase.task.truncate-audit-tables.job"
   ["metabase.task.truncate_audit_tables.TruncateAuditTables"
    "metabase.audit_app.task.truncate_audit_tables.TruncateAuditTables"]
   "metabase.task.update-field-values.job"
   ["metabase.task.sync_databases.UpdateFieldValues"
    "metabase.sync.task.sync_databases.UpdateFieldValues"]
   "metabase.task.upgrade-checks.job"
   ["metabase.task.upgrade_checks.CheckForNewVersions"
    "metabase.version.task.upgrade_checks.CheckForNewVersions"]})

(defn current-class-name
  "Returns the current name of a job class stored as `stored-name`, given `history` shaped like [[job-history]].
  A name `history` doesn't list is returned as is."
  [history stored-name]
  (or (some (fn [class-names]
              (when (some #{stored-name} class-names)
                (peek class-names)))
            (vals history))
      stored-name))

(defn- load-class ^Class [^String class-name]
  (Class/forName (current-class-name job-history class-name) true (classloader/the-classloader)))

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
