(ns metabase-enterprise.workspaces.transform-hooks-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase-enterprise.workspaces.transform-hooks :as ws.transform-hooks]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.util :as transforms.u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [f] (mt/with-premium-features #{:workspaces} (f))))

(deftest workspace-transform-target-no-workspace-passthrough-test
  (testing "without a provisioned WorkspaceDatabase, target passes through unchanged"
    (mt/with-dynamic-fn-redefs [ws/db-workspace-namespace  (constantly nil)
                                ws.table-remapping/transform-target-remapping
                                (fn [& _] (throw (ex-info "transform-target-remapping must not be called when no workspace is active" {})))]
      (let [target {:schema "public" :name "orders" :type :table}]
        (is (= target (ws.transform-hooks/workspace-transform-target 42 target)))))))

(deftest workspace-transform-target-rewrites-schema-test
  (testing "with a provisioned WorkspaceDatabase, target's :schema and :name come from the computed to-spec, and nothing is recorded"
    (mt/with-dynamic-fn-redefs [ws/db-workspace-namespace  (constantly {:schema "ws_alice"})
                                ws.table-remapping/transform-target-remapping
                                (constantly {:db nil :schema "ws_alice" :name "public__orders"})
                                ws.table-remapping/add-transform-target-mapping!
                                (fn [& _] (throw (ex-info "rewriting the target must not record a remapping" {})))]
      (let [result (ws.transform-hooks/workspace-transform-target 42 {:schema "public" :name "orders" :type :table})]
        (is (= {:db nil :schema "ws_alice" :name "public__orders" :type :table} result)
            "schema and collision-resistant name come from the to-spec; other target keys are preserved")))))

(defn- with-instance-workspace-for-db!
  "Set the `instance-workspace` setting so that `db-workspace-namespace` returns
   `{:schema output-schema}` for the test database, run `body-fn`, clear it on
   the way out."
  [output-schema body-fn]
  (try
    (ws/set-instance-workspace! {:name "test-ws"
                                 :databases {(mt/id) {:input_schemas ["_"]
                                                      :output        {:schema output-schema}}}})
    (body-fn)
    (finally
      (ws/clear-instance-workspace!))))

(deftest workspace-target-end-to-end-test
  (testing "end-to-end against the test app DB"
    (with-instance-workspace-for-db! "ws_test_schema"
      (fn []
        (try
          (ws.table-remapping/clear-mappings-for-db! (mt/id))
          (let [target {:schema "PUBLIC" :name "ORDERS" :type :table}]
            (testing "the rewrite gives the workspace schema and the collision-resistant name, and records nothing"
              (is (= {:db nil :schema "ws_test_schema" :name "PUBLIC__ORDERS" :type :table}
                     (ws.transform-hooks/workspace-transform-target (mt/id) target)))
              (is (zero? (t2/count :model/TableRemapping :database_id (mt/id)))))
            (testing "recording inserts the row the rewrite pointed at, with the canonical (schema, name) on the from-side"
              (ws.transform-hooks/record-workspace-target-remapping! (mt/id) target)
              (let [row (t2/select-one :model/TableRemapping
                                       :database_id     (mt/id)
                                       :from_schema     "PUBLIC"
                                       :from_table_name "ORDERS")]
                (is (= "ws_test_schema" (:to_schema row)))
                (is (= "PUBLIC__ORDERS" (:to_table_name row))
                    "executor target and row agree byte-for-byte"))))
          (finally
            (ws.table-remapping/clear-mappings-for-db! (mt/id))))))))

(defn- with-stubbed-execute-multimethod!
  "Replace `transforms.i/execute!` with a stub that captures the transform map it receives.
  Returns the captured value via the supplied atom. The hook still fires before dispatch
  (wired in `transforms.execute/execute!`), so the captured target reflects the post-rewrite
  state — the question this helper answers is 'what does the per-type method actually see?'."
  [captured-atom body-fn]
  (with-redefs [transforms.i/execute! (fn [transform _opts]
                                        (reset! captured-atom transform)
                                        {:status :succeeded})]
    (body-fn)))

(deftest colliding-copy-name-is-refused-before-the-write-test
  (testing "two targets whose schema__table names collide: the second is refused with a 409, the first keeps working"
    (with-instance-workspace-for-db! "ws_test_schema"
      (fn []
        (try
          (ws.table-remapping/clear-mappings-for-db! (mt/id))
          (let [first-target  {:schema "A__B" :name "C" :type :table}
                second-target {:schema "A" :name "B__C" :type :table}]
            (ws.transform-hooks/record-workspace-target-remapping! (mt/id) first-target)
            (is (= "A__B__C" (:name (ws.transform-hooks/workspace-transform-target (mt/id) first-target)))
                "the target that owns the copy still resolves to it")
            (is (= 409 (:status-code (try (ws.transform-hooks/workspace-transform-target (mt/id) second-target)
                                          nil
                                          (catch clojure.lang.ExceptionInfo e (ex-data e)))))
                "resolving the second target's copy is refused")
            (let [captured (atom nil)]
              (with-stubbed-execute-multimethod!
                captured
                (fn []
                  (is (= 409 (:status-code (try (transforms.execute/execute!
                                                 {:id     998
                                                  :source {:type :python :body "" :source-tables []}
                                                  :target {:database (mt/id) :schema "A" :name "B__C" :type "table"}})
                                                nil
                                                (catch clojure.lang.ExceptionInfo e (ex-data e)))))
                      "a run of the second target fails with the 409")))
              (is (nil? @captured)
                  "the run is refused before the executor writes"))
            (is (= 1 (t2/count :model/TableRemapping :database_id (mt/id)))
                "nothing was recorded for the second target"))
          (finally
            (ws.table-remapping/clear-mappings-for-db! (mt/id))))))))

(deftest python-transforms-inherit-target-rewrite-test
  (testing "Python transforms see the rewritten target via the wrapper-level gate"
    (with-instance-workspace-for-db! "ws_test_schema"
      (fn []
        (try
          (ws.table-remapping/clear-mappings-for-db! (mt/id))
          (let [captured        (atom nil)
                python-transform {:id     999
                                  :source {:type :python :body "" :source-tables []}
                                  :target {:database (mt/id)
                                           :schema   "PUBLIC"
                                           :name     "FOO"
                                           :type     "table"}}]
            (with-stubbed-execute-multimethod!
              captured
              (fn []
                (transforms.execute/execute! python-transform)))
            (is (= "ws_test_schema" (get-in @captured [:target :schema]))
                "Python transform's :target.schema is rewritten before dispatch")
            (is (= "PUBLIC__FOO" (get-in @captured [:target :name]))
                ":name is rewritten to the collision-resistant warehouse identifier")
            (is (= {:database (mt/id) :schema "PUBLIC" :name "FOO" :type "table"}
                   (:workspace-canonical-target @captured))
                "the canonical target travels with the transform so the executor can record its remapping")
            (is (zero? (t2/count :model/TableRemapping :database_id (mt/id)))
                "the rewrite itself records nothing; the executor records after the run succeeds"))
          (finally
            (ws.table-remapping/clear-mappings-for-db! (mt/id))))))))

(defn- execute-failing-mid-run!
  "Run a Python-typed transform at `target-name` whose per-type executor throws after the target
  rewrite. Returns the number of remapping rows for the test database while it ran."
  [target-name]
  (let [rows-mid-run (atom nil)]
    (with-redefs [transforms.i/execute! (fn [_transform _opts]
                                          (reset! rows-mid-run (t2/count :model/TableRemapping :database_id (mt/id)))
                                          (throw (ex-info "Transform failed mid-run" {})))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Transform failed mid-run"
                            (transforms.execute/execute!
                             {:id     997
                              :source {:type :python :body "" :source-tables []}
                              :target {:database (mt/id) :schema "PUBLIC" :name target-name :type "table"}}))))
    @rows-mid-run))

