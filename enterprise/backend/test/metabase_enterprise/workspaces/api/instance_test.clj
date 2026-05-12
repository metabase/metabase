(ns metabase-enterprise.workspaces.api.instance-test
  "Smoke tests for the workspace-instance HTTP API.
   Behavioral logic is tested elsewhere — these just verify routing, auth, and
   request/response shape through the HTTP layer."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- with-premium-feature [f]
  (mt/with-premium-features #{:workspaces}
    (f)))

(use-fixtures :each with-premium-feature)

(deftest current-superuser-only-test
  (testing "GET /ee/workspace-instance/current requires superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/workspace-instance/current")))))

(deftest current-empty-test
  (testing "GET /ee/workspace-instance/current returns nil body when no workspace is loaded"
    (with-redefs [ws/instance-workspace (constantly nil)]
      (is (nil? (mt/user-http-request :crowberto :get 204 "ee/workspace-instance/current"))))))

(deftest current-with-workspace-test
  (testing "GET /ee/workspace-instance/current returns only the workspace name"
    (with-redefs [ws/instance-workspace (constantly {:name      "Current Test"
                                                     :databases {(mt/id) {:input_schemas ["PUBLIC"]
                                                                          :output_schema "ws_alice"}}})]
      (is (= {:name "Current Test"}
             (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))))))

(deftest table-remappings-superuser-only-test
  (testing "GET /ee/workspace-instance/table-remappings requires superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/workspace-instance/table-remappings")))))

(deftest table-remappings-smoke-test
  (testing "GET /ee/workspace-instance/table-remappings returns all rows"
    (mt/with-model-cleanup [:model/TableRemapping]
      (t2/insert! :model/TableRemapping {:database_id     (mt/id)
                                         :from_schema     "public"
                                         :from_table_name "orders"
                                         :to_schema       "mb_iso"
                                         :to_table_name   "orders"})
      (let [result (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/table-remappings")]
        (is (some #(= "orders" (:from_table_name %)) result))))))
