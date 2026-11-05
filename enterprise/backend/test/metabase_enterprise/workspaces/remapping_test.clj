(ns ^:mb/driver-tests metabase-enterprise.workspaces.remapping-test
  "Workspace mode end to end: a transform writes to its scratch namespace, queries and sync read the scratch table under
  the main name, and an instance outside workspace mode never looks for remappings."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.core :as ee.ws]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.model-persistence.core :as model-persistence]
   [metabase.model-persistence.task.persist-refresh :as persist-refresh]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.query-processor.middleware.workspace-remapping :as qp.workspace-remapping]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.writeback :as qp.writeback]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
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
             (is (= #{"id" "source" "scratch_only"} (field-set)))
             (testing "and indexes come from the scratch table, which has none, not main's primary key"
               (is (not (t2/select-one-fn :database_indexed :model/Field :table_id (:id table) :name "id")))))
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
  (binding [driver/*driver* :postgres]
    (let [carrying (lib.metadata/->metadata-provider
                    (qp.workspace-remapping/carry-remappings (mt/metadata-provider) remaps))]
      (testing "the native stage and the compiled SQL are rewritten, with the remappings setup carried"
        (is (=? {:stages      [{:native #"(?s).*mb__iso_public.*"}]
                 :qp/compiled {:query #"(?s).*mb__iso_public.*"}}
                (qp.workspace-remapping/rewrite-query
                 {:lib/metadata carrying
                  :stages       [{:lib/type :mbql.stage/native, :native "SELECT * FROM public.orders"}]
                  :qp/compiled  {:query "SELECT * FROM public.orders"}}))))
      (testing "a query setup found no remappings for is left alone"
        (let [query {:lib/metadata (mt/metadata-provider), :qp/compiled {:query "SELECT * FROM public.orders"}}]
          (is (= query (qp.workspace-remapping/rewrite-query query)))))
      (testing "a query with remappings bypasses the result cache"
        (let [seen (atom nil)
              qp   (qp.workspace-remapping/bypass-cache-when-remapped (fn [query _rff] (reset! seen query)))]
          (qp {:lib/metadata carrying, :cache-strategy {:type :ttl}} nil)
          (is (not (contains? @seen :cache-strategy)))
          (qp {:lib/metadata (mt/metadata-provider), :cache-strategy {:type :ttl}} nil)
          (is (contains? @seen :cache-strategy)))))))

(deftest rewrite-sql-strictness-test
  (testing "statements SQLGlot keeps as unstructured commands are refused"
    (doseq [sql ["EXPLAIN SELECT * FROM public.orders"
                 "DECLARE c CURSOR FOR SELECT * FROM public.orders"
                 "PREPARE p AS SELECT * FROM public.orders; EXECUTE p"
                 "DO $$ BEGIN PERFORM * FROM public.orders; END $$"]]
      (is (thrown? clojure.lang.ExceptionInfo (ws/rewrite-sql :postgres remaps sql)) sql)))
  (testing "unquoted names fold to lower case, as on Postgres"
    (let [mixed {{:schema "public", :table "Mixed"} {:schema "mb__iso_public", :table "Mixed"}}]
      (is (str/includes? (ws/rewrite-sql :postgres mixed "SELECT * FROM public.\"Mixed\"") "mb__iso_public"))
      (is (= "SELECT * FROM public.mixed" (ws/rewrite-sql :postgres mixed "SELECT * FROM public.mixed")))
      (is (= "SELECT * FROM public.Mixed" (ws/rewrite-sql :postgres mixed "SELECT * FROM public.Mixed"))))
    (is (str/includes? (ws/rewrite-sql :postgres remaps "SELECT * FROM PUBLIC.ORDERS") "mb__iso_public"))
    (is (= "SELECT * FROM \"PUBLIC\".\"ORDERS\"" (ws/rewrite-sql :postgres remaps "SELECT * FROM \"PUBLIC\".\"ORDERS\"")))))

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
        (testing "a POST whose setting write fails keeps the remappings it would have deleted"
          (mt/with-dynamic-fn-redefs [ws.settings/instance-workspace! (fn [_] (throw (ex-info "injected" {})))]
            (is (thrown? Exception (ee.ws/set-instance-workspace!
                                    {:name "w", :databases {db-name {:schemas {"public" "scratch_b"}}}}))))
          (is (= 1 (t2/count :model/TableRemapping :database_id db-id))))
        (testing "a DELETE that fails after clearing the setting leaves the workspace installed, in the cache too"
          (mt/with-dynamic-fn-redefs [ws.db/delete-all-table-remappings! (fn [] (throw (ex-info "injected" {})))]
            (is (thrown? Exception (ee.ws/clear-instance-workspace!))))
          (is (true? (ws/workspace-mode?)))
          (is (= "scratch_a" (get-in (ee.ws/instance-workspace) [:databases db-name :schemas "public"]))))))))

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

(deftest workspace-mode-edge-cases-test
  (mt/with-temporary-setting-values [instance-workspace (workspace-json "PUBLIC" "SCRATCH")]
    (mt/with-dynamic-fn-redefs [ws.db/table-remappings-of-database (fn [_] (throw (ex-info "remappings were read" {})))]
      (testing "QP setup does not look up remappings for an internal query, which has no warehouse database"
        (is (= :ran (qp.setup/with-qp-setup [_query {:type :internal, :fn "x", :database 13371337}] :ran)))))
    (testing "forgetting the output of a target without a schema does nothing (no remapping can name it)"
      (is (nil? (ws/forget-transform-output! (mt/id) {:type "table", :schema nil, :name "T"}))))))
