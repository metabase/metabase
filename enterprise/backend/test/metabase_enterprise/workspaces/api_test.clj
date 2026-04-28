(ns metabase-enterprise.workspaces.api-test
  "Smoke tests for the workspace HTTP API.
   Behavioral logic is tested in core_test.clj — these just verify routing, auth, and
   request/response shape through the HTTP layer."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- with-premium-feature [f]
  (mt/with-premium-features #{:workspaces}
    (f)))

(use-fixtures :each with-premium-feature)

(defn- stub-provisioner []
  (reify provisioning/Provisioner
    (init! [_ _ _ _]
      {:schema "mb_iso_stub" :database_details {:user "stub_user" :password "stub_pass"}})
    (grant! [_ _ _ _ _] nil)
    (destroy! [_ _ _ _] nil)))

(deftest admin-only-test
  (testing "all endpoints require superuser"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace/"
                                     {:name "Auth Test"})]
        (doseq [[label method status path body]
                [["GET /"                :get    403 "ee/workspace/"                                  nil]
                 ["GET /:id"             :get    403 (str "ee/workspace/" (:id ws))                   nil]
                 ["POST /"               :post   403 "ee/workspace/"                                  {:name "X"}]
                 ["PUT /:id"             :put    403 (str "ee/workspace/" (:id ws))                   {:name "Y"}]
                 ["DELETE /:id"          :delete 403 (str "ee/workspace/" (:id ws))                   nil]
                 ["POST database"        :post   403 (str "ee/workspace/" (:id ws) "/database")       {:database_id (mt/id) :input_schemas ["PUBLIC"]}]
                 ["GET remappings"       :get    403 "ee/workspace/remappings"                        nil]]]
          (testing label
            (is (= "You don't have permissions to do that."
                   (if body
                     (mt/user-http-request :rasta method status path body)
                     (mt/user-http-request :rasta method status path))))))))))

(deftest crud-smoke-test
  (testing "create, get, list, delete round-trip"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace/"
                                     {:name "Smoke Test"})]
        (is (pos? (:id ws)))
        (is (= "Smoke Test" (:name ws)))
        (is (empty? (:databases ws)))
        (is (some? (:creator ws)))

        (testing "get"
          (is (= (:id ws)
                 (:id (mt/user-http-request :crowberto :get 200 (str "ee/workspace/" (:id ws)))))))

        (testing "list"
          (is (some #(= (:id ws) (:id %))
                    (mt/user-http-request :crowberto :get 200 "ee/workspace/"))))

        (testing "delete"
          (is (true? (:deleted (mt/user-http-request :crowberto :delete 200 (str "ee/workspace/" (:id ws))))))
          (mt/user-http-request :crowberto :get 404 (str "ee/workspace/" (:id ws))))))))

(deftest database-endpoints-smoke-test
  (testing "add, update, remove database via HTTP"
    (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
      (mt/with-model-cleanup [:model/Workspace]
        (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace/"
                                       {:name "DB Test"})]
          (testing "POST /:id/database adds and provisions"
            (let [ws' (mt/user-http-request :crowberto :post 200
                                            (str "ee/workspace/" (:id ws) "/database")
                                            {:database_id (mt/id) :input_schemas ["PUBLIC"]})]
              (is (= 1 (count (:databases ws'))))
              (is (= "provisioned" (:status (first (:databases ws')))))))

          (testing "PUT /:id/database/:db-id updates schemas"
            (let [ws' (mt/user-http-request :crowberto :put 200
                                            (str "ee/workspace/" (:id ws) "/database/" (mt/id))
                                            {:input_schemas ["PUBLIC" "ANALYTICS"]})]
              (is (= ["PUBLIC" "ANALYTICS"] (:input_schemas (first (:databases ws')))))))

          (testing "DELETE /:id/database/:db-id deprovisions and removes"
            (let [ws' (mt/user-http-request :crowberto :delete 200
                                            (str "ee/workspace/" (:id ws) "/database/" (mt/id)))]
              (is (empty? (:databases ws'))))))))))

(deftest remappings-smoke-test
  (testing "GET /ee/workspace/remappings"
    (mt/with-model-cleanup [:model/TableRemapping]
      (t2/insert! :model/TableRemapping {:database_id     (mt/id)
                                         :from_schema     "public"
                                         :from_table_name "orders"
                                         :to_schema       "mb_iso"
                                         :to_table_name   "orders"})
      (let [result (mt/user-http-request :crowberto :get 200 "ee/workspace/remappings")]
        (is (some #(= "orders" (:from_table_name %)) result))))))

(deftest current-empty-test
  (testing "GET /ee/workspace/current returns 204 (nil body) when no workspace is loaded"
    (mt/with-model-cleanup [:model/Workspace]
      (is (nil? (mt/user-http-request :crowberto :get 204 "ee/workspace/current"))))))

(deftest current-with-workspace-test
  (testing "GET /ee/workspace/current returns the loaded workspace shaped for the FE"
    (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
      (mt/with-model-cleanup [:model/Workspace :model/TableRemapping]
        (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace/"
                                       {:name "Current Test"})]
          (mt/user-http-request :crowberto :post 200
                                (str "ee/workspace/" (:id ws) "/database")
                                {:database_id (mt/id) :input_schemas ["PUBLIC"]})
          (t2/insert! :model/TableRemapping {:database_id     (mt/id)
                                             :from_schema     "public"
                                             :from_table_name "events"
                                             :to_schema       "ws_alice"
                                             :to_table_name   "events"})
          (let [result (mt/user-http-request :crowberto :get 200 "ee/workspace/current")]
            (is (= "Current Test" (:name result)))
            (is (= 1 (:remappings_count result)))
            (testing "databases keyed by integer db-id"
              (let [db-entry (get (:databases result) (mt/id))]
                (is (some? db-entry))
                (is (= ["PUBLIC"] (:input_schemas db-entry)))
                (is (string? (:name db-entry)))))))))))

(deftest current-superuser-only-test
  (testing "GET /ee/workspace/current requires superuser"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 "ee/workspace/current")))))
