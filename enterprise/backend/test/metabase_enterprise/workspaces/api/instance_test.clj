(ns metabase-enterprise.workspaces.api.instance-test
  "Smoke tests for the workspace-instance HTTP API.
   Behavioral logic is tested in core_test.clj — these just verify routing, auth, and
   request/response shape through the HTTP layer."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- with-premium-feature [f]
  (mt/with-premium-features #{:workspaces}
    (f)))

(use-fixtures :each with-premium-feature)

(deftest remappings-superuser-only-test
  (testing "GET /ee/workspace-instance/remappings requires superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/workspace-instance/remappings")))))

(deftest remappings-smoke-test
  (testing "GET /ee/workspace-instance/remappings"
    (mt/with-model-cleanup [:model/TableRemapping]
      (t2/insert! :model/TableRemapping {:database_id     (mt/id)
                                         :from_schema     "public"
                                         :from_table_name "orders"
                                         :to_schema       "mb_iso"
                                         :to_table_name   "orders"})
      (let [result (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/remappings")]
        (is (some #(= "orders" (:from_table_name %)) result))))))

(deftest current-empty-test
  (testing "GET /ee/workspace-instance/current returns 204 (nil body) when no workspace is loaded"
    (mt/with-model-cleanup [:model/Workspace]
      (is (nil? (mt/user-http-request :crowberto :get 204 "ee/workspace-instance/current"))))))

(deftest current-with-workspace-test
  (testing "GET /ee/workspace-instance/current returns the loaded workspace shaped for the FE"
    ;; The `current` endpoint reads from the in-process `workspace-instance-config`
    ;; atom populated at boot by the `:workspace` section of `config.yml` — not from
    ;; the manager-side app DB rows. So we set the atom directly here.
    (mt/with-model-cleanup [:model/TableRemapping]
      (with-redefs [ws/instance-workspace (constantly
                                           {:name      "Current Test"
                                            :databases {(mt/id) {:input_schemas ["PUBLIC"]
                                                                 :output_schema "ws_alice"}}})]
        (t2/insert! :model/TableRemapping {:database_id     (mt/id)
                                           :from_schema     "public"
                                           :from_table_name "events"
                                           :to_schema       "ws_alice"
                                           :to_table_name   "events"})
        (let [result (mt/user-http-request :crowberto :get 200 "ee/workspace-instance/current")]
          (is (= "Current Test" (:name result)))
          (is (= 1 (:remappings_count result)))
          (testing "databases keyed by integer db-id"
            (let [db-entry (get (:databases result) (mt/id))]
              (is (some? db-entry))
              (is (= ["PUBLIC"] (:input_schemas db-entry)))
              (is (string? (:name db-entry))))))))))

(deftest current-superuser-only-test
  (testing "GET /ee/workspace-instance/current requires superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/workspace-instance/current")))))

;;; ------------------------------------------- Sync endpoint -------------------------------------------------------

(deftest sync-requires-superuser-test
  (testing "POST /ee/workspace-instance/sync requires superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 "ee/workspace-instance/sync")))))

(deftest sync-requires-workspace-mode-test
  (testing "POST /ee/workspace-instance/sync fails when not in workspace mode"
    (with-redefs [ws/instance-workspace (constantly nil)]
      (is (= "This instance is not running in workspace mode."
             (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/sync"))))))

(deftest sync-requires-git-configured-test
  (testing "POST /ee/workspace-instance/sync fails when no git repo configured"
    (with-redefs [ws/instance-workspace          (constantly {:name "test-ws" :databases {}})
                  remote-sync.settings/remote-sync-enabled (constantly false)]
      (is (= "No git repository configured. Set remote-sync-url to enable."
             (mt/user-http-request :crowberto :post 400 "ee/workspace-instance/sync"))))))