(deftest failed-run-records-no-remapping-test
  (testing "a run that fails after the target rewrite leaves no remapping row for its target"
    (with-instance-workspace-for-db! "ws_test_schema"
      (fn []
        (try
          (ws.table-remapping/clear-mappings-for-db! (mt/id))
          (is (zero? (execute-failing-mid-run! "FAILS"))
              "nothing is recorded before the run succeeds")
          (is (empty? (t2/select :model/TableRemapping :database_id (mt/id)))
              "the failed run left no remapping row")
          (finally
            (ws.table-remapping/clear-mappings-for-db! (mt/id))))))))

(deftest failed-run-keeps-earlier-remapping-test
  (testing "a failed run leaves a remapping recorded by an earlier successful run exactly as it was"
    (with-instance-workspace-for-db! "ws_test_schema"
      (fn []
        (try
          (ws.table-remapping/clear-mappings-for-db! (mt/id))
          (ws.table-remapping/add-transform-target-mapping! (mt/id) {:schema "PUBLIC" :name "SUCCEEDED"})
          (let [before (t2/select :model/TableRemapping :database_id (mt/id))]
            (is (= 1 (count before)))
            (execute-failing-mid-run! "SUCCEEDED")
            (is (= before (t2/select :model/TableRemapping :database_id (mt/id)))
                "the earlier row survives the failed run unchanged, id included"))
          (finally
            (ws.table-remapping/clear-mappings-for-db! (mt/id))))))))

