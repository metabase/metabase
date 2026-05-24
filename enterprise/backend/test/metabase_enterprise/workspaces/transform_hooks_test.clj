(ns metabase-enterprise.workspaces.transform-hooks-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase-enterprise.workspaces.transform-hooks :as ws.transform-hooks]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.interface :as transforms.i]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f] (mt/with-premium-features #{:workspaces} (f))))

(deftest resolve-transform-target-no-workspace-passthrough-test
  (testing "without a provisioned WorkspaceDatabase, target passes through unchanged"
    (with-redefs [ws/db-workspace-namespace  (constantly nil)
                  ws.table-remapping/add-transform-target-mapping!
                  (fn [& _] (throw (ex-info "add-transform-target-mapping! must not be called when no workspace is active" {})))]
      (let [target {:schema "public" :name "orders" :type :table}]
        (is (= target (ws.transform-hooks/resolve-transform-target 42 target)))))))

(deftest resolve-transform-target-rewrites-schema-test
  (testing "with a provisioned WorkspaceDatabase, target's :schema and :name come from the recorded to-spec"
    (let [recorded (atom nil)]
      (with-redefs [ws/db-workspace-namespace  (constantly {:schema "ws_alice"})
                    ws.table-remapping/add-transform-target-mapping!
                    (fn [db-id target]
                      (reset! recorded {:db-id db-id :target target})
                      ;; Mimic real return: collision-resistant to-spec.
                      {:db nil :schema "ws_alice" :name "public__orders"})]
        (let [target {:schema "public" :name "orders" :type :table}
              result (ws.transform-hooks/resolve-transform-target 42 target)]
          (is (= "ws_alice" (:schema result))
              "schema comes from the recorded to-spec (workspace output schema)")
          (is (= "public__orders" (:name result))
              "name comes from the recorded to-spec (collision-resistant rename)")
          (is (= :table (:type result))
              "other target keys are preserved"))))))

(deftest resolve-transform-target-records-remapping-test
  (testing "with a workspace active, the canonical->workspace remapping is recorded"
    (let [recorded (atom nil)]
      (with-redefs [ws/db-workspace-namespace  (constantly {:schema "ws_alice"})
                    ws.table-remapping/add-transform-target-mapping!
                    (fn [db-id target]
                      (reset! recorded {:db-id db-id :target target})
                      {:db nil :schema "ws_alice" :name "public__orders"})]
        (ws.transform-hooks/resolve-transform-target 42 {:schema "public" :name "orders" :type :table})
        (is (= {:db-id  42
                :target {:schema "public" :name "orders" :type :table}}
               @recorded)
            "add-transform-target-mapping! receives the db-id and the canonical target map verbatim")))))

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

(deftest resolve-transform-target-end-to-end-test
  (testing "end-to-end against the test app DB: a remapping row appears after the hook fires"
    (with-instance-workspace-for-db! "ws_test_schema"
      (fn []
        (try
          (ws.table-remapping/clear-mappings-for-db! (mt/id))
          (let [target {:schema "PUBLIC" :name "ORDERS" :type :table}
                result (ws.transform-hooks/resolve-transform-target (mt/id) target)]
            (is (= {:db nil :schema "ws_test_schema" :name "PUBLIC__ORDERS" :type :table}
                   result)
                "the executor target gets the workspace schema and the collision-resistant name")
            (testing "TableRemapping row was inserted with the canonical (schema, name) on the from-side"
              (let [row (t2/select-one :model/TableRemapping
                                       :database_id     (mt/id)
                                       :from_schema     "PUBLIC"
                                       :from_table_name "ORDERS")]
                (is (some? row))
                (is (= "ws_test_schema" (:to_schema row)))
                (is (= "PUBLIC__ORDERS" (:to_table_name row))
                    "to-side is rewritten via remapped-table-name; executor and row agree byte-for-byte"))))
          (finally
            (ws.table-remapping/clear-mappings-for-db! (mt/id))))))))

(defn- with-stubbed-execute-multimethod!
  "Replace `transforms.i/execute!` with a stub that captures the transform map it receives.
  Returns the captured value via the supplied atom. The hook still fires before dispatch
  (wired in `transforms.execute/execute!`), so the captured target reflects the post-rewrite
  state — the question this helper answers is 'what does the per-type method actually see?'."
  [captured-atom body-fn]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (with-redefs [transforms.i/execute! (fn [transform _opts]
                                        (reset! captured-atom transform)
                                        {:status :succeeded})]
    (body-fn)))

(deftest python-transforms-inherit-target-rewrite-test
  (testing "Python transforms see the rewritten target via the wrapper-level gate"
    (with-instance-workspace-for-db! "ws_test_schema"
      (fn []
        (try
          (ws.table-remapping/clear-mappings-for-db! (mt/id))
          (let [captured        (atom nil)
                python-transform {:id     999
                                  :source {:type :python}
                                  :target {:database (mt/id)
                                           :schema   "PUBLIC"
                                           :name     "FOO"
                                           :type     :table}}]
            (with-stubbed-execute-multimethod!
              captured
              (fn []
                (transforms.execute/execute! python-transform)))
            (is (= "ws_test_schema" (get-in @captured [:target :schema]))
                "Python transform's :target.schema is rewritten before dispatch")
            (is (= "PUBLIC__FOO" (get-in @captured [:target :name]))
                ":name is rewritten to the collision-resistant warehouse identifier")
            (testing "TableRemapping row was recorded for the Python path too"
              (let [row (t2/select-one :model/TableRemapping
                                       :database_id     (mt/id)
                                       :from_schema     "PUBLIC"
                                       :from_table_name "FOO")]
                (is (some? row) "Python target rewrite records a TableRemapping row")
                (is (= "ws_test_schema" (:to_schema row)))
                (is (= "PUBLIC__FOO"    (:to_table_name row))))))
          (finally
            (ws.table-remapping/clear-mappings-for-db! (mt/id))))))))

(deftest non-workspaced-db-target-passthrough-via-execute-test
  (testing "When no WorkspaceDatabase is provisioned, the wrapper passes target through unchanged"
    (let [captured        (atom nil)
          python-transform {:id     998
                            :source {:type :python}
                            :target {:database (mt/id)
                                     :schema   "PUBLIC"
                                     :name     "BAR"
                                     :type     :table}}]
      (with-stubbed-execute-multimethod!
        captured
        (fn []
          (transforms.execute/execute! python-transform)))
      (is (= "PUBLIC" (get-in @captured [:target :schema]))
          ":schema is unchanged when DB is not workspaced")
      (is (nil? (t2/select-one :model/TableRemapping
                               :database_id     (mt/id)
                               :from_schema     "PUBLIC"
                               :from_table_name "BAR"))
          "no TableRemapping row recorded for a non-workspaced DB"))))
