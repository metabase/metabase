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
   [metabase.task.impl :as task.impl]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
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

(deftest current-class-names-test
  (is (= {"a.Oldest"  "a.Current"
          "a.Old"     "a.Current"
          "a.Current" "a.Current"
          "b.Old"     "b.Current"
          "b.Current" "b.Current"}
         (#'mdb.quartz/current-class-names [{:job-key "a.job", :class-names ["a.Oldest" "a.Old" "a.Current"]}
                                            {:job-key "b.job", :class-names ["b.Old" "b.Current"]}]))))

(deftest load-class-names-the-stored-class-when-its-current-class-is-missing-test
  ;; plain `with-redefs`, because the lookup is a map and not a function
  (with-redefs [mdb.quartz/stored-class-name->current {"a.Old" "a.Missing"}]
    (is (thrown-with-msg? ClassNotFoundException #"a\.Old" (#'mdb.quartz/load-class "a.Old")))))

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

(defn- class-namespace
  "The name of the namespace that defines the class named `class-name`."
  [class-name]
  (or (some (fn [{:keys [saved-class], ns-symb :namespace}]
              (when (= saved-class class-name)
                (str ns-symb)))
            @job-definitions)
      ;; a class with no `:saved-class`, such as a job's old name, is named after its namespace
      (-> class-name
          (str/replace #"\.[^.]+$" "")
          (str/replace "_" "-"))))

(defn- in-this-edition?
  "Whether this edition has the class named `class-name`."
  [class-name]
  (or config/ee-available?
      ;; a job that moved out of enterprise can keep an enterprise class name
      (some #(= class-name (:saved-class %)) @job-definitions)
      (not (str/starts-with? class-name "metabase_enterprise."))))

(defn- class-exists? [class-name]
  ;; a job class is a `deftype`, which exists only once its namespace has loaded
  (try
    (require (symbol (class-namespace class-name)))
    (catch java.io.FileNotFoundException _))
  (try
    (Class/forName class-name false (classloader/the-classloader))
    true
    (catch ClassNotFoundException _
      false)))

(defn- repeated [xs]
  (for [[x n] (frequencies xs) :when (> n 1)] x))

(def ^:private current-name
  "The current class name of an entry of [[mdb.quartz/job-history]]."
  (comp peek :class-names))

(defn- label
  "The `:job-key` or `:job-key-prefix` of an entry of [[mdb.quartz/job-history]], as a map."
  [entry]
  (select-keys entry [:job-key :job-key-prefix]))

(defn- labels?
  "Whether the label of the history entry `entry` stands for the job key `job-key`."
  [{exact :job-key, prefix :job-key-prefix} job-key]
  (if prefix
    (str/starts-with? job-key prefix)
    (= exact job-key)))

(def ^:private job-history-in-this-edition
  (filter (comp in-this-edition? current-name) mdb.quartz/job-history))

(deftest job-history-lists-each-class-name-once-test
  (is (= [] (repeated (mapcat :class-names mdb.quartz/job-history)))))

(deftest job-history-current-classes-exist-and-old-ones-do-not-test
  (is (= []
         (for [entry job-history-in-this-edition
               :let  [current-exists?      (class-exists? (current-name entry))
                      old-names-that-exist (filterv class-exists? (pop (:class-names entry)))]
               :when (or (not current-exists?) (seq old-names-that-exist))]
           (assoc (label entry)
                  :current-exists?      current-exists?
                  :old-names-that-exist old-names-that-exist)))))

(deftest job-history-has-no-entry-for-a-renamed-job-key-test
  (let [old-keys    (map :old-key mdb.quartz/job-key-renames)
        old-classes (into #{} (map :old-class) mdb.quartz/job-key-renames)]
    (is (= []
           (filter (fn [entry]
                     (or (some #(labels? entry %) old-keys)
                         (some old-classes (:class-names entry))))
                   mdb.quartz/job-history))
        (str "Remove these entries from `metabase.app-db.quartz/job-history`. Each is for a job key that"
             " `metabase.app-db.quartz/job-key-renames` lists as renamed, or holds the class that key had."
             " With the entry, a row stored under the old key still loads, and keeps running beside the job"
             " scheduled under the new key."))))

(deftest no-renamed-job-key-keeps-a-class-that-loads-test
  (is (= []
         (filter (comp class-exists? :old-class) mdb.quartz/job-key-renames))
      (str "The class these job keys had still loads, so a row stored under the old key keeps running beside the"
           " job scheduled under the new key. Rename the job's class too, so that the row is deleted at startup.")))

(def ^:private job-classes-without-history
  "Job classes with no entry in [[mdb.quartz/job-history]], as none was renamed under its current job key."
  ;; This list and the history hold every job's class name a second time, apart from its `:saved-class`.
  ;; That is what catches a bulk rename that rewrites a `:saved-class`, which nothing else would notice.
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

(def ^:private changed-job-key-instructions
  "The end of a failure message's sentence that says what to do when a job's key changed."
  (str "remove its entry from `metabase.app-db.quartz/job-history`, add its class to"
       " `job-classes-without-history`, and add the rename to `metabase.app-db.quartz/job-key-renames`."))

(def ^:private put-the-saved-class-back
  "The start of a failure message, for the usual cause of a job class that is new or gone."
  (str "If you only moved or renamed a namespace or a type, or a bulk rename reached a `:saved-class`:"
       " put the job's `:saved-class` back. A stored job is found by that name, so it stays the same"
       " through a move.\n"))

(deftest every-job-class-is-listed-test
  (let [current        (job-class-names)
        renamed         (into #{} (map current-name) mdb.quartz/job-history)
        listed-here     (into #{} (filter in-this-edition?) job-classes-without-history)]
    (testing "every job class is listed"
      (is (= #{} (set/difference current renamed job-classes-without-history))
          (str put-the-saved-class-back
               "To change a stored class name on purpose, with the same job key: add the new name to the end"
               " of the `:class-names` of the job's entry in `metabase.app-db.quartz/job-history`. If the job"
               " has no entry, add one with its job key and the old name first, and remove the old name from"
               " `job-classes-without-history`.\n"
               "For a new job: add its `:saved-class` to `job-classes-without-history`.\n"
               "For a job whose key changed too: " changed-job-key-instructions)))
    (testing "every name in `job-classes-without-history` is a job class"
      (is (= #{} (set/difference listed-here current))
          (str put-the-saved-class-back
               "For a class name that was changed on purpose, with the same job key: move the old name into"
               " an entry in `metabase.app-db.quartz/job-history`, before the new name.\n"
               "For a job that was removed, or whose key changed too: remove the name.")))
    (testing "no job class is listed as both renamed and without history"
      (is (= #{} (set/intersection renamed job-classes-without-history))))))

(defn- scheduled-job-keys!
  "Returns the job keys that each job in `history` is scheduled under at startup, by its current class name."
  [history]
  (let [namespaces (into #{} (map (comp class-namespace current-name)) history)]
    (run! (comp classloader/require symbol) namespaces)
    ;; Initializers can write to the app DB, as the sync job's does when it randomizes default sync schedules.
    ;; They run against an empty app DB that is thrown away, so nothing they write reaches the real one.
    (mt/with-empty-h2-app-db!
      ;; the cache job needs its feature, and there is one transforms job for each active transform job
      (mt/with-premium-features #{:cache-granular-controls}
        (mt/with-temp [:model/TransformJob _ {:schedule "0 0 * * * ? *"}]
          (tu/do-with-unstarted-temp-scheduler!
           (fn []
             ;; Only these jobs' initializers run, because others start threads that outlive the scheduler.
             ;; They are called directly so that one that throws fails the test.
             (doseq [[task init!] (methods task.impl/init!)
                     :when        (namespaces (namespace task))]
               (init! task))
             (-> (group-by #(.getName ^Class (:class %)) (tu/scheduler-current-tasks))
                 (update-vals #(into (sorted-set) (map :key) %))))))))))

(defn- rename-to-complete
  "The entry for [[mdb.quartz/job-key-renames]] if the key of the job in `entry` changed to `new-key`."
  [entry new-key]
  {:release   "<the first release with the new key, such as x.59.3>"
   :old-key   (:job-key entry "<the old key>")
   :old-class (current-name entry)
   :new-key   new-key
   :new-class (current-name entry)
   :change    "<how the job changed>"})

(deftest job-history-labels-match-the-scheduled-job-keys-test
  ;; This catches a job key that changed while its entry stayed
  (let [scheduled (scheduled-job-keys! job-history-in-this-edition)]
    (is (= []
           (for [entry job-history-in-this-edition
                 :let  [scheduled-as (scheduled (current-name entry) #{})]
                 :when (or (empty? scheduled-as)
                           (not-every? #(labels? entry %) scheduled-as))]
             (cond-> (assoc (label entry) :scheduled-as scheduled-as)
               (seq scheduled-as)
               (assoc :rename-if-the-key-changed (rename-to-complete entry (first scheduled-as))))))
        (str "The `:job-key` or `:job-key-prefix` of these entries in `metabase.app-db.quartz/job-history` does"
             " not match the key their job is scheduled under. If the label is wrong, correct it.\n"
             "If the job's key changed: " changed-job-key-instructions
             " Complete `:rename-if-the-key-changed` to get the rename.\n"
             "If `:scheduled-as` is empty, the job's `task/init!` did not schedule it in this test: set up what it"
             " needs in `scheduled-job-keys!`."))))