(defn- with-pg-workspace-transform!
  "Postgres: with a workspace whose output schema is `iso-schema`, call `body-fn` with a native
  `SELECT 1 AS x` transform targeting `public.<table-name>`. Cleans up the remappings, the
  transform and the workspace schema.

  The transform is committed rather than made with `mt/with-temp`: a top-level `with-temp` runs
  `body-fn` in one rollback-only app-DB transaction that `future`s inherit, so concurrent runs would
  share it, and on Postgres the refused run's unique-key violation aborts it for the other run too."
  [iso-schema table-name body-fn]
  (let [spec (sql-jdbc.conn/db->pooled-connection-spec (lib.metadata/database (mt/metadata-provider)))]
    (with-instance-workspace-for-db! iso-schema
      (fn []
        (let [transform (atom nil)]
          (try
            (ws.table-remapping/clear-mappings-for-db! (mt/id))
            (reset! transform (t2/insert-returning-instance!
                               :model/Transform
                               {:name   (str "ws-remap-" table-name)
                                :source {:type :query :query (lib/native-query (mt/metadata-provider) "SELECT 1 AS x")}
                                :target {:type :table :schema "public" :name table-name}}))
            (body-fn @transform)
            (finally
              (when-let [{transform-id :id} @transform]
                (t2/delete! :model/TransformRun :transform_id transform-id)
                (t2/delete! :model/Transform :id transform-id))
              (ws.table-remapping/clear-mappings-for-db! (mt/id))
              (jdbc/execute! spec [(format "DROP SCHEMA IF EXISTS %s CASCADE" iso-schema)]))))))))

(deftest post-success-failure-keeps-remapping-test
  (testing "a run marked succeeded whose post-run processing throws keeps its remapping"
    (mt/test-driver :postgres
      (mt/with-premium-features #{:workspaces :transforms-basic :hosting}
        (with-pg-workspace-transform! "ws_post_success_iso" "ws_post_success"
          (fn [transform]
            (let [real-complete (mt/original-fn #'transforms-base.u/complete-execution!)]
              (mt/with-dynamic-fn-redefs [transforms-base.u/complete-execution! (fn [& args]
                                                                                  (apply real-complete args)
                                                                                  (throw (ex-info "post-run step failed" {})))]
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"post-run step failed"
                                      (transforms.execute/execute! transform {:run-method :manual})))))
            (is (= :succeeded (t2/select-one-fn :status :model/TransformRun :transform_id (:id transform))))
            (is (= [{:from_schema "public" :from_table_name "ws_post_success"}]
                   (t2/select [:model/TableRemapping :from_schema :from_table_name] :database_id (mt/id))))))))))

(deftest record-failure-fails-the-run-test
  (testing "a run whose remapping can't be recorded is marked failed, not succeeded without a remapping"
    (mt/test-driver :postgres
      (mt/with-premium-features #{:workspaces :transforms-basic :hosting}
        (with-pg-workspace-transform! "ws_record_fail_iso" "ws_record_fail"
          (fn [transform]
            (mt/with-dynamic-fn-redefs [transforms-base.u/record-workspace-target-remapping!
                                        (fn [_] (throw (ex-info "record failed" {})))]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"record failed"
                                    (transforms.execute/execute! transform {:run-method :manual}))))
            (is (= :failed (t2/select-one-fn :status :model/TransformRun :transform_id (:id transform))))
            (is (empty? (t2/select :model/TableRemapping :database_id (mt/id))))))))))

