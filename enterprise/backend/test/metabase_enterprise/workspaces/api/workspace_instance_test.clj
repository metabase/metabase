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

(defn- with-premium-feature [f]
  (mt/with-premium-features #{:workspaces}
    (f)))

(defn- with-clear-workspace! [f]
  (try
    (f)
    (finally
      (ws/clear-instance-workspace!))))

(use-fixtures :each with-premium-feature with-clear-workspace!)

(deftest current-superuser-only-test
  (testing "GET /ee/workspace-instance/current requires data analyst or superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/workspace-instance/current")))))

(deftest current-empty-test
  (testing "GET /ee/workspace-instance/current returns {:data nil} when no workspace is loaded"
    (with-redefs [ws/instance-workspace (constantly nil)]
      (is (= {:data nil}
             (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))))))

(deftest current-with-workspace-test
  (testing "GET /ee/workspace-instance/current returns the workspace wrapped in {:data ...}"
    (with-redefs [ws/instance-workspace (constantly {:name      "Current Test"
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

(deftest post-current-superuser-only-test
  (testing "POST /ee/workspace-instance/current requires data analyst or superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 "ee/workspace-instance/current"
                                 {:name "x" :databases {}})))))

(deftest post-current-round-trip-test
  (testing "POST /ee/workspace-instance/current installs the workspace and is readable via GET"
    (let [payload {:name      "Installed via API"
                   :databases {(mt/id) {:input_schemas ["PUBLIC"]
                                        :output        {:schema "ws_api_install"}}}}
          posted  (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/current" payload)]
      (is (= "Installed via API" (:name posted)))
      (testing "GET reflects the workspace just installed"
        (let [fetched (:data (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))]
          (is (= "Installed via API" (:name fetched)))
          (is (= 1 (count (:databases fetched)))))))))

(deftest delete-current-superuser-only-test
  (testing "DELETE /ee/workspace-instance/current requires data analyst or superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :delete 403 "ee/workspace-instance/current")))))

(deftest delete-current-clears-workspace-test
  (testing "DELETE /ee/workspace-instance/current clears any installed workspace"
    (ws/set-instance-workspace! {:name "to-clear" :databases {}})
    (is (some? (ws/instance-workspace)))
    (mt/user-http-request :crowberto :delete 204 "ee/workspace-instance/current")
    (is (nil? (ws/instance-workspace)))))

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
