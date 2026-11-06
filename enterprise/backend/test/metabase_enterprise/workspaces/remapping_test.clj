(ns ^:mb/driver-tests metabase-enterprise.workspaces.remapping-test
  "Workspace mode end to end: a transform writes to its scratch namespace, queries and sync read the scratch table under
  the main name, and an instance outside workspace mode never looks for remappings."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.core :as ee.ws]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.actions.core :as actions]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.test-metadata :as meta]
   [metabase.model-persistence.core :as model-persistence]
   [metabase.model-persistence.task.persist-refresh :as persist-refresh]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.query-processor.middleware.workspace-remapping :as qp.workspace-remapping]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.writeback :as qp.writeback]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.upload.core :as upload]
   [metabase.util :as u]
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
       ;; the realistic case: the transform targets a table that already exists in main, with a column the transform
       ;; drops, and the transform adds a column main does not have
       (execute-sql! (format "CREATE TABLE public.%s (id int PRIMARY KEY, source text, main_only text)" table-name)
                     (format "INSERT INTO public.%s VALUES (1, 'main', 'm')" table-name))
       (try
         (sync/sync-database! (mt/id) {:scan :schema})
         (run-transform! (native-transform! "SELECT 1 AS id, 'scratch' AS source, 'x' AS scratch_only" table-name))
         (testing "the transform writes to the scratch namespace and records the remapping; main is untouched"
           (is (table-exists? scratch table-name))
           (is (= [[1 "main" "m"]] (query-sql (format "SELECT * FROM public.%s" table-name))))
           (is (= [{:from_schema "public", :from_table_name table-name, :to_schema scratch, :to_table_name table-name}]
                  (remappings))))
         (let [table      (t2/select-one :model/Table :db_id (mt/id) :schema "public" :name table-name)
               field-set  #(t2/select-fn-set :name :model/Field :table_id (:id table) :active true)
               mbql       #(let [mp (mt/metadata-provider)] (lib/query mp (lib.metadata/table mp (:id table))))
               scratch-re (re-pattern scratch)]
           (testing "the app DB keeps the table under its main name, with the scratch table's columns"
             (is (=? {:schema "public", :active true} table))
             (is (= #{"id" "source" "scratch_only"} (field-set))))
           (testing "a full sync keeps the scratch table's columns, not main's"
             (sync/sync-database! (mt/id) {:scan :schema})
             (is (= #{"id" "source" "scratch_only"} (field-set))))
           (testing "compiling MBQL shows main names (Convert to SQL, POST /api/dataset/native)"
             (let [sql (:query (qp.compile/compile (mbql)))]
               (is (str/includes? sql (format "\"public\".\"%s\"" table-name)))
               (is (not (re-find scratch-re sql)))))
           (testing "running the MBQL query reads the scratch table, scratch-only column included"
             (let [result (qp/process-query (mbql))]
               (is (= [[1 "scratch" "x"]] (mt/rows result)))
               (testing "while native_form shows main names"
                 (is (not (re-find scratch-re (get-in result [:data :native_form :query])))))))
           (testing "a native query naming the main table reads the scratch table"
             (is (= [["scratch"]] (rows (mt/native-query {:query (format "SELECT source FROM public.%s" table-name)})))))
           (testing "native result metadata describes the scratch table"
             (is (= ["id" "source" "scratch_only"]
                    (mapv :name (qp.metadata/result-metadata
                                 (lib/native-query (mt/metadata-provider) (format "SELECT * FROM public.%s" table-name)))))))
           (testing "an MBQL stage over a native stage runs the compiled SQL, which is rewritten too"
             (is (= [["scratch"]]
                    (rows (-> (lib/native-query (mt/metadata-provider) (format "SELECT source FROM public.%s" table-name))
                              lib/append-stage)))))
           (testing "a native query that names the remapped table without its schema is refused, not run against main"
             (is (thrown-with-msg? Exception #"without a schema"
                                   (qp/process-query (mt/native-query {:query (format "SELECT source FROM %s" table-name)})))))
           (testing "statements SQLGlot can't see into, and SQL it can't parse, are refused"
             (doseq [sql [(format "EXPLAIN SELECT * FROM public.%s" table-name)
                          (format "SELECT source FROM public.%s WHERE (((" table-name)]]
               (is (thrown? Exception (qp/process-query (mt/native-query {:query sql}))))))
           (testing "sync hides the scratch namespace and keeps the remapped table under its main name"
             (execute-sql! (format "CREATE TABLE %s.stray (a int)" scratch))
             (sync/sync-database! (mt/id) {:scan :schema})
             (is (not (t2/exists? :model/Table :db_id (mt/id) :schema scratch)))
             (is (=? {:schema "public", :active true} (t2/select-one :model/Table :id (:id table))))))
         (finally
           (execute-sql! (format "DROP TABLE public.%s" table-name))))))))

(deftest one-remapping-read-per-query-test
  (do-with-postgres-workspace!
   (fn [_scratch]
     (let [table-name (random-identifier "ws_once")]
       (run-transform! (native-transform! "SELECT 1 AS id" table-name))
       (testing "QP setup reads the remappings once; the cache bypass and the rewrite reuse them"
         (let [reads (atom 0)
               read  (dynamic-redefs/original-fn #'ws.db/table-remappings-of-database)]
           (mt/with-dynamic-fn-redefs [ws.db/table-remappings-of-database (fn [id] (swap! reads inc) (read id))]
             (is (= [[1]] (rows (mt/native-query {:query (format "SELECT id FROM public.%s" table-name)}))))
             (is (= 1 @reads)))))))))

(deftest incremental-target-moved-to-scratch-test
  (do-with-postgres-workspace!
   (fn [scratch]
     (let [table-name (random-identifier "ws_incr")
           transform  (t2/insert-returning-instance!
                       :model/Transform
                       {:name                  "incremental"
                        :source                {:type                        :query
                                                :query                       (lib/native-query (mt/metadata-provider) "SELECT 1 AS id")
                                                :source-incremental-strategy {:type "checkpoint", :checkpoint-filter-field-id 1}}
                        :target                {:type "table-incremental", :schema "public", :name table-name
                                                :target-incremental-strategy {:type "append"}}
                        :last_checkpoint_value "42"})
           resolve    #(:full-incremental-run? (#'transforms.execute/resolve-target (t2/select-one :model/Transform :id (:id transform))))]
       (testing "with a watermark but no scratch table to append to, the run starts over"
         (is (true? (resolve))))
       (testing "once the scratch table exists, the watermark holds"
         (execute-sql! (format "CREATE TABLE %s.%s (id int)" scratch table-name))
         (is (false? (resolve))))))))

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
       (execute-sql! (format "CREATE TABLE public.%s (source text, main_only text)" table-name))
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
             (is (= [] (remappings))))
           (testing "and the main table's app-DB row stays active, describing the main table again"
             (let [table (t2/select-one :model/Table :db_id (mt/id) :schema "public" :name table-name)]
               (is (true? (:active table)))
               (is (= #{"source" "main_only"} (t2/select-fn-set :name :model/Field :table_id (:id table) :active true))))))
         (finally
           (execute-sql! (format "DROP TABLE public.%s" table-name))))))))

(deftest writeback-is-refused-on-a-workspace-database-test
  (do-with-postgres-workspace!
   (fn [scratch]
     (let [table-name (random-identifier "ws_written")]
       (run-transform! (native-transform! "SELECT 'scratch' AS source" table-name))
       (testing "a native action's write gets a 400: native SQL is read-only on a workspace"
         (is (=? {:status-code 400}
                 (ex-data (is (thrown-with-msg? clojure.lang.ExceptionInfo #"native SQL is read-only"
                                                (mt/with-current-user (mt/user->id :crowberto)
                                                  (qp.writeback/execute-write-sql!
                                                   (mt/id) (format "INSERT INTO public.%s VALUES ('action')" table-name))))))))
         (is (= [] (query-sql (format "SELECT source FROM %s.%s WHERE source = 'action'" scratch table-name)))))))))

(deftest native-sql-is-read-only-on-a-workspace-database-test
  (do-with-postgres-workspace!
   (fn [_scratch]
     (testing "before any transform has run (no remappings yet), native SQL on a workspace database is read-only"
       (is (= [] (remappings)))
       (is (thrown-with-msg? Exception #"can run on a workspace, not CREATE"
                             (qp/process-query (mt/native-query {:query "CREATE TABLE public.ws_never AS SELECT 1 AS x"}))))
       (is (= [[1]] (rows (mt/native-query {:query "SELECT 1"}))))))))

(deftest transform-body-must-be-read-only-test
  (do-with-postgres-workspace!
   (fn [scratch]
     (let [table-name (random-identifier "ws_bad_body")]
       (testing "a transform whose own SQL writes is refused; Metabase's CREATE TABLE AS around a SELECT body still runs"
         (is (thrown-with-msg? Exception #"this one contains DELETE"
                               (run-transform! (native-transform! "WITH w AS (DELETE FROM public.customers RETURNING 1 AS x) SELECT * FROM w"
                                                                  table-name))))
         (is (not (table-exists? scratch table-name))))))))

(deftest unmapped-target-schema-is-refused-test
  (mt/test-driver :postgres
    (mt/with-temporary-setting-values [instance-workspace (workspace-json "sales" "mb__isolation_test_sales")]
      (mt/with-model-cleanup [:model/TableRemapping]
        (testing "a transform whose target schema the workspace does not map does not run"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"can't write to schema \"public\""
                                (ws/resolve-transform-target (mt/id) {:type "table", :schema "public", :name "t"})))
          (is (zero? (t2/count :model/TableRemapping :database_id (mt/id)))))))))

(deftest unsupported-engine-fails-closed-test
  (testing "a workspace naming a database that is not Postgres refuses its transforms instead of writing main"
    (doseq [engine [:h2 :redshift]]
      (mt/with-temp [:model/Database {db-id :id, db-name :name} {:engine engine}]
        (mt/with-temporary-setting-values [instance-workspace (json/encode {:name      "w"
                                                                            :databases {db-name {:schemas {"PUBLIC" "SCRATCH"}}}})]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                (re-pattern (str "is a " (name engine) " database; workspaces support only Postgres databases"))
                                (ws/resolve-transform-target db-id {:type "table", :schema "PUBLIC", :name "T"}))
              (name engine)))))))

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
  ;; the provider comes from the in-memory test metadata, not a test database: this test needs no warehouse, and
  ;; `driver/*driver*` is bound to :postgres only so SQLGlot reads Postgres SQL
  (let [mp       (lib.metadata.cached-provider/cached-metadata-provider meta/metadata-provider)
        carrying (qp.workspace-remapping/carry-remappings mp remaps)]
    (binding [driver/*driver* :postgres]
      (testing "the native stage and the compiled SQL are rewritten, with the remappings setup carried"
        (is (=? {:stages      [{:native #"(?s).*mb__iso_public.*"}]
                 :qp/compiled {:query #"(?s).*mb__iso_public.*"}}
                (qp.workspace-remapping/rewrite-query
                 {:lib/metadata carrying
                  :stages       [{:lib/type :mbql.stage/native, :native "SELECT * FROM public.orders"}]
                  :qp/compiled  {:query "SELECT * FROM public.orders"}}))))
      (testing "a query setup found no remappings for is left alone"
        (let [query {:lib/metadata mp, :qp/compiled {:query "SELECT * FROM public.orders"}}]
          (is (= query (qp.workspace-remapping/rewrite-query query)))))
      (testing "a query with remappings bypasses the result cache"
        (let [seen (atom nil)
              qp   (qp.workspace-remapping/bypass-cache-when-remapped (fn [query _rff] (reset! seen query)))]
          (qp {:lib/metadata carrying, :cache-strategy {:type :ttl}} nil)
          (is (not (contains? @seen :cache-strategy)))
          (qp {:lib/metadata mp, :cache-strategy {:type :ttl}} nil)
          (is (contains? @seen :cache-strategy)))))))

(deftest rewrite-sql-statement-allowlist-test
  (testing "anything but a read-only query is refused, naming the statement type"
    (doseq [[sql statement] [["INSERT INTO public.orders SELECT * FROM public.orders" "INSERT"]
                             ["UPDATE public.orders SET id = 1" "UPDATE"]
                             ["DELETE FROM public.orders" "DELETE"]
                             ["MERGE INTO public.orders t USING public.orders s ON t.id = s.id WHEN MATCHED THEN DELETE" "MERGE"]
                             ["CREATE TABLE public.x AS SELECT * FROM public.orders" "CREATE"]]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            (re-pattern (str "Only read-only queries \\(SELECT, WITH \\.\\.\\. SELECT, UNION\\) can run on a workspace, not "
                                             statement))
                            (ws/rewrite-sql :postgres remaps sql))
          sql)))
  (testing "a write or SELECT ... INTO inside a query is refused"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"this one contains INSERT"
                          (ws/rewrite-sql :postgres remaps "WITH w AS (INSERT INTO public.orders VALUES (1) RETURNING id) SELECT * FROM w")))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"this one contains DELETE"
                          (ws/rewrite-sql :postgres remaps "WITH w AS (DELETE FROM public.orders RETURNING id) SELECT * FROM w")))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"SELECT \.\.\. INTO creates a table"
                          (ws/rewrite-sql :postgres remaps "SELECT * INTO public.y FROM public.orders"))))
  (testing "statements sqlglot can't read into are refused"
    (doseq [sql ["EXPLAIN SELECT * FROM public.orders"
                 "DECLARE c CURSOR FOR SELECT * FROM public.orders"
                 "PREPARE p AS SELECT * FROM public.orders; EXECUTE p"
                 "DO $$ BEGIN PERFORM * FROM public.orders; END $$"
                 "CREATE FUNCTION f() RETURNS text LANGUAGE sql AS $$ SELECT src FROM public.orders $$"
                 "CREATE RULE r AS ON INSERT TO public.customers DO ALSO SELECT 1"
                 "COPY (SELECT * FROM public.orders) TO STDOUT"
                 "SET statement_timeout = 1000; SELECT * FROM public.orders"
                 "CREATE TABLE public.x AS EXECUTE p"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Only read-only queries \(SELECT, WITH \.\.\. SELECT, UNION\) can run on a workspace, not"
                            (ws/rewrite-sql :postgres remaps sql))
          sql))))

(deftest rewrite-sql-string-literals-test
  (testing "a backslash anywhere in the text is refused, inside dollar quotes and comments too: its meaning depends on
            the literal's kind and on standard_conforming_strings, so the server could read it differently from the check"
    (doseq [sql ["SELECT * FROM public.orders WHERE src ~ E'\\\\s+'"
                 "SELECT E'\\\\s+' AS r"
                 "SELECT 'a\\' AS r"
                 "SELECT 'a\\'' ; DELETE FROM public.customers; --'"
                 "SELECT N'a\\b' AS r"
                 "SELECT U&'d\\0061t' AS r"
                 "SELECT $$a\\b$$ AS r"
                 "SELECT 1 -- a comment with a \\ in it"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"The SQL has a backslash, which a workspace refuses"
                            (ws/rewrite-sql :postgres remaps sql))
          sql)))
  (testing "SQL with no replacement comes back exactly as written"
    (doseq [sql ["select  src   from public.customers  where name = 'x'"
                 "SELECT $$it's$$ AS q, E'no escapes' AS e, N'national' AS n"]]
      (is (= sql (ws/rewrite-sql :postgres remaps sql)))))
  (testing "row locks are refused"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"FOR UPDATE / FOR SHARE locks rows"
                          (ws/rewrite-sql :postgres remaps "SELECT * FROM public.orders FOR UPDATE")))))

(deftest rewrite-sql-dollar-and-unicode-test
  (testing "a $ followed by a digit is refused: Postgres reads $1 as a parameter where sqlglot reads $1a$ as a quote"
    (doseq [sql ["SELECT length(?), $1a$; DELETE FROM public.customers; SELECT length(?), $1a$"
                 "SELECT $1"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"has a \$ followed by a digit"
                            (ws/rewrite-sql :postgres remaps sql))
          sql)))
  (testing "a $ outside a valid dollar quote is refused"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"isn't part of a valid dollar quote"
                          (ws/rewrite-sql :postgres remaps "SELECT 'costs $ 5' AS c"))))
  (testing "valid dollar quotes run as written"
    (doseq [sql ["SELECT $$x$$ AS a, $tag$y$tag$ AS b, $_t1$z$_t1$ AS c"]]
      (is (= sql (ws/rewrite-sql :postgres remaps sql)))))
  (testing "SQL returned as written must keep its string literals through sqlglot's round trip"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"string literals don't survive sqlglot's round trip"
                          (ws/rewrite-sql :postgres remaps "SELECT INTERVAL '1' DAY")))
    (doseq [sql ["SELECT INTERVAL '1 day' AS i, date_trunc('month', now()) AS m"
                 "SELECT 'x' 'y' AS r, '{1,2}'::int[] AS a"]]
      (is (= sql (ws/rewrite-sql :postgres remaps sql)))))
  (testing "Unicode escapes are refused, with or without a backslash"
    (doseq [sql ["SELECT U&'d!0061t' UESCAPE '!' AS r"
                 "SELECT U&'data' AS r"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"has a Unicode escape"
                            (ws/rewrite-sql :postgres remaps sql))
          sql))
    (testing "(forms sqlglot can't parse at all are refused before that check)"
      (doseq [sql ["SELECT 1 AS U&\"x\""
                   "SELECT name FROM public.customers WHERE name = 'a' UESCAPE '!'"]]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"has a Unicode escape|could not parse"
                              (ws/rewrite-sql :postgres remaps sql))
            sql)))))

(deftest rewrite-sql-side-effect-functions-test
  (testing "a function with a side effect is refused, by name or family, however its name is written"
    (doseq [function ["nextval" "setval" "txid_current" "pg_switch_wal" "pg_create_logical_replication_slot"
                      "pg_logical_emit_message" "pg_stat_reset" "lo_creat" "lo_import" "lo_unlink" "set_config" "pg_advisory_lock"
                      "pg_advisory_xact_lock_shared" "pg_try_advisory_lock" "pg_terminate_backend" "pg_cancel_backend"
                      "pg_reload_conf" "pg_sleep" "pg_sleep_for"]
            sql      [(format "SELECT %s(1)" function)
                      (format "SELECT pg_catalog.\"%s\"(1)" function)
                      (format "SELECT id FROM public.orders WHERE id = %s(1)" function)]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo (re-pattern (str "calls " function ", which has a side effect"))
                            (ws/rewrite-sql :postgres remaps sql))
          sql))))

(deftest rewrite-sql-sql-running-functions-test
  (testing "a call to a function that runs SQL or reads a table named in text is refused, however its name is written"
    (doseq [[sql function] [["SELECT query_to_xml('select 1', true, true, '')" "query_to_xml"]
                            ["SELECT pg_catalog.\"query_to_xml\"('select 1', true, true, '')" "query_to_xml"]
                            ["SELECT * FROM public.\"dblink\"('dbname=x', 'select 1') AS t(a int)" "dblink"]
                            ["SELECT ts_stat('select 1')" "ts_stat"]
                            ["SELECT * FROM crosstab('select 1')" "crosstab"]
                            ["SELECT table_to_xml('public.orders', true, true, '')" "table_to_xml"]
                            ["SELECT schema_to_xml('public', true, true, '')" "schema_to_xml"]]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo (re-pattern (str "calls " function ", which runs SQL"))
                            (ws/rewrite-sql :postgres remaps sql))
          sql)))
  (testing "every dblink function is refused, by prefix, however its name is written"
    (doseq [function ["dblink_get_result" "dblink_build_sql_insert" "dblink_build_sql_update" "dblink_build_sql_delete"
                      "dblink_connect" "dblink_connect_u" "dblink_get_pkey" "dblink_get_notify" "dblink_close"
                      "dblink_cancel_query" "dblink_disconnect" "dblink_is_busy" "dblink_error_message"]
            sql      [(format "SELECT %s('c')" function)
                      (format "SELECT public.\"%s\"('c')" function)]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo (re-pattern (str "calls " function ", which runs SQL"))
                            (ws/rewrite-sql :postgres remaps sql))
          sql)))
  (testing "a function argument that is SQL text naming a remapped table is refused"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"passes upper SQL text that names a remapped table"
                          (ws/rewrite-sql :postgres remaps "SELECT upper('select src from public.orders')")))))

(deftest rewrite-sql-allowed-statements-test
  (testing "read-only queries are rewritten"
    (doseq [sql ["SELECT * FROM public.orders"
                 "WITH x AS (SELECT 1) SELECT * FROM public.orders"
                 "SELECT 1 UNION ALL SELECT id FROM public.orders"
                 "SELECT id FROM public.orders INTERSECT SELECT id FROM public.orders"
                 "SELECT lower(src) FROM public.orders"]]
      (is (str/includes? (ws/rewrite-sql :postgres remaps sql) "mb__iso_public") sql))
    (is (= "SELECT upper('select 1 from public.customers')"
           (ws/rewrite-sql :postgres remaps "SELECT upper('select 1 from public.customers')"))
        "a string literal naming no remapped table is fine"))
  (testing "other replace-names callers, which don't ask for strictness, are unchanged"
    (is (= "SELECT QUERY_TO_XML('select * from public.orders', TRUE, TRUE, '')"
           (sql-tools/replace-names :postgres "SELECT query_to_xml('select * from public.orders', true, true, '')"
                                    {:tables remaps} {:allow-unused? true})))))

(deftest rewrite-sql-postgres-identifiers-test
  (testing "names match as Postgres stores them: unquoted ASCII letters lower-cased, every name cut to 63 bytes"
    (let [mixed {{:schema "public", :table "Mixed"} {:schema "mb__iso_public", :table "Mixed"}}]
      (is (str/includes? (ws/rewrite-sql :postgres mixed "SELECT * FROM public.\"Mixed\"") "mb__iso_public"))
      (is (= "SELECT * FROM public.mixed" (ws/rewrite-sql :postgres mixed "SELECT * FROM public.mixed")))
      (is (= "SELECT * FROM public.Mixed" (ws/rewrite-sql :postgres mixed "SELECT * FROM public.Mixed"))))
    (is (str/includes? (ws/rewrite-sql :postgres remaps "SELECT * FROM PUBLIC.ORDERS") "mb__iso_public"))
    (is (= "SELECT * FROM \"PUBLIC\".\"ORDERS\"" (ws/rewrite-sql :postgres remaps "SELECT * FROM \"PUBLIC\".\"ORDERS\"")))
    (testing "only A-Z fold: an unquoted Ä stays as written"
      (let [umlaut {{:schema "public", :table "Äbc"} {:schema "mb__iso_public", :table "Äbc"}}]
        (is (str/includes? (ws/rewrite-sql :postgres umlaut "SELECT * FROM public.ÄBC") "mb__iso_public"))))
    (testing "a name longer than 63 bytes names its first 63 bytes"
      (let [stored (str "orders" (apply str (repeat 57 "x")))
            long   {{:schema "public", :table stored} {:schema "mb__iso_public", :table stored}}]
        (is (str/includes? (ws/rewrite-sql :postgres long (str "SELECT * FROM public." stored "yyyy")) "mb__iso_public"))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"without a schema"
                              (ws/rewrite-sql :postgres long (str "SELECT * FROM " (u/upper-case-en stored) "yyyy"))))))))

(deftest persisted-models-are-not-used-in-workspace-mode-test
  (mt/test-driver :postgres
    (mt/with-temp-copy-of-db
      (let [mp          (mt/metadata-provider)
            query       (lib/query mp (lib.metadata/table mp (mt/id :venues)))
            card        (t2/insert-returning-instance! :model/Card {:name "model" :type :model :display :table
                                                                    :visualization_settings {} :creator_id (mt/user->id :crowberto)
                                                                    :database_id (mt/id) :dataset_query query})
            card-meta   (lib.metadata/card (mt/metadata-provider) (:id card))
            _           (t2/insert! :model/PersistedInfo {:card_id (:id card) :database_id (mt/id) :question_slug "model"
                                                          :table_name "model_cache_ws" :active true :state "persisted"
                                                          :creator_id (mt/user->id :crowberto)
                                                          :definition (model-persistence/metadata->definition (:result-metadata card-meta) "model_cache_ws")
                                                          :query_hash (model-persistence/query-hash (:dataset-query card-meta))})
            compiled    #(:query (qp.compile/compile (lib/native-query (mt/metadata-provider)
                                                                       (str "SELECT * FROM {{#" (:id card) "-model}} x"))))]
        (try
          (testing "outside workspace mode a {{#card}} tag on a persisted model reads its cache table"
            (mt/with-temporary-setting-values [instance-workspace nil]
              (is (str/includes? (compiled) "model_cache_ws"))))
          (testing "in workspace mode it compiles the model's query instead"
            (mt/with-temporary-setting-values [instance-workspace (workspace-json "public" "mb__iso_public")]
              (is (not (str/includes? (compiled) "model_cache_ws")))))
          (finally
            (t2/delete! :model/PersistedInfo :card_id (:id card))
            (t2/delete! :model/Card :id (:id card))))))))

(deftest persisted-model-jobs-skip-in-workspace-mode-test
  (let [calls       (atom [])
        job-context (reify org.quartz.JobExecutionContext (getTrigger [_] nil))]
    (mt/with-dynamic-fn-redefs [persist-refresh/prune-all-deletable! (fn [& _] (swap! calls conj :prune))
                                persist-refresh/refresh-tables!       (fn [& _] (swap! calls conj :refresh))
                                persist-refresh/job-context->job-type (fn [_] {"type" "database", "db-id" 1})]
      (mt/with-temporary-setting-values [instance-workspace (workspace-json "PUBLIC" "SCRATCH")]
        (#'persist-refresh/prune-job-fn! nil)
        (#'persist-refresh/refresh-job-fn! job-context)
        (is (= [] @calls) "a workspace neither refreshes nor prunes persisted models"))
      (mt/with-temporary-setting-values [instance-workspace nil]
        (#'persist-refresh/prune-job-fn! nil)
        (#'persist-refresh/refresh-job-fn! job-context)
        (is (= [:prune :refresh] @calls))))))

(deftest install-and-clear-are-atomic-test
  (mt/with-temp [:model/Database {db-id :id, db-name :name} {:name (mt/random-name), :engine :postgres}]
    (mt/with-temporary-setting-values [instance-workspace nil]
      (mt/with-model-cleanup [:model/TableRemapping]
        (ee.ws/set-instance-workspace! {:name "w", :databases {db-name {:schemas {"public" "scratch_a"}}}})
        (t2/insert! :model/TableRemapping {:database_id db-id :from_schema "public" :from_table_name "t"
                                           :to_schema "scratch_a" :to_table_name "t"})
        (testing "a POST that fails after deleting stale remappings keeps them (the delete rolls back)"
          (mt/with-dynamic-fn-redefs [ws.db/delete-table-remappings!
                                      (let [delete! (dynamic-redefs/original-fn #'ws.db/delete-table-remappings!)]
                                        (fn [ids]
                                          (delete! ids)
                                          (throw (ex-info "injected" {}))))]
            (is (thrown? Exception (ee.ws/set-instance-workspace!
                                    {:name "w", :databases {db-name {:schemas {"public" "scratch_b"}}}}))))
          (is (= 1 (t2/count :model/TableRemapping :database_id db-id))))
        (testing "a DELETE that fails after clearing the setting leaves the workspace installed, in the cache too"
          (mt/with-dynamic-fn-redefs [ws.db/delete-all-table-remappings! (fn [] (throw (ex-info "injected" {})))]
            (is (thrown? Exception (ee.ws/clear-instance-workspace!))))
          (is (true? (ws/workspace-mode?)))
          (is (= "scratch_a" (get-in (ee.ws/instance-workspace) [:databases db-name :schemas "public"]))))))))

(deftest instance-workspace-setting-is-read-only-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temporary-setting-values [instance-workspace nil]
      (testing "the settings API can't write the workspace: only POST/DELETE /api/ee/workspace-instance/current can"
        (is (re-find #"read-only setting"
                     (str (mt/user-http-request :crowberto :put 500 "setting/instance-workspace"
                                                {:value (workspace-json "PUBLIC" "SCRATCH")}))))
        (is (false? (ws/workspace-mode?)))
        (is (nil? (ee.ws/instance-workspace)))))))

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
      (testing "the remapping hooks make no app-DB query at all"
        (let [database    (mt/db)
              database-id (mt/id)]
          (ws/workspace-mode?)
          (t2/with-call-count [call-count]
            (is (nil? (ws/table-remappings database-id)))
            (is (nil? (ws/workspace-schemas database)))
            (is (nil? (ws/workspace-remappings database)))
            (is (zero? (call-count))))))
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

(deftest workspace-mode-edge-cases-test
  (mt/with-temporary-setting-values [instance-workspace (workspace-json "PUBLIC" "SCRATCH")]
    (mt/with-dynamic-fn-redefs [ws.db/table-remappings-of-database (fn [_] (throw (ex-info "remappings were read" {})))]
      (testing "QP setup does not look up remappings for an internal query, which has no warehouse database"
        (is (= :ran (qp.setup/with-qp-setup [_query {:type :internal, :fn "x", :database 13371337}] :ran)))))
    (testing "forgetting the output of a target without a schema does nothing (no remapping can name it)"
      (is (nil? (ws/forget-transform-output! (mt/id) {:type "table", :schema nil, :name "T"}))))))

(deftest stale-remappings-are-ignored-test
  (do-with-postgres-workspace!
   (fn [scratch]
     (t2/insert! :model/TableRemapping [{:database_id (mt/id) :from_schema "public" :from_table_name "kept"
                                         :to_schema scratch :to_table_name "kept"}
                                        {:database_id (mt/id) :from_schema "public" :from_table_name "stale"
                                         :to_schema "mb__isolation_old" :to_table_name "stale"}])
     (testing "a remapping whose scratch namespace is no longer the one the map gives its schema is ignored"
       (is (= {{:schema "public", :table "kept"} {:schema scratch, :table "kept"}}
              (ws/table-remappings (mt/id))))))))

(deftest writes-outside-transforms-are-refused-in-workspace-mode-test
  (testing "an upload is refused on a workspace instance"
    (mt/with-temporary-setting-values [instance-workspace (workspace-json "PUBLIC" "SCRATCH")]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Uploads are not available on a workspace instance"
                            (upload/create-csv-upload! {:collection-id nil, :filename "x.csv", :file (java.io.File. "x.csv")
                                                        :db-id (mt/id), :schema-name "PUBLIC"})))))
  (testing "deleting an upload, which drops its table, is refused on a workspace instance"
    (mt/with-temp [:model/Table table {:db_id (mt/id), :schema "PUBLIC", :name "UPLOADED", :is_upload true}]
      (mt/with-temporary-setting-values [instance-workspace (workspace-json "PUBLIC" "SCRATCH")]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Uploads are not available on a workspace instance"
                              (mt/with-current-user (mt/user->id :crowberto)
                                (upload/delete-upload! table)))))))
  (testing "a row action on a remapped table is refused"
    (do-with-postgres-workspace!
     (fn [_scratch]
       (let [table-name (random-identifier "ws_rows")]
         (run-transform! (native-transform! "SELECT 1 AS id" table-name))
         (t2/update! :model/Database :id (mt/id) {:settings {:database-enable-actions true}})
         (let [table-id (t2/select-one-pk :model/Table :db_id (mt/id) :schema "public" :name table-name)]
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"tables are written only by transforms"
                                 (mt/with-current-user (mt/user->id :crowberto)
                                   (actions/perform-action! :model.row/create
                                                            {:database (mt/id), :type :query, :query {:source-table table-id}
                                                             :create-row {"id" 2}}))))))))))

(deftest removing-remappings-re-syncs-main-tables-test
  (do-with-postgres-workspace!
   (fn [_scratch]
     (let [table-name (random-identifier "ws_resync")]
       (execute-sql! (format "CREATE TABLE public.%s (id int, main_only text)" table-name)
                     (format "INSERT INTO public.%s VALUES (1, 'main')" table-name))
       (try
         (sync/sync-database! (mt/id) {:scan :schema})
         (run-transform! (native-transform! "SELECT 1 AS id, 'x' AS scratch_only" table-name))
         (let [table-id (t2/select-one-pk :model/Table :db_id (mt/id) :schema "public" :name table-name)
               fields   #(t2/select-fn-set :name :model/Field :table_id table-id :active true)]
           (is (= #{"id" "scratch_only"} (fields)))
           (testing "turning workspace mode off re-syncs the main table, so MBQL on it reads main again"
             (ee.ws/clear-instance-workspace!)
             (is (= #{"id" "main_only"} (fields)))
             (let [mp (mt/metadata-provider)]
               (is (= [[1 "main"]] (rows (lib/query mp (lib.metadata/table mp table-id))))))))
         (finally
           (execute-sql! (format "DROP TABLE public.%s" table-name))))))))

(deftest uploads-are-refused-in-workspace-mode-test
  (mt/with-temp [:model/Table table {:db_id (mt/id), :schema "PUBLIC", :name "UPLOADED_CSV", :is_upload true}]
    (mt/with-temporary-setting-values [instance-workspace (workspace-json "PUBLIC" "SCRATCH")]
      (doseq [action [:metabase.upload/append :metabase.upload/replace]]
        (testing (str action)
          (is (=? {:status-code 400}
                  (ex-data (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Uploads are not available on a workspace instance"
                                                 (mt/with-current-user (mt/user->id :crowberto)
                                                   (upload/update-csv! {:table-id (:id table), :filename "x.csv"
                                                                        :file (java.io.File. "x.csv"), :action action}))))))))))))

(deftest model-persistence-api-is-refused-in-workspace-mode-test
  (mt/with-temporary-setting-values [instance-workspace (workspace-json "PUBLIC" "SCRATCH")]
    (is (= "Model persistence is not available on a workspace instance."
           (mt/user-http-request :crowberto :post 400 "persist/enable")))))

(deftest workspace-queries-run-in-a-read-only-transaction-test
  (do-with-postgres-workspace!
   (fn [_scratch]
     (testing "a query on a workspace database runs in a READ ONLY transaction the server enforces"
       (is (= [["on"]] (rows (mt/native-query {:query "SELECT current_setting('transaction_read_only')"})))))
     (testing "the server refuses a write on such a connection, whatever the SQL check let through"
       (is (thrown-with-msg? Exception #"read-only transaction"
                             (sql-jdbc.execute/do-with-connection-with-options
                              :postgres (lib.metadata/database (mt/metadata-provider)) {:read-only-transaction? true}
                              (fn [^java.sql.Connection conn]
                                (with-open [stmt (.createStatement conn)]
                                  (.execute stmt "CREATE TEMPORARY TABLE ws_never (a int)")))))))))
  (testing "outside workspace mode it does not"
    (mt/test-driver :postgres
      (mt/with-temporary-setting-values [instance-workspace nil]
        (is (= [["off"]] (rows (mt/native-query {:query "SELECT current_setting('transaction_read_only')"}))))))))

(defn- counts-of [table]
  (ffirst (query-sql (format "SELECT count(*) FROM %s" table))))

(deftest server-layer-holds-without-the-sql-check-test
  (do-with-postgres-workspace!
   (fn [scratch]
     (let [table (str scratch ".ws_victim")]
       (execute-sql! (format "CREATE TABLE %s (id int)" table) (format "INSERT INTO %s VALUES (1), (2)" table))
       ;; the SQL check (layer 1) is off: only the driver's single-statement parse and the READ ONLY transaction remain
       (mt/with-dynamic-fn-redefs [qp.workspace-remapping/rewrite-query identity]
         (testing "anything but one SELECT or WITH statement, as PgJDBC parses it, is refused before it runs"
           (doseq [sql [(format "SELECT 1; COMMIT; DELETE FROM %s" table)
                        (format "SELECT 1; END; DELETE FROM %s" table)
                        (format "SET TRANSACTION READ WRITE; DELETE FROM %s; COMMIT; SELECT 1" table)
                        (format "SELECT 1; COMMIT; BEGIN READ WRITE; DELETE FROM %s; COMMIT" table)
                        "COMMIT"
                        "SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE"
                        (format "DELETE FROM %s" table)]]
             (is (thrown-with-msg? Exception #"must be a single SELECT or WITH statement"
                                   (qp/process-query (mt/native-query {:query sql})))
                 sql))
           (is (= 2 (counts-of table))))
         (testing "a write inside the one statement fails on the server: the transaction is READ ONLY"
           (is (thrown-with-msg? Exception #"read-only transaction"
                                 (qp/process-query (mt/native-query {:query (format "WITH d AS (DELETE FROM %s RETURNING id) SELECT * FROM d" table)}))))
           (is (= 2 (counts-of table))))
         (testing "session state doesn't outlive the query: the connection is reset with DISCARD ALL"
           (mt/with-temporary-setting-values [jdbc-data-warehouse-max-connection-pool-size 1]
             ;; a session-level advisory lock survives the rollback, so only DISCARD ALL releases it
             (rows (mt/native-query {:query "SELECT pg_advisory_lock(424242)"}))
             (is (= [[0]] (rows (mt/native-query {:query (str "SELECT count(*)::int FROM pg_locks WHERE locktype = 'advisory'"
                                                              " AND pid = pg_backend_pid()")})))))))))))

(deftest nested-checkout-without-read-only-is-refused-test
  (mt/test-driver :postgres
    (let [database (lib.metadata/database (mt/metadata-provider))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"needs a read-only transaction"
                            (sql-jdbc.execute/do-with-connection-with-options
                             :postgres database {:write? true}
                             (fn [_]
                               (sql-jdbc.execute/do-with-connection-with-options
                                :postgres database {:read-only-transaction? true}
                                (fn [_] :ran)))))))))

(deftest row-actions-refused-on-covered-database-without-remappings-test
  (do-with-postgres-workspace!
   (fn [_scratch]
     ;; a table of the test's own, so a broken guard writes nothing shared
     (let [table-name (random-identifier "ws_rows")]
       (execute-sql! (format "CREATE TABLE public.%s (id int)" table-name))
       (try
         (sync/sync-database! (mt/id) {:scan :schema})
         (is (= [] (remappings)))
         (t2/update! :model/Database :id (mt/id) {:settings {:database-enable-actions true}})
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"tables are written only by transforms"
                               (mt/with-current-user (mt/user->id :crowberto)
                                 (actions/perform-action! :model.row/create
                                                          {:database   (mt/id), :type :query
                                                           :query      {:source-table (t2/select-one-pk :model/Table :db_id (mt/id)
                                                                                                        :name table-name)}
                                                           :create-row {"id" 1}}))))
         (is (= [[0]] (query-sql (format "SELECT count(*)::int FROM public.%s" table-name))))
         (finally
           (execute-sql! (format "DROP TABLE public.%s" table-name))))))))