(deftest delete-after-failed-first-run-drops-the-workspace-copy-test
  (testing "deleting the output table (the function behind DELETE /api/transform/:id/table) of a transform whose only run failed drops its workspace copy, not the canonical table"
    (mt/test-driver :postgres
      (mt/with-premium-features #{:workspaces :transforms-basic :hosting}
        (let [spec    (sql-jdbc.conn/db->pooled-connection-spec (lib.metadata/database (mt/metadata-provider)))
              exists? (fn [schema table-name]
                        (= 1 (:count (first (jdbc/query spec ["SELECT count(*) AS count FROM information_schema.tables
                                                               WHERE table_schema = ? AND table_name = ?"
                                                              schema table-name])))))]
          (try
            (jdbc/execute! spec ["CREATE TABLE public.ws_drop_failed (id INT)"])
            (t2/insert! :model/Table {:db_id (mt/id) :schema "public" :name "ws_drop_failed" :active true})
            (with-pg-workspace-transform! "ws_drop_failed_iso" "ws_drop_failed"
              (fn [transform]
                ;; The run writes its copy, then fails before recording the remapping.
                (mt/with-dynamic-fn-redefs [transforms-base.u/record-workspace-target-remapping!
                                            (fn [_] (throw (ex-info "record failed" {})))]
                  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"record failed"
                                        (transforms.execute/execute! transform {:run-method :manual}))))
                (is (empty? (t2/select :model/TableRemapping :database_id (mt/id))))
                (is (exists? "ws_drop_failed_iso" "public__ws_drop_failed")
                    "the failed run left its workspace copy behind")
                (transforms-base.u/delete-target-table! transform)
                (is (not (exists? "ws_drop_failed_iso" "public__ws_drop_failed"))
                    "the workspace copy is dropped")
                (is (exists? "public" "ws_drop_failed")
                    "the canonical table is untouched")
                (is (true? (t2/select-one-fn :active :model/Table :db_id (mt/id) :schema "public" :name "ws_drop_failed"))
                    "the canonical Table row stays active: no remapping makes it stand in for the dropped copy")))
            (finally
              (t2/delete! :model/Table :db_id (mt/id) :schema "public" :name "ws_drop_failed")
              (jdbc/execute! spec ["DROP TABLE IF EXISTS public.ws_drop_failed"]))))))))

(deftest append-retry-after-record-failure-writes-each-row-once-test
  (testing "an incremental append run whose remapping can't be recorded fails, and its retry leaves each source row in the workspace copy once"
    (mt/test-driver :postgres
      (mt/with-premium-features #{:workspaces :transforms-basic :hosting}
        (let [spec       (sql-jdbc.conn/db->pooled-connection-spec (lib.metadata/database (mt/metadata-provider)))
              iso-schema "ws_append_iso"
              copy-ids   #(map :id (jdbc/query spec [(format "SELECT id FROM %s.public__ws_append" iso-schema)]))
              transform  (atom nil)
              run-append! #(transforms.execute/execute! (t2/select-one :model/Transform :id (:id @transform))
                                                        {:run-method :manual})]
          (try
            (jdbc/execute! spec ["CREATE TABLE public.ws_append_src (id INT, ts INT)"])
            (jdbc/execute! spec ["INSERT INTO public.ws_append_src SELECT g, g FROM generate_series(1, 5) g"])
            (sync/sync-database! (mt/id) {:scan :schema})
            (with-instance-workspace-for-db! iso-schema
              (fn []
                (ws.table-remapping/clear-mappings-for-db! (mt/id))
                (let [mp       (mt/metadata-provider)
                      table-id (t2/select-one-pk :model/Table :db_id (mt/id) :schema "public" :name "ws_append_src")
                      field-id (t2/select-one-pk :model/Field :table_id table-id :name "ts")]
                  (reset! transform (t2/insert-returning-instance!
                                     :model/Transform
                                     {:name       "ws-append"
                                      :creator_id (mt/user->id :crowberto)
                                      :source     {:type                        :query
                                                   :query                       (lib/query mp (lib.metadata/table mp table-id))
                                                   :source-incremental-strategy {:type                       "checkpoint"
                                                                                 :checkpoint-filter-field-id field-id}}
                                      :target     {:type                        "table-incremental"
                                                   :schema                      "public"
                                                   :name                        "ws_append"
                                                   :target-incremental-strategy {:type "append"}}})))
                (run-append!)
                (is (= 5 (count (copy-ids))))
                (jdbc/execute! spec ["INSERT INTO public.ws_append_src SELECT g, g FROM generate_series(6, 8) g"])
                (mt/with-dynamic-fn-redefs [transforms-base.u/record-workspace-target-remapping!
                                            (fn [_] (throw (ex-info "record failed" {})))]
                  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"record failed" (run-append!))))
                (is (= [:succeeded :failed]
                       (t2/select-fn-vec :status :model/TransformRun :transform_id (:id @transform) {:order-by [[:id :asc]]})))
                (run-append!)
                (is (= (range 1 9) (sort (copy-ids)))
                    "each source row is in the copy once")))
            (finally
              (when-let [{transform-id :id} @transform]
                (t2/delete! :model/TransformRun :transform_id transform-id)
                (t2/delete! :model/Transform :id transform-id))
              (ws.table-remapping/clear-mappings-for-db! (mt/id))
              (t2/delete! :model/Table :db_id (mt/id) :schema "public" :name "ws_append_src")
              (jdbc/execute! spec [(format "DROP SCHEMA IF EXISTS %s CASCADE" iso-schema)])
              (jdbc/execute! spec ["DROP TABLE IF EXISTS public.ws_append_src"]))))))))

