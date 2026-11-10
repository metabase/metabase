(ns metabase-enterprise.workspaces.api.workspace-instance-test
  "Smoke tests for the workspace-instance HTTP API.
   Behavioral logic is tested elsewhere — these just verify routing, auth, and
   request/response shape through the HTTP layer."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.settings :as ws.settings]
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
    (mt/with-dynamic-fn-redefs [ws/instance-workspace (constantly nil)]
      (is (= {:data nil}
             (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))))))

(deftest current-with-workspace-test
  (testing "GET /ee/workspace-instance/current returns {:data {:databases {<id> <schema>}}} from the settings"
    (ws.tu/with-workspace-db! (mt/id) "ws_alice"
      (fn []
        (is (= {:data {:databases [{:database_id (mt/id) :schema "ws_alice"}]}}
               (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current")))))))

(deftest current-enabled-without-schemas-test
  (testing "workspaces-enabled with no database-workspace-schema anywhere is a workspace with no databases, not null"
    (ws.settings/workspaces-enabled! true)
    (is (= {:data {:databases []}}
           (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current")))))

(deftest post-current-superuser-only-test
  (testing "POST /ee/workspace-instance/current requires data analyst or superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 "ee/workspace-instance/current"
                                 {:databases []})))))

(deftest post-current-round-trip-test
  (testing "POST /ee/workspace-instance/current sets the settings and is readable via GET"
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {}}
      (let [expected {:databases [{:database_id (mt/id) :schema "ws_api_install"}]}]
        (is (= expected
               (mt/user-http-request :crowberto :post 200 "ee/workspace-instance/current"
                                     expected)))
        (testing "the settings hold it"
          (is (true? (ws.settings/workspaces-enabled)))
          (is (= {:schema "ws_api_install"} (ws/db-workspace-namespace (mt/id)))))
        (testing "GET reflects the workspace just installed"
          (is (= {:data expected}
                 (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current"))))))))

(deftest post-current-rejects-unknown-database-test
  (testing "POST /ee/workspace-instance/current returns 400 for a database id this instance doesn't have"
    (is (re-find #"Unknown database ids"
                 (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                       {:databases [{:database_id Integer/MAX_VALUE :schema "ws"}]})))
    (is (false? (ws.settings/workspaces-enabled)))))

(deftest post-current-rejects-old-shape-test
  (testing "POST /ee/workspace-instance/current rejects (not strips) the pre-settings body with name and input_schemas"
    (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                          {:name      "old"
                           :databases {(mt/id) {:input_schemas ["PUBLIC"] :output {:schema "ws"}}}})
    (testing "and a list entry with the old keys instead of :schema"
      (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                            {:databases [{:database_id (mt/id) :output {:schema "ws"}}]}))
    (is (false? (ws.settings/workspaces-enabled)))))

(deftest post-current-refused-on-a-parent-test
  (testing "POST /ee/workspace-instance/current returns 400 on an instance with workspaces of its own"
    (mt/with-temp [:model/Workspace _ {:name "parent-ws"}]
      (is (re-find #"workspaces of its own"
                   (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/current"
                                         {:databases []}))))))

(deftest delete-current-rejects-when-env-var-set-test
  (testing "DELETE /ee/workspace-instance/current returns 400 when MB_WORKSPACES_ENABLED sets the setting"
    (mt/with-temp-env-var-value! [:mb-workspaces-enabled "true"]
      (is (re-find #"MB_WORKSPACES_ENABLED"
                   (mt/user-http-request :crowberto :delete 400 "ee/workspace-instance/current"))))))

(deftest delete-current-superuser-only-test
  (testing "DELETE /ee/workspace-instance/current requires data analyst or superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :delete 403 "ee/workspace-instance/current")))))

(deftest delete-current-clears-workspace-test
  (testing "DELETE /ee/workspace-instance/current clears any installed workspace"
    (ws/set-instance-workspace! {})
    (is (some? (ws/instance-workspace)))
    (mt/user-http-request :crowberto :delete 204 "ee/workspace-instance/current")
    (is (nil? (ws/instance-workspace)))))

(deftest delete-current-drops-table-remappings-test
  (testing "DELETE /ee/workspace-instance/current drops any TableRemapping rows"
    (mt/with-model-cleanup [:model/TableRemapping]
      (ws/set-instance-workspace! {})
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
