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
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.persistence :as qp.persistence]
   [metabase.query-processor.middleware.workspace-remapping :as qp.workspace-remapping]
   [metabase.query-processor.writeback :as qp.writeback]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.util.json :as json]
   [metabase.workspaces.core :as ws]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- execute-sql! [& statements]
  (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec (lib.metadata/database (mt/metadata-provider)))]
    (doseq [statement statements]
      (jdbc/execute! conn [statement]))))

(defn- query-sql [sql]
  (rest (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec (lib.metadata/database (mt/metadata-provider))) [sql]
                    {:as-arrays? true})))

(defn- random-identifier [prefix]
  (str prefix "_" (str/replace (subs (str (random-uuid)) 0 8) "-" "_")))

(defn- workspace-json
  "The `instance-workspace` setting value mapping `main-schema` of the current test database to `scratch`."
  [main-schema scratch]
  (json/encode {:name "test workspace", :databases {(:name (mt/db)) {:schemas {main-schema scratch}}}}))

(defn- rows [query]
  (mt/rows (qp/process-query query)))

(defn- table-exists? [schema table-name]
  (driver/table-exists? :postgres (lib.metadata/database (mt/metadata-provider)) {:schema schema, :name table-name}))

(defn- do-with-postgres-workspace!
  "Run `(f scratch)` on a copy of the Postgres test database in workspace mode, with `public` mapped to a fresh scratch
  schema."
  [f]
  (mt/test-driver :postgres
    (mt/with-temp-copy-of-db
      (let [scratch (random-identifier "mb__isolation_test")]
        (execute-sql! (format "CREATE SCHEMA %s" scratch))
        (try
          (mt/with-temporary-setting-values [instance-workspace (workspace-json "public" scratch)]
            (mt/with-model-cleanup [:model/TableRemapping :model/Transform]
              (f scratch)))
          (finally
            (execute-sql! (format "DROP SCHEMA %s CASCADE" scratch))))))))

(defn- create-transform! [source table-name]
  (t2/insert-returning-instance! :model/Transform
                                 {:name   (str "workspace transform " table-name)
                                  :source {:type :query, :query source}
                                  :target {:type "table", :schema "public", :name table-name}}))

(defn- native-transform! [sql table-name]
  (create-transform! (lib/native-query (mt/metadata-provider) sql) table-name))

(defn- run-transform! [transform]
  (transforms.execute/execute! transform {:run-method :manual}))

(defn- remappings []
  (t2/select [:model/TableRemapping :from_schema :from_table_name :to_schema :to_table_name] :database_id (mt/id)))