(deftest refused-overlapping-run-keeps-remapping-test
  (testing "a run refused because the transform is already running leaves the running run's remapping in place"
    (mt/test-driver :postgres
      (mt/with-premium-features #{:workspaces :transforms-basic :hosting}
        (with-pg-workspace-transform! "ws_overlap_iso" "ws_overlap"
          (fn [transform]
            ;; Order the two runs so the refused one resolves its target first, then is held
            ;; before it asks for the run lock until the other run holds it.
            (let [refused-resolved (promise)
                  running-started  (promise)
                  refused-done     (promise)
                  refused-thread   (atom nil)
                  real-check       transforms.u/check-source-query-permissions!
                  real-base        transforms-base.i/execute-base!]
              (with-redefs [transforms.u/check-source-query-permissions!
                            (fn [& args]
                              (when (= (Thread/currentThread) @refused-thread)
                                (deliver refused-resolved true)
                                (deref running-started 60000 ::timeout))
                              (apply real-check args))
                            transforms-base.i/execute-base!
                            (fn [& args]
                              (deliver running-started true)
                              (deref refused-done 60000 ::timeout)
                              (apply real-base args))]
                (let [refused (future
                                (reset! refused-thread (Thread/currentThread))
                                (try (transforms.execute/execute! transform {:run-method :manual})
                                     :ran
                                     (catch Throwable t (:error (ex-data t)))
                                     (finally (deliver refused-done true))))
                      _       (is (not= ::timeout (deref refused-resolved 60000 ::timeout)))
                      running (future (transforms.execute/execute! transform {:run-method :manual}))]
                  (is (= :already-running (deref refused 60000 ::timeout)))
                  (is (nil? (deref running 60000 ::timeout)))))
              (is (= [{:from_schema "public" :from_table_name "ws_overlap"}]
                     (t2/select [:model/TableRemapping :from_schema :from_table_name] :database_id (mt/id)))
                  "the run that succeeded keeps its remapping"))))))))

(deftest no-workspace-target-handling-makes-no-app-db-calls-test
  (testing "off-workspace, rewriting and recording the target cost no app-DB calls"
    (ws/clear-instance-workspace!)
    (let [target {:database (mt/id) :schema "PUBLIC" :name "X" :type "table"}]
      (ws/instance-workspace)
      (t2/with-call-count [call-count]
        (is (= target (ws.transform-hooks/workspace-transform-target (mt/id) target)))
        (transforms-base.u/record-workspace-target-remapping!
         {:id 995 :source {:type :python :body "" :source-tables []} :target target})
        (is (zero? (call-count)))))))

