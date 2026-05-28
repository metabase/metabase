(ns metabase-enterprise.workspaces.api.workspace-instance-test
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

(use-fixtures :each
  (fn [thunk]
    (mt/with-premium-features #{:workspaces}
      (try
        (thunk)
        (finally
          (ws/clear-instance-workspace!))))))

(deftest table-remappings-superuser-only-test
  (testing "GET /ee/workspace-instance/table-remappings is superuser-only"
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

(deftest delete-table-remappings-superuser-only-test
  (testing "DELETE /ee/workspace-instance/table-remappings is superuser-only"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :delete 403 "ee/workspace-instance/table-remappings")))))

(deftest delete-table-remappings-drops-all-rows-test
  (testing "DELETE /ee/workspace-instance/table-remappings drops every TableRemapping row"
    (mt/with-model-cleanup [:model/TableRemapping]
      (t2/insert! :model/TableRemapping {:database_id     (mt/id)
                                         :from_schema     "public"
                                         :from_table_name "orders"
                                         :to_schema       "mb_iso"
                                         :to_table_name   "orders"})
      (is (t2/exists? :model/TableRemapping :database_id (mt/id)))
      (mt/user-http-request :crowberto :delete 204 "ee/workspace-instance/table-remappings")
      (is (not (t2/exists? :model/TableRemapping :database_id (mt/id)))))))
