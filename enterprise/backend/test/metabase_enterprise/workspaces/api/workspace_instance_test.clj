(ns metabase-enterprise.workspaces.api.workspace-instance-test
  "Smoke tests for the workspace-instance HTTP API.
   Behavioral logic is tested elsewhere — these just verify routing, auth, and
   request/response shape through the HTTP layer."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.instance :as ws.instance]
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
          (ws.instance/clear-instance-workspace!))))))

(deftest current-superuser-only-test
  (testing "GET /ee/workspace-instance/current requires data analyst or superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/workspace-instance/current")))))

(deftest current-empty-test
  (testing "GET /ee/workspace-instance/current returns {:data nil} when no workspace is loaded"
    (with-redefs [ws.instance/instance-workspace (constantly nil)]
      (is (= {:data nil}
             (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))))))

(deftest current-with-workspace-test
  (testing "GET /ee/workspace-instance/current returns the workspace wrapped in {:data ...}"
    (with-redefs [ws.instance/instance-workspace (constantly {:name      "Current Test"
                                                              :databases {(mt/id) {:input_schemas ["PUBLIC"]
                                                                                   :output        {:schema "ws_alice"}}}})]
      (let [result (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current")
            data   (:data result)]
        (is (= "Current Test" (:name data)))
        (testing "databases is a map keyed by database id with input_schemas + output"
          (is (= 1 (count (:databases data))))
          (let [databases (:databases data)
                db        (or (get databases (mt/id))
                              (get databases (keyword (str (mt/id))))
                              (get databases (str (mt/id))))]
            (is (= ["PUBLIC"] (:input_schemas db)))
            (is (= {:schema "ws_alice"} (:output db)))))))))

(deftest table-remappings-superuser-only-test
  (testing "GET /ee/workspace-instance/table-remappings requires data analyst or superuser"
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
