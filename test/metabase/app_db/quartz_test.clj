(ns metabase.app-db.quartz-test
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.connection-pool-setup :as mdb.connection-pool-setup]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.quartz :as mdb.quartz]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [rewrite-clj.zip :as z]
   [toucan2.connection :as t2.conn])
  (:import
   (com.mchange.v2.c3p0 DataSources)
   (java.sql Connection)
   (org.quartz.utils ConnectionProvider)))

(set! *warn-on-reflection* true)

(defn- h2-data-source ^javax.sql.DataSource [db-name]
  (mdb.data-source/raw-connection-string->DataSource (str "jdbc:h2:mem:" db-name ";DB_CLOSE_DELAY=-1")))

(deftest getConnection-ignores-bound-connection-test
  (testing "the provider fetches a fresh connection even when toucan2's *current-connectable* is bound to a Connection"
    (let [data-source (h2-data-source "quartz-provider-test")
          app-db      (mdb.connection/application-db :h2 data-source)]
      (binding [mdb.connection/*application-db* app-db]
        (with-open [^Connection outer (.getConnection data-source)]
          (binding [t2.conn/*current-connectable* outer]
            (let [^ConnectionProvider provider (mdb.quartz/->ConnectionProvider)]
              (with-open [^Connection conn (.getConnection provider)]
                (is (instance? Connection conn))
                (is (not (identical? outer conn))
                    "Quartz must never reuse the Connection bound to the calling thread")
                ;; also guard against a *wrapper* around the bound connection (as the old non-closeable-proxy
                ;; approach used): unwrapping must not lead back to the bound connection
                (is (not (identical? outer (.unwrap conn Connection)))
                    "the Quartz connection must be a different physical connection, not a wrapper around the bound one"))
              (testing "closing the Quartz connection must not close the bound connection"
                (is (not (.isClosed outer)))))))))))

(deftest no-deadlock-when-main-pool-saturated-test
  (testing "a Quartz operation from a thread holding the main pool's last connection completes (UXW-307)"
    (let [orig-props @#'mdb.connection-pool-setup/application-db-connection-pool-props]
      (with-redefs-fn {#'mdb.connection-pool-setup/application-db-connection-pool-props
                       (fn []
                         (assoc (orig-props)
                                "maxPoolSize"     1
                                "minPoolSize"     1
                                "initialPoolSize" 1
                                ;; if the fix ever regresses, fail fast with a checkout exception instead of
                                ;; hanging the test until the deref timeout below
                                "checkoutTimeout" 3000))}
        (fn []
          (let [data-source (h2-data-source "quartz-deadlock-test")
                app-db      (mdb.connection/application-db :h2 data-source :create-pool? true)]
            (try
              (binding [mdb.connection/*application-db* app-db]
                ;; saturate the main pool by checking out its only connection...
                (with-open [^Connection main-conn (.getConnection ^javax.sql.DataSource app-db)]
                  ;; ...and simulate being inside a `with-transaction` block on it
                  (binding [t2.conn/*current-connectable* main-conn]
                    (let [^ConnectionProvider provider (mdb.quartz/->ConnectionProvider)
                          result                       (future
                                                         (with-open [^Connection conn (.getConnection provider)]
                                                           (with-open [stmt (.createStatement conn)]
                                                             (with-open [rs (.executeQuery stmt "SELECT 1")]
                                                               (.next rs)
                                                               (.getInt rs 1)))))]
                      (is (= 1 (deref result 10000 ::deadlocked))
                          "the Quartz connection must come from the dedicated pool, not the saturated main pool")))))
              (finally
                (DataSources/destroy ^javax.sql.DataSource (:data-source app-db))
                (DataSources/destroy ^javax.sql.DataSource (:quartz-data-source app-db))))))))))

(defn- job-source-files
  "Source files of this edition that mention Quartz, which include every file that defines a job class."
  []
  (for [dir                ["src" "enterprise/backend/src"]
        :when              (or config/ee-available? (= dir "src"))
        ^java.io.File file (file-seq (io/file dir))
        :when              (and (str/ends-with? (.getName file) ".clj")
                                (re-find #"defjob|org\.quartz|quartzite" (slurp file)))]
    {:file      file
     :namespace (-> (subs (.getPath file) (inc (count dir)))
                    (str/replace #"\.clj$" "")
                    (str/replace "/" ".")
                    (str/replace "_" "-")
                    symbol)}))

(defn- job-definition-options
  "Returns the options map of the form at `zloc` if it is a `task/defjob` or a `task/defjob-type`."
  [zloc]
  (when (z/list? zloc)
    (let [head (z/down zloc)]
      (when (and (= :token (z/tag head))
                 (symbol? (z/sexpr head))
                 (#{"defjob" "defjob-type"} (name (z/sexpr head))))
        (some-> (z/find head z/right #(= :map (z/tag %)))
                z/sexpr)))))

(def ^:private job-definitions
  "The job definitions of this edition, each as its `:namespace`, `:type-name` and `:saved-class`."
  ;; These come from the source text, so they don't depend on which namespaces are loaded, or were reloaded.
  (delay
    (vec (for [{:keys [^java.io.File file], ns-symb :namespace} (job-source-files)
               :when (str/includes? (slurp file) "defjob")
               zloc  (take-while (complement z/end?) (iterate z/next (z/of-file file)))
               :let  [options (job-definition-options zloc)]
               :when options]
           {:namespace   ns-symb
            :type-name   (-> zloc z/down z/right z/sexpr)
            :saved-class (:saved-class options)}))))

(defn- in-this-edition?
  "Whether this edition has the class named `class-name`."
  [class-name]
  (or config/ee-available?
      ;; a job that moved out of enterprise can keep an enterprise class name
      (some #(= class-name (:saved-class %)) @job-definitions)
      (not (str/starts-with? class-name "metabase_enterprise."))))

(def ^:private listed-job-classes
  "The class name of every job, apart from its `:saved-class`."
  ;; This is what catches a bulk rename that rewrites a `:saved-class`, which nothing else would notice.
  #{"metabase.analytics.task.send_anonymous_stats.SendAnonymousUsageStats"
    "metabase.audit_app.task.partitions.ManagePartitions"
    "metabase.audit_app.task.truncate_audit_tables.TruncateAuditTables"
    "metabase.channel.task.refresh_slack_channel_user_cache.RefreshCache"
    "metabase.channel.task.refresh_slack_channel_user_cache.RefreshCacheOnStartup"
    "metabase.explorations.task.collect_orphaned_results.CollectOrphanedExplorationResults"
    "metabase.health_inspector.core.SaveReport"
    "metabase.indexed_entities.task.index_values.ModelIndexRefresh"
    "metabase.mcp.task.mcp_query_handle_gc.McpQueryHandleGc"
    "metabase.metabot.task.conversation_title_backfill.ConversationTitleBackfill"
    "metabase.metabot.task.metabot_conversation_trimmer.MetabotConversationTrimmer"
    "metabase.metabot.task.suggested_prompts_generator.SuggestedPromptsGenerator"
    "metabase.metabot.task.suggested_prompts_refresh.SuggestedPromptsRefresh"
    "metabase.model_persistence.task.persist_refresh.PersistencePrune"
    "metabase.model_persistence.task.persist_refresh.PersistenceRefresh"
    "metabase.mq.queue.quartz.ExclusiveQueueMessageJob"
    "metabase.mq.queue.quartz.QueueMessageJob"
    "metabase.mq.queue.quartz.QueueSlotNudgeJob"
    "metabase.mq.task.outbox.FlushMessageOutbox"
    "metabase.mq.task.queue_reaper.QueueReaper"
    "metabase.notification.task.send.InitNotificationTriggers"
    "metabase.notification.task.send.SendNotification"
    "metabase.oauth_server.task.cleanup_expired_tokens.CleanupExpiredOAuthTokens"
    "metabase.premium_features.task.send_metering.SendMeteringEvents"
    "metabase.product_feedback.task.creator_sentiment_emails.CreatorSentimentEmail"
    "metabase.product_feedback.task.follow_up_emails.FollowUpEmail"
    "metabase.pulse.task.email_remove_legacy_pulse.EmailRemoveLegacyPulse"
    "metabase.pulse.task.send_pulses.InitSendPulseTriggers"
    "metabase.pulse.task.send_pulses.SendPulse"
    "metabase.run_tracking.task.RunTrackingReaper"
    "metabase.search.task.search_index.SearchIndexInit"
    "metabase.search.task.search_index.SearchIndexReindex"
    "metabase.session.task.session_cleanup.SessionCleanup"
    "metabase.sync.task.sync_databases.SyncAndAnalyzeDatabase"
    "metabase.sync.task.sync_databases.UpdateFieldValues"
    "metabase.task_history.task.task_history_cleanup.TaskHistoryCleanup"
    "metabase.transforms.canceling.CancelOldTransformRuns"
    "metabase.transforms.notification.SendTransformFailureDigest"
    "metabase.transforms.schedule.RunTransforms"
    "metabase.transforms.timeout.TimeoutTransforms"
    "metabase.usage_metadata.task.process.UsageMetadataProcess"
    "metabase.version.task.upgrade_checks.CheckForNewVersions"
    "metabase_enterprise.agent_api.task.agent_api_usage_trimmer.AgentApiUsageTrimmer"
    "metabase_enterprise.api_keys.task.api_key_usage_trimmer.ApiKeyUsageTrimmer"
    "metabase_enterprise.cache.task.refresh_cache_configs.Cache"
    "metabase_enterprise.content_diagnostics.task.finding_trimmer.ContentDiagnosticsFindingTrimmer"
    "metabase_enterprise.content_diagnostics.task.scan.ContentDiagnosticsScan"
    "metabase_enterprise.data_complexity_score.task.complexity_score.DataComplexityScoring"
    "metabase_enterprise.data_complexity_score.task.complexity_score_trimmer.DataComplexityScoreTrimmer"
    "metabase_enterprise.dependencies.task.backfill.BackfillDependencies"
    "metabase_enterprise.dependencies.task.entity_check.DependencyEntityCheck"
    "metabase_enterprise.dependencies.task.result_metadata.UpdateResultMetadata"
    "metabase_enterprise.entity_retrieval.task.sync.OsiAiContextSync"
    "metabase_enterprise.mcp.task.mcp_usage_trimmer.McpUsageTrimmer"
    "metabase_enterprise.metabot.task.ai_usage_trimmer.AiUsageTrimmer"
    "metabase_enterprise.remote_sync.task.import.AutoImport"
    "metabase_enterprise.remote_sync.task.table_cleanup.RemoteSyncTableCleanup"
    "metabase_enterprise.replacement.timeout.TimeoutReplacementRuns"
    "metabase_enterprise.security_center.task.sync_advisories.SyncAdvisories"
    "metabase_enterprise.semantic_search.task.index_cleanup.SemanticIndexCleanup"
    "metabase_enterprise.semantic_search.task.index_repair.SemanticIndexRepair"
    "metabase_enterprise.semantic_search.task.indexer.SemanticSearchIndexer"
    "metabase_enterprise.semantic_search.task.metric_collector.SemanticMetricCollector"
    "metabase_enterprise.semantic_search.task.usage_trimmer.SemanticSearchUsageTrimmer"
    "metabase_enterprise.sso.task.delete_expired_relay_state.DeleteExpiredSsoRelayState"
    "metabase_enterprise.support_access_grants.task.expire_grants.ExpireSupportAccessGrants"})

(defn- job-namespaces
  "Source namespaces that mention Quartz, which include every namespace that defines a job class."
  []
  (map :namespace (job-source-files)))

(defn- defined-in-clojure?
  "Whether Clojure source defines the class `c`, as a `deftype`, a `defrecord` or a `task/defjob` does."
  [^Class c]
  (or (.isAssignableFrom clojure.lang.IType c)
      (.isAssignableFrom clojure.lang.IRecord c)))

(defn- job-class-names
  "The name of every job class defined in the source that Quartz can store."
  []
  ;; A namespace imports each class that it defines, whatever the class is named.
  ;; The classes that Clojure source defines are ours, and the rest come from Quartz itself.
  (into (sorted-set)
        (for [ns-symb  (job-namespaces)
              :let     [_ (classloader/require ns-symb)]
              ^Class c (vals (ns-imports ns-symb))
              :when    (and (.isAssignableFrom org.quartz.Job c)
                            (defined-in-clojure? c)
                            ;; stands in for a job whose class is missing, so it is never stored
                            (not= (.getName c) "metabase.task.job_factory.NoOpJob"))]
          (.getName c))))

(deftest no-two-jobs-declare-the-same-saved-class-test
  (is (= {}
         (-> (group-by :saved-class @job-definitions)
             (update-vals #(mapv (juxt :namespace :type-name) %))
             (->> (into {} (filter #(> (count (val %)) 1))))))
      (str "These jobs declare the same `:saved-class`. Quartz finds a job's class by that name, so the job"
           " that loads last would run for all of them. Give each job its own name.")))

(deftest every-job-class-declares-its-saved-class-test
  (let [job-classes   (job-class-names)
        saved-classes (into #{} (map :saved-class) @job-definitions)]
    (is (= {:job-classes-with-no-saved-class #{}
            :saved-classes-with-no-job-class #{}}
           {:job-classes-with-no-saved-class (set/difference job-classes saved-classes)
            :saved-classes-with-no-job-class (set/difference saved-classes job-classes)})
        (str "Define each job class with `task/defjob` or `task/defjob-type`. They take the `:saved-class`"
             " that keeps the class name the same when the job moves. A plain `deftype` or `defrecord`"
             " is named after its namespace."))))

(deftest every-job-class-is-listed-test
  (let [current (job-class-names)
        listed  (into #{} (filter in-this-edition?) listed-job-classes)]
    (is (= {:not-listed      #{}
            :listed-but-gone #{}}
           {:not-listed      (set/difference current listed)
            :listed-but-gone (set/difference listed current)})
        (str "If you only moved or renamed a namespace or a type, or a bulk rename reached a `:saved-class`:"
             " put the job's `:saved-class` back. A stored job is found by that name, so it stays the same"
             " through a move.\n"
             "For a new job: add its `:saved-class` to `listed-job-classes`.\n"
             "For a job that was removed: remove its name.\n"
             "To change a stored class name on purpose: change it in `listed-job-classes` too. Jobs stored"
             " under the old name are deleted at the next startup, with their triggers."))))