(deftest transform-query-and-sync-in-workspace-mode-test
  (do-with-postgres-workspace!
   (fn [scratch]
     (let [table-name (random-identifier "ws_orders")]
       (run-transform! (native-transform! "SELECT 1 AS id, 'scratch' AS source" table-name))
       (testing "the transform writes to the scratch namespace and records the remapping"
         (is (table-exists? scratch table-name))
         (is (not (table-exists? "public" table-name)))
         (is (= [{:from_schema "public", :from_table_name table-name, :to_schema scratch, :to_table_name table-name}]
                (remappings))))
       (let [table (t2/select-one :model/Table :db_id (mt/id) :name table-name)
             mp    (mt/metadata-provider)]
         (testing "the app DB keeps the table under its main name, with the scratch table's columns"
           (is (=? {:schema "public", :active true} table))
           (is (= #{"id" "source"} (set (t2/select-fn-set :name :model/Field :table_id (:id table))))))
         (testing "an MBQL query on the main table reads the scratch table"
           (is (= [[1 "scratch"]] (rows (lib/query mp (lib.metadata/table mp (:id table)))))))
         (testing "MBQL compiles straight to the scratch table: QP setup binds the remapping metadata provider"
           (is (str/includes? (:query (qp.compile/compile (lib/query mp (lib.metadata/table mp (:id table)))))
                              scratch)))
         (testing "a native query naming the main table reads the scratch table"
           (is (= [["scratch"]] (rows (mt/native-query {:query (format "SELECT source FROM public.%s" table-name)})))))
         (testing "an MBQL stage over a native stage runs the compiled SQL, which is rewritten too"
           (is (= [["scratch"]]
                  (rows (-> (lib/native-query mp (format "SELECT source FROM public.%s" table-name))
                            lib/append-stage)))))
         (testing "a native query that names the remapped table without its schema is refused, not run against main"
           (is (thrown-with-msg? Exception #"without a schema"
                                 (qp/process-query (mt/native-query {:query (format "SELECT source FROM %s" table-name)})))))
         (testing "a native query that can't be parsed is refused"
           (is (thrown? Exception
                        (qp/process-query (mt/native-query {:query (format "SELECT source FROM public.%s WHERE (((" table-name)})))))
         (testing "sync hides the scratch namespace and keeps the remapped table under its main name"
           (execute-sql! (format "CREATE TABLE %s.stray (a int)" scratch))
           (sync/sync-database! (mt/id) {:scan :schema})
           (is (not (t2/exists? :model/Table :db_id (mt/id) :schema scratch)))
           (is (=? {:schema "public", :active true} (t2/select-one :model/Table :id (:id table))))))))))

(deftest transforms-read-remapped-tables-test
  (do-with-postgres-workspace!
   (fn [_scratch]
     (let [source-name (random-identifier "ws_source")]
       (run-transform! (native-transform! "SELECT 7 AS n" source-name))
       (testing "a native transform reading a remapped table reads the scratch table (its SQL is rewritten too)"
         (let [target (random-identifier "ws_native_reader")]
           (run-transform! (native-transform! (format "SELECT n * 2 AS n FROM public.%s" source-name) target))
           (is (= [[14]] (rows (mt/native-query {:query (format "SELECT n FROM public.%s" target)}))))))
       (testing "an MBQL transform reading a remapped table reads the scratch table"
         (let [target (random-identifier "ws_mbql_reader")
               mp     (mt/metadata-provider)
               source (lib/query mp (lib.metadata/table mp (t2/select-one-pk :model/Table :db_id (mt/id) :name source-name)))]
           (run-transform! (create-transform! source target))
           (is (= [[7]] (rows (mt/native-query {:query (format "SELECT n FROM public.%s" target)}))))))))))

(deftest failed-run-records-no-remapping-test
  (do-with-postgres-workspace!
   (fn [scratch]
     (let [table-name (random-identifier "ws_failing")]
       (execute-sql! (format "CREATE TABLE public.%s (source text)" table-name)
                     (format "INSERT INTO public.%s VALUES ('main')" table-name))
       (try
         (sync/sync-database! (mt/id) {:scan :schema})
         (try
           (run-transform! (native-transform! "SELECT 1/0 AS x" table-name))
           (catch Exception _))
         (testing "a run that fails records no remapping, so reads keep going to the main table"
           (is (not (table-exists? scratch table-name)))
           (is (= [] (remappings)))
           (is (= [["main"]] (rows (mt/native-query {:query (format "SELECT source FROM public.%s" table-name)})))))
         (testing "and sync keeps the main table"
           (sync/sync-database! (mt/id) {:scan :schema})
           (is (t2/select-one-fn :active :model/Table :db_id (mt/id) :schema "public" :name table-name)))
         (finally
           (execute-sql! (format "DROP TABLE public.%s" table-name))))))))

(deftest target-table-exists-and-delete-test
  (do-with-postgres-workspace!
   (fn [scratch]
     (let [table-name (random-identifier "ws_shadow")]
       (execute-sql! (format "CREATE TABLE public.%s (source text)" table-name))
       (try
         (let [transform (native-transform! "SELECT 'scratch' AS source" table-name)]
           (testing "'does the target exist' asks about the scratch table, not the main one"
             (is (false? (transforms-base.u/target-table-exists? transform)))
             (run-transform! transform)
             (is (true? (transforms-base.u/target-table-exists? transform))))
           (testing "deleting the transform's table drops the scratch table and its remapping, never the main table"
             (transforms-base.u/delete-target-table! (t2/select-one :model/Transform :id (:id transform)))
             (is (not (table-exists? scratch table-name)))
             (is (table-exists? "public" table-name))
             (is (= [] (remappings)))))
         (finally
           (execute-sql! (format "DROP TABLE public.%s" table-name))))))))

(deftest writeback-writes-to-scratch-test
  (do-with-postgres-workspace!
   (fn [scratch]
     (let [table-name (random-identifier "ws_written")]
       (run-transform! (native-transform! "SELECT 'scratch' AS source" table-name))
       (testing "an action's write to a remapped table goes to the scratch table"
         (mt/with-current-user (mt/user->id :crowberto)
           (qp.writeback/execute-write-sql! (mt/id) (format "INSERT INTO public.%s VALUES ('action')" table-name)))
         (is (= [["action"]] (query-sql (format "SELECT source FROM %s.%s WHERE source = 'action'" scratch table-name))))
         (is (not (table-exists? "public" table-name))))))))

(deftest unmapped-target-schema-is-refused-test
  (mt/test-driver :postgres
    (mt/with-temporary-setting-values [instance-workspace (workspace-json "sales" "mb__isolation_test_sales")]
      (mt/with-model-cleanup [:model/TableRemapping]
        (testing "a transform whose target schema the workspace does not map does not run"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can't write to schema \"public\""
                                (ws/resolve-transform-target (mt/id) {:type "table", :schema "public", :name "t"})))
          (is (zero? (t2/count :model/TableRemapping :database_id (mt/id)))))))))

(deftest unsupported-engine-fails-closed-test
  (testing "a workspace naming a database that is not Postgres-family refuses its transforms instead of writing main"
    (mt/with-temp [:model/Database {db-id :id, db-name :name} {:engine :h2}]
      (mt/with-temporary-setting-values [instance-workspace (json/encode {:name      "w"
                                                                          :databases {db-name {:schemas {"PUBLIC" "SCRATCH"}}}})]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"support only Postgres-family"
                              (ws/resolve-transform-target db-id {:type "table", :schema "PUBLIC", :name "T"})))))))

