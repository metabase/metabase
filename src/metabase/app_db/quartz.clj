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

;; Quartz stores each job's class name in the app DB, and moving a job's namespace renames its class. Without the
;; old name here, the first upgraded node deletes the stored job as classless at startup, even while an old node is
;; running it, and reschedules it under the new name. With it, upgraded nodes load the stored row under the current
;; class, and the row keeps its old name, which old nodes load.
;;
;; List a move only when the job kept its key and its type name. Under a new key, the old row would keep running
;; beside the newly scheduled one, so it has to be deleted as classless. Keep entries for good: stored rows keep the
;; old name.
(def job-class-history
  "Every name a renamed Quartz job class has had, oldest first, so the last is its current name."
  [["metabase.task.upgrade_checks.CheckForNewVersions"
    "metabase.version.task.upgrade_checks.CheckForNewVersions"]
   ["metabase.task.creator_sentiment_emails.CreatorSentimentEmail"
    "metabase.product_feedback.task.creator_sentiment_emails.CreatorSentimentEmail"]
   ["metabase.task.email_remove_legacy_pulse.EmailRemoveLegacyPulse"
    "metabase.pulse.task.email_remove_legacy_pulse.EmailRemoveLegacyPulse"]
   ["metabase.task.follow_up_emails.FollowUpEmail"
    "metabase.product_feedback.task.follow_up_emails.FollowUpEmail"]
   ["metabase.task.index_values.ModelIndexRefresh"
    "metabase.indexed_entities.task.index_values.ModelIndexRefresh"]
   ["metabase.task.notification.SendNotification"
    "metabase.notification.task.send.SendNotification"]
   ["metabase.task.persist_refresh.PersistencePrune"
    "metabase.model_persistence.task.persist_refresh.PersistencePrune"]
   ["metabase.task.persist_refresh.PersistenceRefresh"
    "metabase.model_persistence.task.persist_refresh.PersistenceRefresh"]
   ["metabase.task.refresh_slack_channel_user_cache.RefreshCache"
    "metabase.channel.task.refresh_slack_channel_user_cache.RefreshCache"]
   ["metabase.task.refresh_slack_channel_user_cache.RefreshCacheOnStartup"
    "metabase.channel.task.refresh_slack_channel_user_cache.RefreshCacheOnStartup"]
   ["metabase.task.search_index.SearchIndexInit"
    "metabase.search.task.search_index.SearchIndexInit"]
   ["metabase.task.search_index.SearchIndexReindex"
    "metabase.search.task.search_index.SearchIndexReindex"]
   ["metabase.task.send_anonymous_stats.SendAnonymousUsageStats"
    "metabase.analytics.task.send_anonymous_stats.SendAnonymousUsageStats"]
   ["metabase.task.send_pulses.InitSendPulseTriggers"
    "metabase.pulse.task.send_pulses.InitSendPulseTriggers"]
   ["metabase.task.send_pulses.SendPulse"
    "metabase.pulse.task.send_pulses.SendPulse"]
   ["metabase.task.session_cleanup.SessionCleanup"
    "metabase.session.task.session_cleanup.SessionCleanup"]
   ["metabase.task.sync_databases.SyncAndAnalyzeDatabase"
    "metabase.sync.task.sync_databases.SyncAndAnalyzeDatabase"]
   ["metabase.task.sync_databases.UpdateFieldValues"
    "metabase.sync.task.sync_databases.UpdateFieldValues"]
   ["metabase.task.task_history_cleanup.TaskHistoryCleanup"
    "metabase.task_history.task.task_history_cleanup.TaskHistoryCleanup"]
   ["metabase.task.truncate_audit_tables.TruncateAuditTables"
    "metabase.audit_app.task.truncate_audit_tables.TruncateAuditTables"]
   ["metabase_enterprise.task.cache.Cache"
    "metabase_enterprise.cache.task.refresh_cache_configs.Cache"]
   ["metabase_enterprise.transforms.schedule.RunTransforms"
    "metabase.transforms.schedule.RunTransforms"]])

(defn current-class-name
  "Returns the current name of a job class stored as `stored-name`, given `history` shaped like
  [[job-class-history]]. A name `history` doesn't list is returned as is."
  [history stored-name]
  (or (some (fn [names]
              (when (some #{stored-name} names)
                (peek names)))
            history)
      stored-name))

(defn- load-class ^Class [^String class-name]
  (Class/forName (current-class-name job-class-history class-name) true (classloader/the-classloader)))

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
