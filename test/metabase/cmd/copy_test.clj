(ns metabase.cmd.copy-test
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.namespace.find :as ns.find]
   [metabase.app-db.setup :as mdb.setup]
   [metabase.app-db.test-util :as mdb.test-util]
   [metabase.classloader.core :as classloader]
   [metabase.cmd.copy :as copy]
   [metabase.config.core :as config])
  (:import
   (java.sql Clob SQLException)))

(set! *warn-on-reflection* true)

(deftest ^:parallel sql-for-selecting-instances-from-source-db-test
  (is (= "SELECT * FROM metabase_field ORDER BY id ASC"
         (#'copy/sql-for-selecting-instances-from-source-db :model/Field))))

(deftest ^:parallel copy-h2-database-details-test
  (doseq [copy-h2-database-details? [true false]]
    (testing (str `copy/*copy-h2-database-details* " = " copy-h2-database-details?)
      (binding [copy/*copy-h2-database-details* copy-h2-database-details?]
        (is (= [{:id 1, :engine "h2", :details (if copy-h2-database-details? "{:db \"metabase.db\"}" "{}")}
                {:id 2, :engine "postgres", :details "{:db \"metabase\"}"}]
               (into
                []
                (#'copy/model-results-xform :model/Database)
                [{:id 1, :engine "h2", :details "{:db \"metabase.db\"}"}
                 {:id 2, :engine "postgres", :details "{:db \"metabase\"}"}])))))))

(defn- h2-data-source [prefix]
  (mdb.test-util/->ClojureJDBCSpecDataSource
   {:subprotocol "h2"
    :subname     (format "mem:%s_%s;DB_CLOSE_DELAY=-1" prefix (random-uuid))
    :classname   "org.h2.Driver"}))

(defn- move-source-permissions-groups! [^javax.sql.DataSource data-source]
  (with-open [conn (.getConnection data-source)]
    (let [db {:connection conn}]
      (jdbc/execute! db ["SET REFERENTIAL_INTEGRITY FALSE"])
      (try
        (doseq [[old-id new-id] [[3 8] [4 11]]]
          ;; These are the only fresh-migration rows that reference groups 3/4.
          (doseq [table ["metabot_permissions" "permissions"]]
            (jdbc/execute! db [(format "UPDATE %s SET group_id = ? WHERE group_id = ?" table)
                               new-id old-id]))
          (jdbc/execute! db ["UPDATE permissions_group SET id = ? WHERE id = ?" new-id old-id]))
        (finally
          (jdbc/execute! db ["SET REFERENTIAL_INTEGRITY TRUE"]))))))

(defn- group-ids [data-source table]
  (mapv :group_id
        (jdbc/query {:datasource data-source}
                    [(format "SELECT DISTINCT group_id FROM %s ORDER BY group_id" table)])))

(defn- permissions-group-ids [data-source]
  (mapv :id
        (jdbc/query {:datasource data-source}
                    ["SELECT id FROM permissions_group ORDER BY id"])))

(defn- orphaned-metabot-permissions-group-ids [data-source]
  (mapv :group_id
        (jdbc/query {:datasource data-source}
                    [(str "SELECT DISTINCT mp.group_id "
                          "FROM metabot_permissions mp "
                          "LEFT JOIN permissions_group pg ON pg.id = mp.group_id "
                          "WHERE pg.id IS NULL "
                          "ORDER BY mp.group_id")])))

(defn- metabot-permissions [data-source]
  (jdbc/query {:datasource data-source}
              ["SELECT * FROM metabot_permissions ORDER BY group_id, perm_type"]))

(defn- normalize-jdbc-value [value]
  (if (instance? Clob value)
    (let [^Clob clob value]
      (.getSubString clob 1 (int (.length clob))))
    value))

(defn- stable-rows [data-source sql]
  (mapv (fn [row]
          (into (sorted-map)
                (map (fn [[column value]]
                       [column (normalize-jdbc-value value)]))
                row))
        (jdbc/query {:datasource data-source} [sql])))

(defn- migration-state-outside-copy-entities [data-source]
  {:liquibase-changelog      (stable-rows data-source
                                          "SELECT * FROM databasechangelog ORDER BY orderexecuted, id")
   :liquibase-changelog-lock (stable-rows data-source
                                          "SELECT * FROM databasechangeloglock ORDER BY id")
   :python-library           (stable-rows data-source
                                          "SELECT * FROM python_library ORDER BY id")
   :transform-jobs           (stable-rows data-source
                                          "SELECT * FROM transform_job ORDER BY id")
   :transform-tags           (stable-rows data-source
                                          "SELECT * FROM transform_tag ORDER BY id")
   :transform-job-tags       (stable-rows data-source
                                          "SELECT * FROM transform_job_transform_tag ORDER BY id")
   :quartz-locks             (stable-rows data-source
                                          "SELECT * FROM qrtz_locks ORDER BY sched_name, lock_name")
   :quartz-scheduler-state   (stable-rows data-source
                                          "SELECT * FROM qrtz_scheduler_state ORDER BY sched_name, instance_name")})

(deftest ^:parallel target-table-names-to-clear-test
  (let [table-names (vec (#'copy/target-table-names-to-clear))
        positions   (zipmap table-names (range))]
    (is (= 1 (count (filter #{:metabot_permissions} table-names)))
        "metabot_permissions must be truncated exactly once in both OSS and EE")
    (is (< (positions :metabot_permissions)
           (positions :permissions_group))
        "metabot_permissions must be cleared before its parent permissions_group")))

(deftest target-empty-safety-guard-test
  (testing "an empty target is accepted"
    (with-redefs [jdbc/query (constantly [{:cnt 0}])]
      (is (nil? (#'copy/assert-has-no-users ::target)))))
  (testing "a populated target is rejected before cleanup"
    (with-redefs [jdbc/query (constantly [{:cnt 1}])]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Target DB is already populated!"
                            (#'copy/assert-has-no-users ::target))))))

(deftest rollback-only-transaction-boundary-test
  (let [events (atom [])]
    (with-redefs [jdbc/db-set-rollback-only!   (fn [conn] (swap! events conj [:set conn]))
                  jdbc/db-unset-rollback-only! (fn [conn] (swap! events conj [:unset conn]))]
      (#'copy/do-with-connection-rollback-only ::connection
                                               #(swap! events conj [:body ::connection])))
    (is (= [[:set ::connection] [:body ::connection] [:unset ::connection]] @events)))
  (let [events (atom [])]
    (with-redefs [jdbc/db-set-rollback-only!   (fn [conn] (swap! events conj [:set conn]))
                  jdbc/db-unset-rollback-only! (fn [conn] (swap! events conj [:unset conn]))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"copy failed"
                            (#'copy/do-with-connection-rollback-only
                             ::connection
                             #(throw (ex-info "copy failed" {}))))))
    (is (= [[:set ::connection]] @events)
        "rollback-only must remain set when copying throws")))

(deftest migration-seeded-metabot-permissions-are-cleared-test
  (let [source-data-source (h2-data-source "metabase_78414_source")
        target-data-source (h2-data-source "metabase_78414_target")]
    (mdb.setup/setup-db! :h2 source-data-source true false)
    (move-source-permissions-groups! source-data-source)
    (is (= [1 2 8 11] (permissions-group-ids source-data-source)))
    (is (= [1 2 8 11] (group-ids source-data-source "metabot_permissions")))
    (is (empty? (orphaned-metabot-permissions-group-ids source-data-source)))
    (mdb.setup/setup-db! :h2 target-data-source true false)
    (let [source-metabot-permissions (metabot-permissions source-data-source)
          target-migration-state     (migration-state-outside-copy-entities target-data-source)]
      (is (= [1 2 3 4] (permissions-group-ids target-data-source)))
      (is (= [1 2 3 4] (group-ids target-data-source "metabot_permissions")))
      (doseq [[table rows] target-migration-state]
        (is (seq rows) (format "%s fixture must be non-empty" (name table))))
      (copy/copy! :h2 source-data-source :h2 target-data-source)
      (is (= [1 2 8 11] (permissions-group-ids target-data-source)))
      (if config/ee-available?
        (is (= source-metabot-permissions (metabot-permissions target-data-source))
            "EE must copy the authoritative metabot permissions exactly once")
        (is (empty? (metabot-permissions target-data-source))
            "OSS must clear migration-seeded metabot permissions without resolving the EE model"))
      (is (empty? (orphaned-metabot-permissions-group-ids target-data-source))
          "The copied H2 application DB must not contain orphaned metabot permissions")
      (is (= target-migration-state (migration-state-outside-copy-entities target-data-source))
          "Liquibase, common.py, Transform jobs/tags, and Quartz state must remain untouched")
      (let [integrity-error (try
                              (jdbc/execute! {:datasource target-data-source}
                                             ["ALTER TABLE metabot_permissions SET REFERENTIAL_INTEGRITY TRUE CHECK"])
                              nil
                              (catch SQLException e
                                e))]
        (is (nil? integrity-error)
            (some-> integrity-error ex-message))))))

(def ^:private models-to-exclude
  "Models that should *not* be migrated in `load-from-h2`."
  #{:model/AgentApiCallLog
    :model/AiUsageLog
    :model/AnalysisFinding
    :model/AnalysisFindingError
    :model/ApiKey
    :model/CacheConfig
    :model/CardFavorite
    :model/CloudMigration
    :model/ContentTranslation
    :model/DashboardFavorite
    :model/DataApp
    :model/DataComplexityScore
    :model/DatabaseRouter
    :model/Dependency
    :model/DependencyStatus
    :model/ExplorationQueryResult
    :model/McpQueryHandle
    :model/McpSessionLog
    :model/McpToolCallLog
    :model/MetabotConversation
    :model/MetabotGroupLimit
    :model/MetabotInstanceLimit
    :model/MetabotMessage
    :model/MetabotPermissions
    :model/PremiumFeaturesCache
    :model/PythonLibrary
    :model/Query
    :model/QueryCache
    :model/QueryExecution
    :model/QueryField
    :model/QueryTable
    :model/RemoteSyncObject
    :model/RemoteSyncTask
    :model/ReplacementRun
    :model/SearchIndexMetadata
    :model/SecurityAdvisory
    :model/SemanticSearchTokenTracking
    :model/SourceDimensionDaily
    :model/SourceDimensionProfileDaily
    :model/SourceMetricDaily
    :model/SourceSegmentCompositeDaily
    :model/SourceSegmentDaily
    :model/SsoRelayState
    :model/StoredResult
    :model/StoredResultUse
    :model/SupportAccessGrantLog
    :model/TableIndex
    :model/TaskHistory
    :model/TaskRun
    ;; TODO we should remove these models from here once serialization is supported
    :model/Transform
    :model/TransformRun
    :model/TransformRunCancelation
    :model/TransformDagRun
    :model/TransformJob
    :model/TransformJobRun
    :model/TransformJobTransformTag
    :model/TransformTag
    :model/TransformTransformTag
    :model/Undo
    :model/UserKeyValue})

(defn- all-model-names []
  (into (sorted-set)
        (comp (filter #(= (namespace %) "model"))
              (remove models-to-exclude))
        (descendants :metabase/model)))

(deftest ^:parallel all-models-accounted-for-test
  ;; make sure the entire system is loaded before running this test, to make sure we account for all the models.
  (doseq [ns-symb (ns.find/find-namespaces (classpath/system-classpath))
          :when   (and (str/starts-with? ns-symb "metabase")
                       (not (str/includes? ns-symb "test")))]
    (classloader/require ns-symb))
  (doseq [model (all-model-names)
          :let  [copy-models (set copy/entities)]]
    (is (contains? copy-models model)
        (format "%s should be added to %s, or to %s" model `copy/entities `models-to-exclude))))
