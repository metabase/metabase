(ns metabase-enterprise.workspaces.api.workspace-instance-test
  "Smoke tests for the workspace-instance HTTP API.
   Behavioral logic is tested elsewhere — these just verify routing, auth, and
   request/response shape through the HTTP layer."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
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
        (testing "can_write is true when the workspace is not locked by config"
          (is (true? (:can_write data))))
        (testing "databases is a map keyed by database id with input_schemas + output"
          (is (= 1 (count (:databases data))))
          (let [databases (:databases data)
                db        (or (get databases (mt/id))
                              (get databases (keyword (str (mt/id))))
                              (get databases (str (mt/id))))]
            (is (= ["PUBLIC"] (:input_schemas db)))
            (is (= {:schema "ws_alice"} (:output db)))))))))

(deftest current-with-workspace-locked-returns-can-write-false-test
  (testing "GET /ee/workspace-instance/current returns can_write false when locked by config"
    (ws.tu/with-workspace-locked-by-config
      (fn []
        (with-redefs [ws/instance-workspace (constantly {:name "Locked Test" :databases {}})]
          (let [data (:data (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))]
            (is (= "Locked Test" (:name data)))
            (is (false? (:can_write data)))))))))

(deftest current-with-workspace-locked-by-env-var-returns-can-write-false-test
  (testing "GET /ee/workspace-instance/current returns can_write false when MB_INSTANCE_WORKSPACE is set"
    (mt/with-temp-env-var-value! [:mb-instance-workspace "{\"name\":\"x\",\"databases\":{}}"]
      (with-redefs [ws/instance-workspace (constantly {:name "Env Locked Test" :databases {}})]
        (let [data (:data (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))]
          (is (= "Env Locked Test" (:name data)))
          (is (false? (:can_write data))))))))

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
      (testing "the POST response reports can_write true while unlocked"
        (is (true? (:can_write posted))))
      (testing "GET reflects the workspace just installed"
        (let [fetched (:data (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))]
          (is (= "Installed via API" (:name fetched)))
          (is (= 1 (count (:databases fetched)))))))))

(deftest post-current-rejects-when-locked-test
  (testing "POST /ee/workspace-instance/current returns 400 when locked by config"
    (ws.tu/with-workspace-locked-by-config
      (fn []
        (let [resp (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                         {:name "x" :databases {}})]
          (is (re-find #"config\.yml" (:message resp))))))))

(deftest post-current-rejects-when-env-var-set-test
  (testing "POST /ee/workspace-instance/current returns 400 when MB_INSTANCE_WORKSPACE is set"
    (mt/with-temp-env-var-value! [:mb-instance-workspace "{\"name\":\"x\",\"databases\":{}}"]
      (let [resp (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                       {:name "x" :databases {}})]
        (is (re-find #"config\.yml" (:message resp)))))))

(deftest delete-current-rejects-when-locked-test
  (testing "DELETE /ee/workspace-instance/current returns 400 when locked by config"
    (ws.tu/with-workspace-locked-by-config
      (fn []
        (let [resp (mt/user-http-request :crowberto :delete 400 "ee/workspace-instance/current")]
          (is (re-find #"config\.yml" (:message resp))))))))

(deftest delete-current-rejects-when-env-var-set-test
  (testing "DELETE /ee/workspace-instance/current returns 400 when MB_INSTANCE_WORKSPACE is set"
    (mt/with-temp-env-var-value! [:mb-instance-workspace "{\"name\":\"x\",\"databases\":{}}"]
      (let [resp (mt/user-http-request :crowberto :delete 400 "ee/workspace-instance/current")]
        (is (re-find #"config\.yml" (:message resp)))))))

(deftest post-current-rejects-non-superuser-before-lock-test
  (testing "POST /ee/workspace-instance/current returns 403 (not 400) for a non-superuser even when locked"
    (ws.tu/with-workspace-locked-by-config
      (fn []
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "ee/workspace-instance/current"
                                     {:name "x" :databases {}})))))))

(deftest delete-current-rejects-non-superuser-before-lock-test
  (testing "DELETE /ee/workspace-instance/current returns 403 (not 400) for a non-superuser even when locked"
    (ws.tu/with-workspace-locked-by-config
      (fn []
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 "ee/workspace-instance/current")))))))

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

(deftest delete-current-drops-table-remappings-test
  (testing "DELETE /ee/workspace-instance/current drops any TableRemapping rows"
    (mt/with-model-cleanup [:model/TableRemapping]
      (ws/set-instance-workspace! {:name "to-clear" :databases {}})
      (t2/insert! :model/TableRemapping {:database_id     (mt/id)
                                         :from_schema     "public"
                                         :from_table_name "orders"
                                         :to_schema       "mb_iso"
                                         :to_table_name   "orders"})
      (is (t2/exists? :model/TableRemapping :database_id (mt/id)))
      (mt/user-http-request :crowberto :delete 204 "ee/workspace-instance/current")
      (is (not (t2/exists? :model/TableRemapping :database_id (mt/id)))))))

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
