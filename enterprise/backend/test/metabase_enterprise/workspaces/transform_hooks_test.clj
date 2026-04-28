(ns metabase-enterprise.workspaces.transform-hooks-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase-enterprise.workspaces.transform-hooks :as ws.transform-hooks]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f] (mt/with-premium-features #{:workspaces} (f))))

(deftest resolve-transform-target-no-workspace-passthrough-test
  (testing "without a provisioned WorkspaceDatabase, target passes through unchanged"
    (with-redefs [ws/db-workspace-schema     (constantly nil)
                  ws.table-remapping/record-remapping!
                  (fn [& _] (throw (ex-info "record-remapping! must not be called when no workspace is active" {})))]
      (let [target {:schema "public" :name "orders" :type :table}]
        (is (= target (ws.transform-hooks/resolve-transform-target 42 target)))))))

(deftest resolve-transform-target-rewrites-schema-test
  (testing "with a provisioned WorkspaceDatabase, target's :schema is rewritten to the workspace output schema"
    (let [recorded (atom nil)]
      (with-redefs [ws/db-workspace-schema     (constantly "ws_alice")
                    ws.table-remapping/record-remapping!
                    (fn [db-id from-schema from-name to-name]
                      (reset! recorded {:db-id db-id :from-schema from-schema
                                        :from-name from-name :to-name to-name}))]
        (let [target {:schema "public" :name "orders" :type :table}
              result (ws.transform-hooks/resolve-transform-target 42 target)]
          (is (= "ws_alice" (:schema result))
              "schema is rewritten to the workspace output schema")
          (is (= "orders" (:name result))
              "name is preserved — only the schema changes")
          (is (= :table (:type result))
              "other target keys are preserved"))))))

(deftest resolve-transform-target-records-remapping-test
  (testing "with a workspace active, the canonical->workspace remapping is recorded"
    (let [recorded (atom nil)]
      (with-redefs [ws/db-workspace-schema     (constantly "ws_alice")
                    ws.table-remapping/record-remapping!
                    (fn [db-id from-schema from-name to-name]
                      (reset! recorded {:db-id db-id :from-schema from-schema
                                        :from-name from-name :to-name to-name}))]
        (ws.transform-hooks/resolve-transform-target 42 {:schema "public" :name "orders" :type :table})
        (is (= {:db-id 42 :from-schema "public" :from-name "orders" :to-name "orders"}
               @recorded)
            "record-remapping! receives the canonical (schema, name) and the same name as to-name")))))

(deftest resolve-transform-target-end-to-end-test
  (testing "end-to-end against the test app DB: a remapping row appears after the hook fires"
    (mt/with-temp [:model/Workspace         {ws-id :id} {:name (str "ws-" (random-uuid))}
                   :model/WorkspaceDatabase _ {:workspace_id     ws-id
                                               :database_id      (mt/id)
                                               :database_details {}
                                               :output_schema    "ws_test_schema"
                                               :input_schemas    []
                                               :status           :provisioned}]
      (try
        (ws.table-remapping/clear-mappings-for-db! (mt/id))
        (let [target {:schema "PUBLIC" :name "ORDERS" :type :table}
              result (ws.transform-hooks/resolve-transform-target (mt/id) target)]
          (is (= {:schema "ws_test_schema" :name "ORDERS" :type :table}
                 result))
          (testing "TableRemapping row was inserted with the canonical (schema, name) on the from-side"
            (let [row (t2/select-one :model/TableRemapping
                                     :database_id     (mt/id)
                                     :from_schema     "PUBLIC"
                                     :from_table_name "ORDERS")]
              (is (some? row))
              (is (= "ws_test_schema" (:to_schema row)))
              (is (= "ORDERS"         (:to_table_name row))))))
        (finally
          (ws.table-remapping/clear-mappings-for-db! (mt/id)))))))