(deftest non-workspaced-db-target-passthrough-via-execute-test
  (testing "When no WorkspaceDatabase is provisioned, the wrapper passes target through unchanged"
    (let [captured        (atom nil)
          python-transform {:id     998
                            :source {:type :python :body "" :source-tables []}
                            :target {:database (mt/id)
                                     :schema   "PUBLIC"
                                     :name     "BAR"
                                     :type     "table"}}]
      (with-stubbed-execute-multimethod!
        captured
        (fn []
          (transforms.execute/execute! python-transform)))
      (is (= "PUBLIC" (get-in @captured [:target :schema]))
          ":schema is unchanged when DB is not workspaced")
      (is (not (contains? @captured :workspace-canonical-target))
          "no canonical target travels with the transform, so the record step has nothing to do")
      (is (nil? (t2/select-one :model/TableRemapping
                               :database_id     (mt/id)
                               :from_schema     "PUBLIC"
                               :from_table_name "BAR"))
          "no TableRemapping row recorded for a non-workspaced DB"))))

(deftest transform-api-checks-the-workspace-target-for-existence-test
  (testing "in a workspace, POST/PUT /api/transform check the remapped target, not the canonical one"
    (mt/test-driver :postgres
      (mt/with-premium-features #{:workspaces :advanced-permissions :transforms-basic :hosting}
        (let [iso-schema "ws_target_check_iso"
              spec       (sql-jdbc.conn/db->pooled-connection-spec (lib.metadata/database (mt/metadata-provider)))
              query      (lib/native-query (mt/metadata-provider) "SELECT 1 AS x")
              create!    (fn [status table-name]
                           (mt/user-http-request :crowberto :post status "transform"
                                                 {:name   (str "ws-target-check " table-name)
                                                  :source {:type "query" :query query}
                                                  :target {:type "table" :schema "public" :name table-name}}))]
          (with-instance-workspace-for-db! iso-schema
            (fn []
              (try
                (testing "create targeting an existing canonical table succeeds"
                  (create! 200 "orders")
                  (testing "and the check records no TableRemapping"
                    (is (zero? (t2/count :model/TableRemapping :database_id (mt/id))))))
                (testing "update retargeting to an existing canonical table succeeds"
                  (let [{id :id} (create! 200 "ws_target_check_new")]
                    (mt/user-http-request :crowberto :put 200 (str "transform/" id)
                                          {:target {:type "table" :schema "public" :name "products"}})))
                (testing "the workspace's own copy of the target existing is still a 409"
                  (jdbc/execute! spec [(format "CREATE SCHEMA %s; CREATE TABLE %s.public__venues (id INT)"
                                               iso-schema iso-schema)])
                  (create! 409 "venues"))
                (finally
                  (t2/delete! :model/Transform :name [:like "ws-target-check %"])
                  (jdbc/execute! spec [(format "DROP SCHEMA IF EXISTS %s CASCADE" iso-schema)]))))))))))

(deftest run-records-its-remapping-after-its-write-test
  (testing "a run records nothing before its write, and records its remapping once the write returns"
    (with-instance-workspace-for-db! "ws_test_schema"
      (fn []
        (let [rows-at-write (atom ::not-written)
              transform     (atom nil)]
          (try
            (ws.table-remapping/clear-mappings-for-db! (mt/id))
            (reset! transform (t2/insert-returning-instance!
                               :model/Transform
                               {:name   "ws-record-after-write"
                                :source {:type :query :query (lib/native-query (mt/metadata-provider) "SELECT 1 AS X")}
                                :target {:type :table :schema "PUBLIC" :name "RECORDED"}}))
            (mt/with-premium-features #{:workspaces :transforms-basic}
              (with-redefs [driver/schema-exists?             (constantly true)
                            transforms-base.i/execute-base!   (fn [& _]
                                                                (reset! rows-at-write (t2/count :model/TableRemapping :database_id (mt/id)))
                                                                {:status :succeeded})
                            transforms-base.u/complete-execution! (constantly nil)]
                (transforms.execute/execute! @transform {:run-method :manual})))
            (is (zero? @rows-at-write)
                "nothing is recorded before the write")
            (is (= [{:from_schema "PUBLIC" :from_table_name "RECORDED" :to_schema "ws_test_schema" :to_table_name "PUBLIC__RECORDED"}]
                   (t2/select [:model/TableRemapping :from_schema :from_table_name :to_schema :to_table_name] :database_id (mt/id)))
                "the remapping is recorded after the write")
            (is (= :succeeded (t2/select-one-fn :status :model/TransformRun :transform_id (:id @transform))))
            (finally
              (when-let [{transform-id :id} @transform]
                (t2/delete! :model/TransformRun :transform_id transform-id)
                (t2/delete! :model/Transform :id transform-id))
              (ws.table-remapping/clear-mappings-for-db! (mt/id)))))))))

