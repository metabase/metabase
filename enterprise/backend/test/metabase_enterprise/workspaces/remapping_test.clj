(ns ^:mb/driver-tests metabase-enterprise.workspaces.remapping-test
  "Workspace mode end to end: a transform writes to its scratch namespace, queries and sync read the scratch table under
  the main name, and an instance outside workspace mode never looks for remappings."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.util.json :as json]
   [metabase.workspaces.core :as ws]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- execute-sql! [& statements]
  (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec (lib.metadata/database (mt/metadata-provider)))]
    (doseq [statement statements]
      (jdbc/execute! conn [statement]))))

(defn- random-identifier [prefix]
  (str prefix "_" (str/replace (subs (str (random-uuid)) 0 8) "-" "_")))

(defn- workspace-json
  "The `instance-workspace` setting value mapping `main-schema` of the current test database to `scratch`."
  [main-schema scratch]
  (json/encode {:name "test workspace", :databases {(:name (mt/db)) {:schemas {main-schema scratch}}}}))

(defn- rows [query]
  (mt/rows (qp/process-query query)))

(deftest transform-query-and-sync-in-workspace-mode-test
  (mt/test-driver :postgres
    (mt/with-temp-copy-of-db
      (let [main-schema "public"
            scratch     (random-identifier "mb__isolation_test")
            table-name  (random-identifier "ws_orders")]
        (execute-sql! (format "CREATE SCHEMA %s" scratch))
        (try
          (mt/with-temporary-setting-values [instance-workspace (workspace-json main-schema scratch)]
            (mt/with-model-cleanup [:model/TableRemapping :model/Transform]
              (mt/with-temp [:model/Transform transform
                             {:name   "workspace transform"
                              :source {:type  :query
                                       :query (lib/native-query (mt/metadata-provider)
                                                                "SELECT 1 AS id, 'scratch' AS source")}
                              :target {:type "table", :schema main-schema, :name table-name}}]
                (transforms.execute/execute! transform {:run-method :manual})
                (testing "the transform writes to the scratch namespace and records the remapping"
                  (let [database (lib.metadata/database (mt/metadata-provider))]
                    (is (driver/table-exists? :postgres database {:schema scratch, :name table-name}))
                    (is (not (driver/table-exists? :postgres database {:schema main-schema, :name table-name}))))
                  (is (= [{:from_schema main-schema, :from_table_name table-name
                           :to_schema scratch,       :to_table_name table-name}]
                         (t2/select [:model/TableRemapping :from_schema :from_table_name :to_schema :to_table_name]
                                    :database_id (mt/id)))))
                (let [table (t2/select-one :model/Table :db_id (mt/id) :name table-name)]
                  (testing "the app DB keeps the table under its main name, with the scratch table's columns"
                    (is (=? {:schema main-schema, :active true} table))
                    (is (= #{"id" "source"} (set (t2/select-fn-set :name :model/Field :table_id (:id table))))))
                  (testing "an MBQL query on the main table reads the scratch table"
                    (let [mp (mt/metadata-provider)]
                      (is (= [[1 "scratch"]]
                             (rows (lib/query mp (lib.metadata/table mp (:id table))))))))
                  (testing "a native query naming the main table reads the scratch table"
                    (is (= [["scratch"]]
                           (rows (mt/native-query {:query (format "SELECT source FROM %s.%s" main-schema table-name)})))))
                  (testing "a native query that can't be parsed is refused"
                    (is (thrown? Exception
                                 (qp/process-query (mt/native-query {:query (format "SELECT source FROM %s.%s WHERE (((" main-schema table-name)})))))
                  (testing "sync hides the scratch namespace and keeps the remapped table under its main name"
                    (execute-sql! (format "CREATE TABLE %s.stray (a int)" scratch))
                    (sync/sync-database! (mt/id) {:scan :schema})
                    (is (not (t2/exists? :model/Table :db_id (mt/id) :schema scratch)))
                    (is (=? {:schema main-schema, :active true}
                            (t2/select-one :model/Table :id (:id table)))))))))
          (finally
            (execute-sql! (format "DROP SCHEMA %s CASCADE" scratch))))))))

(deftest unmapped-target-schema-is-refused-test
  (mt/test-driver :postgres
    (mt/with-temporary-setting-values [instance-workspace (workspace-json "sales" "mb__isolation_test_sales")]
      (mt/with-model-cleanup [:model/TableRemapping]
        (testing "a transform whose target schema the workspace does not map does not run"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can't write to schema \"public\""
                                (ws/resolve-transform-target (mt/id) {:type "table", :schema "public", :name "t"})))
          (is (zero? (t2/count :model/TableRemapping))))))))

(deftest outside-workspace-mode-no-remapping-lookup-test
  (testing "an instance outside workspace mode never reads remappings: not for queries, transforms or sync"
    (mt/with-temporary-setting-values [instance-workspace nil]
      (mt/with-dynamic-fn-redefs [ws.db/table-remappings-of-database (fn [_] (throw (ex-info "remappings were read" {})))]
        (let [mp (mt/metadata-provider)]
          (is (= 1 (count (rows (lib/limit (lib/query mp (lib.metadata/table mp (mt/id :venues))) 1))))))
        (is (= [[1]] (rows (mt/native-query {:query "SELECT 1"}))))
        (is (false? (ws/workspace-mode?)))
        (is (nil? (ws/workspace-schemas (mt/db))))
        (is (= {:type "table", :schema "PUBLIC", :name "T"}
               (ws/resolve-transform-target (mt/id) {:type "table", :schema "PUBLIC", :name "T"})))
        (is (=? {:total-fields pos-int?}
                (sync/sync-fields-for-table! (t2/select-one :model/Table :id (mt/id :venues))))))))
  (testing "the same reads in workspace mode do look remappings up, so the check above can fail"
    (mt/with-temporary-setting-values [instance-workspace (workspace-json "PUBLIC" "SCRATCH")]
      (mt/with-dynamic-fn-redefs [ws.db/table-remappings-of-database (fn [_] (throw (ex-info "remappings were read" {})))]
        (is (thrown-with-msg? Exception #"remappings were read"
                              (qp/process-query (mt/native-query {:query "SELECT 1"}))))))))