(def ^:private remaps
  {{:schema "public", :table "orders"} {:schema "mb__iso_public", :table "orders"}})

(deftest rewrite-sql-test
  (testing "qualified references are rewritten"
    (is (str/includes? (ws/rewrite-sql :postgres remaps "SELECT * FROM public.orders") "mb__iso_public")))
  (testing "a remapped table named without its schema is refused, whatever its case"
    (doseq [sql ["SELECT * FROM orders" "SELECT * FROM ORDERS o JOIN public.x ON true"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"without a schema" (ws/rewrite-sql :postgres remaps sql)))))
  (testing "other tables named without a schema, and CTEs, are left alone"
    (is (= "SELECT * FROM customers" (ws/rewrite-sql :postgres remaps "SELECT * FROM customers")))
    (is (str/includes? (ws/rewrite-sql :postgres remaps "WITH o AS (SELECT * FROM public.orders) SELECT * FROM o")
                       "mb__iso_public")))
  (testing "SQL that can't be parsed is refused"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"could not parse" (ws/rewrite-sql :postgres remaps "SELEC * FRM public.orders")))))

(deftest execution-middleware-test
  (mt/with-dynamic-fn-redefs [ws/table-remappings (fn [database-id] (when (= database-id 1) remaps))]
    (binding [driver/*driver* :postgres]
      (testing "the native stage and the compiled SQL are rewritten"
        (is (=? {:stages      [{:native #"(?s).*mb__iso_public.*"}]
                 :qp/compiled {:query #"(?s).*mb__iso_public.*"}}
                (qp.workspace-remapping/rewrite-query
                 {:database    1
                  :stages      [{:lib/type :mbql.stage/native, :native "SELECT * FROM public.orders"}]
                  :qp/compiled {:query "SELECT * FROM public.orders"}}))))
      (testing "a database without remappings is left alone"
        (let [query {:database 2, :qp/compiled {:query "SELECT * FROM orders"}}]
          (is (= query (qp.workspace-remapping/rewrite-query query)))))
      (testing "a query on a remapped database bypasses the result cache"
        (let [seen (atom nil)
              qp   (qp.workspace-remapping/bypass-cache-when-remapped (fn [query _rff] (reset! seen query)))]
          (qp {:database 1, :cache-strategy {:type :ttl}} nil)
          (is (not (contains? @seen :cache-strategy)))
          (qp {:database 2, :cache-strategy {:type :ttl}} nil)
          (is (contains? @seen :cache-strategy)))))))

(deftest persisted-models-are-skipped-in-workspace-mode-test
  (let [query {:database 1, :stages [{:lib/type :mbql.stage/mbql, :persisted-info/native "SELECT * FROM cache_table"}]}]
    (mt/with-temporary-setting-values [instance-workspace (workspace-json "PUBLIC" "SCRATCH")]
      (let [stage (first (:stages (qp.persistence/substitute-persisted-query query)))]
        (is (not (contains? stage :persisted-info/native)))
        (is (true? (:qp/skip-persisted-cache stage)))))
    (mt/with-temporary-setting-values [instance-workspace nil]
      (is (= query (qp.persistence/substitute-persisted-query query))))))

(deftest outside-workspace-mode-no-remapping-lookup-test
  (testing "an instance outside workspace mode never reads remappings: not for queries, transforms or sync"
    (mt/with-temporary-setting-values [instance-workspace nil]
      (mt/with-dynamic-fn-redefs [ws.db/table-remappings-of-database (fn [_] (throw (ex-info "remappings were read" {})))]
        (let [mp (mt/metadata-provider)]
          (is (= 1 (count (rows (lib/limit (lib/query mp (lib.metadata/table mp (mt/id :venues))) 1))))))
        (is (= [[1]] (rows (mt/native-query {:query "SELECT 1"}))))
        (is (false? (ws/workspace-mode?)))
        (is (nil? (ws/workspace-schemas (mt/db))))
        (is (=? {:total-fields pos-int?}
                (sync/sync-fields-for-table! (t2/select-one :model/Table :id (mt/id :venues))))))
      (testing "the transform hooks make no app-DB query at all"
        (let [target {:type "table", :schema "PUBLIC", :name "T"}]
          (ws/workspace-mode?)
          (t2/with-call-count [call-count]
            (is (= target (ws/resolve-transform-target (mt/id) target)))
            (is (= target (ws/transform-output-to-drop (mt/id) target)))
            (ws/record-transform-output! (mt/id) target)
            (ws/forget-transform-output! (mt/id) target)
            (is (zero? (call-count))))))))
  (testing "the same reads in workspace mode do look remappings up, so the check above can fail"
    (mt/with-temporary-setting-values [instance-workspace (workspace-json "PUBLIC" "SCRATCH")]
      (mt/with-dynamic-fn-redefs [ws.db/table-remappings-of-database (fn [_] (throw (ex-info "remappings were read" {})))]
        (is (thrown-with-msg? Exception #"remappings were read"
                              (qp/process-query (mt/native-query {:query "SELECT 1"}))))))))
