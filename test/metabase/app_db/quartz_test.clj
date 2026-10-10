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
   [metabase.task.impl :as task.impl]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [toucan2.connection :as t2.conn])
  (:import
   (com.mchange.v2.c3p0 DataSources)
   (java.sql Connection)
   (org.quartz JobKey Scheduler)
   (org.quartz.impl.matchers GroupMatcher)
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

(deftest current-class-names-test
  (is (= {"a.Oldest"  "a.Current"
          "a.Old"     "a.Current"
          "a.Current" "a.Current"
          "b.Old"     "b.Current"
          "b.Current" "b.Current"}
         (#'mdb.quartz/current-class-names [{:job-key "a.job", :class-names ["a.Oldest" "a.Old" "a.Current"]}
                                            {:job-key "b.job", :class-names ["b.Old" "b.Current"]}]))))

(defn- class-namespace [class-name]
  (-> class-name
      (str/replace #"\.[^.]+$" "")
      (str/replace "_" "-")))

(defn- class-exists? [class-name]
  (letfn [(loaded? []
            (try
              (some? (Class/forName class-name false (classloader/the-classloader)))
              (catch ClassNotFoundException _
                false)))]
    ;; a job class is a `deftype`, which exists only once its namespace has loaded
    (or (loaded?)
        (let [ns-symb (symbol (class-namespace class-name))]
          (and (try
                 (require ns-symb)
                 true
                 (catch java.io.FileNotFoundException _
                   false))
               (loaded?))))))

(defn- repeated [xs]
  (for [[x n] (frequencies xs) :when (> n 1)] x))

(deftest job-history-test
  (testing "no class name belongs to two jobs, or twice to one"
    (is (= [] (repeated (mapcat :class-names mdb.quartz/job-history)))))
  (doseq [{:keys [job-key class-names]} mdb.quartz/job-history
          :when                         (or config/ee-available?
                                            (not (str/starts-with? (peek class-names) "metabase_enterprise.")))]
    (testing job-key
      (is (= {:current-exists? true, :old-names-that-exist []}
             {:current-exists?      (class-exists? (peek class-names))
              :old-names-that-exist (filterv class-exists? (pop class-names))})))))

(def ^:private past-job-key-renames
  "Job keys renamed in the past, each with the class it had, to help explain a stored row under a key no job
  uses."
  [{:release   "0.50"
    :old-key   "metabase-enterprise.Caching.job"
    :old-class "metabase_enterprise.task.caching.Caching"
    :new-key   "metabase-enterprise.cache.job"
    :new-class "metabase_enterprise.task.cache.Cache"
    :change    "Renamed only, and within 0.50 development, so the old key never shipped."}
   {:release   "0.52"
    :old-key   "metabase.task.search-index.job"
    :old-class "metabase.task.search_index.SearchIndexing"
    :new-key   "metabase.task.search-index.reindex.job"
    :new-class "metabase.task.search_index.SearchIndexReindex"
    :change    "Became durable, when a separate job for incremental updates was added beside it."}
   {:release   "0.59"
    :old-key   "metabase-enterprise.transforms.canceling"
    :old-class "metabase_enterprise.transforms.canceling.CancelOldTransformRuns"
    :new-key   "metabase.transforms.canceling"
    :new-class "metabase.transforms.canceling.CancelOldTransformRuns"
    :change    "Moved out of enterprise, with no change to the job."}
   {:release   "0.59"
    :old-key   "metabase-enterprise.transforms.jobs.timeout-job"
    :old-class "metabase_enterprise.transforms.jobs.TimeoutOldRuns"
    :new-key   "metabase.transforms.jobs.timeout-job"
    :new-class "metabase.transforms.jobs.TimeoutOldRuns"
    :change    "Moved out of enterprise, with no change to the job, which was removed in 0.63."}
   {:release   "0.59"
    :old-key   "metabase-enterprise.transforms.timeout"
    :old-class "metabase_enterprise.transforms.timeout.TimeoutTransforms"
    :new-key   "metabase.transforms.timeout"
    :new-class "metabase.transforms.timeout.TimeoutTransforms"
    :change    "Moved out of enterprise, with no change to the job."}
   {:release   "0.60"
    :old-key   "metabase.task.metabot-v3.suggested-prompts-generator.job"
    :old-class "metabase_enterprise.metabot_v3.task.suggested_prompts_generator.SuggestedPromptsGenerator"
    :new-key   "metabase.task.metabot.suggested-prompts-generator.job"
    :new-class "metabase.metabot.task.suggested_prompts_generator.SuggestedPromptsGenerator"
    :change    "Moved out of enterprise with the rest of Metabot."}])

(deftest job-history-has-no-entry-for-a-renamed-job-key-test
  (let [old-keys    (into #{} (map :old-key) past-job-key-renames)
        old-classes (into #{} (map :old-class) past-job-key-renames)]
    (is (= []
           (filter (fn [{:keys [job-key class-names]}]
                     (or (old-keys job-key)
                         (some old-classes class-names)))
                   mdb.quartz/job-history))
        (str "Remove these entries from `metabase.app-db.quartz/job-history`. Each is for a job key that"
             " `past-job-key-renames` lists as renamed, or holds the class that key had. With the entry, a row"
             " stored under the old key still loads, and keeps running beside the job scheduled under the new key."))))

(def ^:private job-classes-without-history
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
  (let [current                  (job-class-names)
        renamed                  (into #{} (map (comp peek :class-names)) mdb.quartz/job-history)
        loadable-without-history (cond->> job-classes-without-history
                                   (not config/ee-available?) (remove #(str/starts-with? % "metabase_enterprise.")))]
    (testing "every job class is listed"
      (is (= [] (remove (into renamed job-classes-without-history) current))
          (str "For an existing job's class under a new name, with the same job key: add the new name to the end"
               " of the `:class-names` of the job's entry in `metabase.app-db.quartz/job-history`. If the job has"
               " no entry, add one with its job key and the old name first, and remove the old name from"
               " `job-classes-without-history`.\n"
               "For a new job, or a job whose key changed too: add the class to `job-classes-without-history`."
               " For a changed key, also remove the job's entry from `job-history` and add the rename to"
               " `past-job-key-renames`.")))
    (testing "every name in `job-classes-without-history` is a job class"
      (is (= [] (remove current loadable-without-history))
          (str "For a job that was renamed and kept its job key: move the name into an entry in"
               " `metabase.app-db.quartz/job-history`, before the new name.\n"
               "For a job that was removed, or whose key changed too: remove the name.")))
    (testing "no job class is listed as both renamed and without history"
      (is (= [] (filter renamed job-classes-without-history))))))

(defn- scheduled-job-keys!
  "A map from the current class name of each job in `history` to the set of job keys it is scheduled under at
  startup."
  [history]
  (let [namespaces (into #{} (map (comp class-namespace peek :class-names)) history)
        scheduled  (atom {})]
    (run! (comp classloader/require symbol) namespaces)
    ;; the cache job needs its feature, and there is one transforms job for each active transform job
    (mt/with-premium-features #{:cache-granular-controls}
      (mt/with-temp [:model/TransformJob _ {:schedule "0 0 * * * ? *"}]
        (tu/do-with-unstarted-temp-scheduler!
         (fn []
           ;; Only these jobs' initializers run, because other tasks' initializers start threads that outlive
           ;; the scheduler. They are called directly so that one that throws fails the test.
           (doseq [[task init!] (methods task.impl/init!)
                   :when        (namespaces (namespace task))]
             (init! task))
           (let [^Scheduler scheduler (#'task.impl/scheduler)]
             (doseq [^JobKey job-key (.getJobKeys scheduler (GroupMatcher/anyGroup))]
               (swap! scheduled update (.getName (.getJobClass (.getJobDetail scheduler job-key)))
                      (fnil conj (sorted-set)) (.getName job-key))))))))
    @scheduled))

(deftest job-history-labels-match-the-scheduled-job-keys-test
  ;; This catches a job key that changed while its entry stayed
  (let [history    (cond->> mdb.quartz/job-history
                     (not config/ee-available?)
                     (remove #(str/starts-with? (peek (:class-names %)) "metabase_enterprise.")))
        scheduled  (scheduled-job-keys! history)
        label-for? (fn [label job-key]
                     ;; a label that ends in a dot is the prefix of the keys of a job scheduled many times
                     (if (str/ends-with? label ".")
                       (str/starts-with? job-key label)
                       (= label job-key)))]
    (is (= []
           (for [{:keys [job-key class-names]} history
                 :let                          [scheduled-as (scheduled (peek class-names) #{})]
                 :when                         (not (and (seq scheduled-as)
                                                         (every? #(label-for? job-key %) scheduled-as)))]
             {:job-key job-key, :scheduled-as scheduled-as}))
        (str "The `:job-key` of these entries in `metabase.app-db.quartz/job-history` is not the key their job is"
             " scheduled under. If the label is wrong, correct it.\n"
             "If the job's key changed: remove the entry, add the class to `job-classes-without-history`, and add"
             " the rename to `past-job-key-renames`.\n"
             "If `:scheduled-as` is empty, the job's `task/init!` did not schedule it in this test: set up what it"
             " needs in `scheduled-job-keys!`."))))