(deftest full-create-index-failure-keeps-its-remapping-test
  (testing "a full-create run whose index step throws fails, and keeps the remapping to the copy it wrote"
    (with-instance-workspace-for-db! "ws_test_schema"
      (fn []
        (let [transform (atom nil)]
          (try
            (ws.table-remapping/clear-mappings-for-db! (mt/id))
            (reset! transform (t2/insert-returning-instance!
                               :model/Transform
                               {:name   "ws-index-fails"
                                :source {:type :query :query (lib/native-query (mt/metadata-provider) "SELECT 1 AS X")}
                                :target {:type :table :schema "PUBLIC" :name "INDEX_FAILS"}}))
            (mt/with-premium-features #{:workspaces :transforms-basic}
              (with-redefs [driver/schema-exists?                   (constantly true)
                            transforms-base.i/execute-base!         (constantly {:status :succeeded})
                            transforms-base.u/apply-target-indexes! (fn [_] (throw (ex-info "index failed" {})))
                            transforms-base.u/complete-execution!   (constantly nil)]
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"index failed"
                                      (transforms.execute/execute! @transform {:run-method :manual})))))
            (is (= :failed (t2/select-one-fn :status :model/TransformRun :transform_id (:id @transform))))
            (is (= [{:from_schema "PUBLIC" :from_table_name "INDEX_FAILS" :to_schema "ws_test_schema" :to_table_name "PUBLIC__INDEX_FAILS"}]
                   (t2/select [:model/TableRemapping :from_schema :from_table_name :to_schema :to_table_name] :database_id (mt/id)))
                "the copy was written, so its remapping stays")
            (finally
              (when-let [{transform-id :id} @transform]
                (t2/delete! :model/TransformRun :transform_id transform-id)
                (t2/delete! :model/Transform :id transform-id))
              (ws.table-remapping/clear-mappings-for-db! (mt/id)))))))))

(defn- pg-table-exists?
  [spec schema table-name]
  (= 1 (:count (first (jdbc/query spec ["SELECT count(*) AS count FROM information_schema.tables
                                         WHERE table_schema = ? AND table_name = ?"
                                        schema table-name])))))

(deftest create-is-refused-when-only-the-workspace-copy-exists-test
  (testing "in a workspace, POST /api/transform returns 409 when the workspace copy of the target exists and the canonical table does not"
    (mt/test-driver :postgres
      (mt/with-premium-features #{:workspaces :advanced-permissions :transforms-basic :hosting}
        (let [iso-schema "ws_copy_only_iso"
              spec       (sql-jdbc.conn/db->pooled-connection-spec (lib.metadata/database (mt/metadata-provider)))]
          (with-instance-workspace-for-db! iso-schema
            (fn []
              (try
                (jdbc/execute! spec [(format "CREATE SCHEMA %s; CREATE TABLE %s.public__ws_copy_only (id INT)"
                                             iso-schema iso-schema)])
                (is (not (pg-table-exists? spec "public" "ws_copy_only")))
                (is (pg-table-exists? spec iso-schema "public__ws_copy_only"))
                (mt/user-http-request :crowberto :post 409 "transform"
                                      {:name   "ws-copy-only"
                                       :source {:type "query" :query (lib/native-query (mt/metadata-provider) "SELECT 1 AS x")}
                                       :target {:type "table" :schema "public" :name "ws_copy_only"}})
                (finally
                  (t2/delete! :model/Transform :name "ws-copy-only")
                  (jdbc/execute! spec [(format "DROP SCHEMA IF EXISTS %s CASCADE" iso-schema)]))))))))))
