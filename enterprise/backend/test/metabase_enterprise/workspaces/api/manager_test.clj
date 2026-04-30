(ns metabase-enterprise.workspaces.api.workspace-manager-test
  "Smoke tests for the workspace-manager HTTP API.
   Behavioral logic is tested in core_test.clj — these just verify routing, auth, and
   request/response shape through the HTTP layer."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

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
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                     {:name "Auth Test"})]
        (doseq [[label method status path body]
                [["GET /"         :get    403 "ee/workspace-manager/"                                  nil]
                 ["GET /:id"      :get    403 (str "ee/workspace-manager/" (:id ws))                   nil]
                 ["POST /"        :post   403 "ee/workspace-manager/"                                  {:name "X"}]
                 ["PUT /:id"      :put    403 (str "ee/workspace-manager/" (:id ws))                   {:name "Y"}]
                 ["DELETE /:id"   :delete 403 (str "ee/workspace-manager/" (:id ws))                   nil]
                 ["POST database" :post   403 (str "ee/workspace-manager/" (:id ws) "/database")       {:database_id (mt/id) :input_schemas ["PUBLIC"]}]]]
          (testing label
            (is (= "You don't have permissions to do that."
                   (if body
                     (mt/user-http-request :rasta method status path body)
                     (mt/user-http-request :rasta method status path))))))))))

(deftest crud-smoke-test
  (testing "create, get, list, delete round-trip"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                     {:name "Smoke Test"})]
        (is (pos? (:id ws)))
        (is (= "Smoke Test" (:name ws)))
        (is (empty? (:databases ws)))
        (is (some? (:creator ws)))

        (testing "get"
          (is (= (:id ws)
                 (:id (mt/user-http-request :crowberto :get 200 (str "ee/workspace-manager/" (:id ws)))))))

        (testing "list"
          (is (some #(= (:id ws) (:id %))
                    (mt/user-http-request :crowberto :get 200 "ee/workspace-manager/"))))

        (testing "delete"
          (is (true? (:deleted (mt/user-http-request :crowberto :delete 200 (str "ee/workspace-manager/" (:id ws))))))
          (mt/user-http-request :crowberto :get 404 (str "ee/workspace-manager/" (:id ws))))))))

(deftest database-endpoints-smoke-test
  (testing "add, update, remove database via HTTP"
    (with-redefs [provisioning/dispatching-provisioner (stub-provisioner)]
      (mt/with-model-cleanup [:model/Workspace]
        (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace-manager/"
                                       {:name "DB Test"})]
          (testing "POST /:id/database adds and provisions"
            (let [ws' (mt/user-http-request :crowberto :post 200
                                            (str "ee/workspace-manager/" (:id ws) "/database")
                                            {:database_id (mt/id) :input_schemas ["PUBLIC"]})]
              (is (= 1 (count (:databases ws'))))
              (is (= "provisioned" (:status (first (:databases ws')))))))

          (testing "PUT /:id/database/:db-id updates schemas"
            (let [ws' (mt/user-http-request :crowberto :put 200
                                            (str "ee/workspace-manager/" (:id ws) "/database/" (mt/id))
                                            {:input_schemas ["PUBLIC" "ANALYTICS"]})]
              (is (= ["PUBLIC" "ANALYTICS"] (:input_schemas (first (:databases ws')))))))

          (testing "DELETE /:id/database/:db-id deprovisions and removes"
            (let [ws' (mt/user-http-request :crowberto :delete 200
                                            (str "ee/workspace-manager/" (:id ws) "/database/" (mt/id)))]
              (is (empty? (:databases ws'))))))))))
