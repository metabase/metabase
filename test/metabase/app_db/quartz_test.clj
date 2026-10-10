(ns metabase.app-db.quartz-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.connection-pool-setup :as mdb.connection-pool-setup]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.quartz :as mdb.quartz]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
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

(deftest current-class-name-test
  (let [history {"a.job" ["a.Oldest" "a.Old" "a.Current"]
                 "b.job" ["b.Old" "b.Current"]}]
    (are [stored-name expected] (= expected (mdb.quartz/current-class-name history stored-name))
      ;; every old name maps to the current one
      "a.Oldest"  "a.Current"
      "a.Old"     "a.Current"
      "b.Old"     "b.Current"
      ;; current and unlisted names stay as they are
      "a.Current" "a.Current"
      "c.Other"   "c.Other")))

(defn- class-exists? [class-name]
  (letfn [(loaded? []
            (try
              (some? (Class/forName class-name false (classloader/the-classloader)))
              (catch ClassNotFoundException _
                false)))]
    ;; a job class is a `deftype`, which exists only once its namespace has loaded
    (or (loaded?)
        (and (try
               (require (symbol (str/replace (str/replace class-name #"\.[^.]+$" "") "_" "-")))
               true
               (catch java.io.FileNotFoundException _
                 false))
             (loaded?)))))

(defn- repeated [xs]
  (for [[x n] (frequencies xs) :when (> n 1)] x))

(deftest job-history-test
  (testing "no class name belongs to two jobs, or twice to one"
    (is (= [] (repeated (mapcat val mdb.quartz/job-history)))))
  (doseq [[job-key class-names] mdb.quartz/job-history
          :when (or config/ee-available?
                    (not (str/starts-with? (peek class-names) "metabase_enterprise.")))]
    (testing job-key
      (is (= {:current-exists? true, :old-names-that-exist []}
             {:current-exists?      (class-exists? (peek class-names))
              :old-names-that-exist (filterv class-exists? (pop class-names))})))))

(def ^:private unrenamed-job-classes
  "Job classes with no entry in [[mdb.quartz/job-history]], because their job has had no other class name under
  its current job key."
  #{"metabase.audit_app.task.partitions.ManagePartitions"
    "metabase.explorations.task.collect_orphaned_results.CollectOrphanedExplorationResults"
    "metabase.health_inspector.core.SaveReport"
    "metabase.mcp.task.mcp_query_handle_gc.McpQueryHandleGc"
    "metabase.metabot.task.conversation_title_backfill.ConversationTitleBackfill"
    "metabase.metabot.task.metabot_conversation_trimmer.MetabotConversationTrimmer"
    "metabase.metabot.task.suggested_prompts_generator.SuggestedPromptsGenerator"
    "metabase.metabot.task.suggested_prompts_refresh.SuggestedPromptsRefresh"
    "metabase.mq.queue.quartz.ExclusiveQueueMessageJob"
    "metabase.mq.queue.quartz.QueueMessageJob"
    "metabase.mq.queue.quartz.QueueSlotNudgeJob"
    "metabase.mq.task.outbox.FlushMessageOutbox"
    "metabase.mq.task.queue_reaper.QueueReaper"
    "metabase.notification.task.send.InitNotificationTriggers"
    "metabase.oauth_server.task.cleanup_expired_tokens.CleanupExpiredOAuthTokens"
    "metabase.premium_features.task.send_metering.SendMeteringEvents"
    "metabase.run_tracking.task.RunTrackingReaper"
    "metabase.transforms.canceling.CancelOldTransformRuns"
    "metabase.transforms.notification.SendTransformFailureDigest"
    "metabase.transforms.timeout.TimeoutTransforms"
    "metabase.usage_metadata.task.process.UsageMetadataProcess"
    "metabase_enterprise.agent_api.task.agent_api_usage_trimmer.AgentApiUsageTrimmer"
    "metabase_enterprise.api_keys.task.api_key_usage_trimmer.ApiKeyUsageTrimmer"
    "metabase_enterprise.content_diagnostics.task.finding_trimmer.ContentDiagnosticsFindingTrimmer"
    "metabase_enterprise.content_diagnostics.task.scan.ContentDiagnosticsScan"
    "metabase_enterprise.data_complexity_score.task.complexity_score.DataComplexityScoring"
    "metabase_enterprise.data_complexity_score.task.complexity_score_trimmer.DataComplexityScoreTrimmer"
    "metabase_enterprise.dependencies.task.backfill.BackfillDependencies"
    "metabase_enterprise.dependencies.task.entity_check.DependencyEntityCheck"
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
  (for [dir                ["src" "enterprise/backend/src"]
        :when              (or config/ee-available? (= dir "src"))
        ^java.io.File file (file-seq (io/file dir))
        :when              (and (str/ends-with? (.getName file) ".clj")
                                (re-find #"defjob|org\.quartz|quartzite" (slurp file)))]
    (-> (subs (.getPath file) (inc (count dir)))
        (str/replace #"\.clj$" "")
        (str/replace "/" ".")
        (str/replace "_" "-")
        symbol)))

(defn- job-class-names
  "The name of every job class defined in the source that Quartz can store."
  []
  (into (sorted-set)
        (for [ns-symb  (job-namespaces)
              :let     [_ (classloader/require ns-symb)]
              ^Class c (vals (ns-imports ns-symb))
              :when    (and (.isAssignableFrom org.quartz.Job c)
                            (str/starts-with? (.getName c) (str (munge ns-symb) "."))
                            ;; stands in for a job whose class is missing, so it is never stored
                            (not= (.getName c) "metabase.task.job_factory.NoOpJob"))]
          (.getName c))))

(deftest every-job-class-is-listed-test
  (let [current   (job-class-names)
        renamed   (set (map peek (vals mdb.quartz/job-history)))
        unrenamed (cond->> unrenamed-job-classes
                    (not config/ee-available?) (remove #(str/starts-with? % "metabase_enterprise.")))]
    (testing "every job class is listed"
      (is (= [] (remove (into renamed unrenamed-job-classes) current))
          (str "For an existing job's class under a new name, with the same job key: add the new name to the end"
               " of the job's entry in `metabase.app-db.quartz/job-history`. If the job has no entry, add one"
               " under its job key with the old name first, and remove the old name from"
               " `unrenamed-job-classes`.\n"
               "For a new job, or a job whose key changed too: add the class to `unrenamed-job-classes`. For a"
               " changed key, also remove the job's entry from `job-history` and add the rename to the comment"
               " above it.")))
    (testing "every name in `unrenamed-job-classes` is a job class"
      (is (= [] (remove current unrenamed))
          (str "For a job that was renamed and kept its job key: move the name into an entry in"
               " `metabase.app-db.quartz/job-history`, before the new name.\n"
               "For a job that was removed, or whose key changed too: remove the name.")))
    (testing "no job class is listed as both renamed and unrenamed"
      (is (= [] (filter renamed unrenamed-job-classes))))))
