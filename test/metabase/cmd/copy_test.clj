(ns metabase.cmd.copy-test
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.namespace.find :as ns.find]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.setup :as mdb.setup]
   [metabase.classloader.core :as classloader]
   [metabase.cmd.copy :as copy]
   [toucan2.core :as t2]))

(deftest ^:parallel sql-for-selecting-instances-from-source-db-test
  (is (= "SELECT * FROM metabase_field ORDER BY id ASC"
         (#'copy/sql-for-selecting-instances-from-source-db :model/Field)))
  (is (= "SELECT * FROM metabot_permissions WHERE group_id IN (SELECT id FROM permissions_group)"
         (#'copy/sql-for-selecting-instances-from-source-db :metabot_permissions))))

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

(defn- h2-data-source []
  (mdb.data-source/raw-connection-string->DataSource
   (format "jdbc:h2:mem:%s;DB_CLOSE_DELAY=-1" (random-uuid))))

(defn- shutdown! [data-source]
  (jdbc/execute! {:datasource data-source} ["SHUTDOWN"] {:transaction? false}))

(defn- metabot-permissions-by-group-type
  "{magic_group_type {perm_type perm_value}}, with rows of groups the target doesn't have under nil."
  [data-source]
  (reduce (fn [m {:keys [magic_group_type perm_type perm_value]}]
            (assoc-in m [magic_group_type perm_type] perm_value))
          {}
          (jdbc/query {:datasource data-source}
                      ["SELECT pg.magic_group_type, mp.perm_type, mp.perm_value
                        FROM metabot_permissions mp
                        LEFT JOIN permissions_group pg ON pg.id = mp.group_id"])))

(deftest copy-metabot-permissions-test
  (testing "a dump made by an OSS build before metabot_permissions was copied restores like a fresh install (#78414)"
    (let [source (h2-data-source)
          target (h2-data-source)]
      (try
        (mdb.setup/setup-db! :h2 source {:manage-encryption-state? false})
        (let [fresh (metabot-permissions-by-group-type source)]
          ;; such a dump holds the dumping build's seed rows under its own group ids, while the source's magic groups
          ;; sit elsewhere with none
          (jdbc/execute! {:datasource source} ["SET REFERENTIAL_INTEGRITY FALSE"])
          (jdbc/execute! {:datasource source} ["UPDATE permissions_group SET id = id + 10 WHERE id > 2"])
          (doseq [table ["permissions" "data_permissions"]]
            (jdbc/execute! {:datasource source} [(format "UPDATE %s SET group_id = group_id + 10 WHERE group_id > 2" table)]))
          (jdbc/execute! {:datasource source} ["UPDATE metabot_permissions SET perm_value = 'no' WHERE group_id = 1 AND perm_type = 'permission/metabot'"])
          (jdbc/execute! {:datasource source} ["SET REFERENTIAL_INTEGRITY TRUE"])
          (copy/copy! :h2 source :h2 target)
          (is (= (assoc-in fresh ["all-internal-users" "permission/metabot"] "no")
                 (metabot-permissions-by-group-type target))))
        (finally
          (run! shutdown! [source target]))))))

(def ^:private models-to-exclude
  "Models that should *not* be migrated in `load-from-h2`."
  #{:model/AiUsageLog
    :model/AnalysisFinding
    :model/AnalysisFindingError
    :model/ApiKey
    :model/CacheConfig
    :model/CardFavorite
    :model/CloudMigration
    :model/ContentTranslation
    :model/DashboardFavorite
    :model/DataComplexityScore
    :model/DatabaseRouter
    :model/Dependency
    :model/DependencyStatus
    :model/McpQueryHandle
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
    :model/SupportAccessGrantLog
    :model/TaskHistory
    :model/TaskRun
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
        (format "%s should be added to %s, or to %s" model `copy/entities `models-to-exclude)))
  (is (apply distinct? (map t2/table-name copy/entities))))

(def ^:private foreign-key-coverage-exceptions
  "Known exceptions to foreign-key coverage."
  ;; OSS cannot create tenants and does not copy them, so only EE-created dumps are affected.
  #{{:child_table "core_user", :parent_table "tenant"}})

(def ^:private fk-graph-sql
  "Foreign keys from the test's H2 database."
  "SELECT DISTINCT LOWER(child.TABLE_NAME) AS child_table, LOWER(parent.TABLE_NAME) AS parent_table
     FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
     JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS child
       ON child.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
      AND child.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
     JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS parent
       ON parent.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
      AND parent.CONSTRAINT_SCHEMA = rc.UNIQUE_CONSTRAINT_SCHEMA")

(deftest copied-tables-include-foreign-key-targets-test
  (testing "every foreign key from a copied table references another copied table"
    (let [source (h2-data-source)]
      (try
        (mdb.setup/setup-db! :h2 source {:manage-encryption-state? false})
        (let [copied   (into #{} (map (comp name t2/table-name)) copy/entities)
              edges    (jdbc/query {:datasource source} [fk-graph-sql])
              dangling (for [{:keys [child_table parent_table] :as edge} edges
                             :when (and (copied child_table)
                                        (not (copied parent_table))
                                        (not (foreign-key-coverage-exceptions edge)))]
                         edge)]
          (testing "the metadata query includes app tables"
            (is (some #(= "metabase_table" (:child_table %)) edges)))
          (is (empty? dangling)
              "Copied tables reference tables that are not copied"))
        (finally
          (shutdown! source))))))

(def ^:private autoinc-id-tables-sql
  "Tables whose `id` column auto-increments, from the test's H2 database."
  "SELECT LOWER(TABLE_NAME) AS table_name
     FROM INFORMATION_SCHEMA.COLUMNS
    WHERE COLUMN_NAME = 'ID' AND IS_IDENTITY = 'YES'")

(deftest entities-without-autoinc-ids-covers-every-copied-table-test
  (testing "entities-without-autoinc-ids names exactly the copied tables whose id does not auto-increment"
    (let [source (h2-data-source)]
      (try
        (mdb.setup/setup-db! :h2 source {:manage-encryption-state? false})
        (let [autoinc (into #{} (map :table_name) (jdbc/query {:datasource source} [autoinc-id-tables-sql]))]
          (testing "the metadata query includes app tables"
            (is (contains? autoinc "metabase_table")))
          (is (= (into #{} (remove (comp autoinc name t2/table-name)) copy/entities)
                 @#'copy/entities-without-autoinc-ids)
              (format "%s decides which tables get their id sequence reset after a load"
                      `copy/entities-without-autoinc-ids)))
        (finally
          (shutdown! source))))))
