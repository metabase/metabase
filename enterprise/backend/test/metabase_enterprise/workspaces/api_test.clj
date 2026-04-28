(ns metabase-enterprise.workspaces.api-test
  "Smoke tests for the workspace HTTP API.
   Behavioral logic is tested in core_test.clj — these just verify routing, auth, and
   request/response shape through the HTTP layer."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- with-premium-feature [f]
  (mt/with-premium-features #{:workspaces}
    (f)))

(use-fixtures :each with-premium-feature)

(deftest admin-only-test
  (testing "all endpoints require superuser"
    (mt/with-model-cleanup [:model/Workspace]
      (let [ws (mt/user-http-request :crowberto :post 200 "ee/workspace/"
                                     {:name      "Auth Test"
                                      :databases [{:database_id   (mt/id)
                                                   :input_schemas ["PUBLIC"]}]})]
        (doseq [[label method status path body]
                [["GET /"                :get    403 "ee/workspace/"                                  nil]
                 ["GET /:id"             :get    403 (str "ee/workspace/" (:id ws))                   nil]
                 ["POST /"               :post   403 "ee/workspace/"                                  {:name "X" :databases [{:database_id (mt/id) :input_schemas ["PUBLIC"]}]}]
                 ["PUT /:id"             :put    403 (str "ee/workspace/" (:id ws))                   {:name "X" :databases [{:database_id (mt/id) :input_schemas ["PUBLIC"]}]}]
                 ["DELETE /:id"          :delete 403 (str "ee/workspace/" (:id ws))                   nil]
                 ["POST provision"       :post   403 (str "ee/workspace/" (:id ws) "/provision")      nil]
                 ["POST deprovision"     :post   403 (str "ee/workspace/" (:id ws) "/deprovision")    nil]
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
                                     {:name      "Smoke Test"
                                      :databases [{:database_id   (mt/id)
                                                   :input_schemas ["PUBLIC" "raw_github"]}]})]
        (is (pos? (:id ws)))
        (is (= "Smoke Test" (:name ws)))
        (is (= ["PUBLIC" "raw_github"] (:input_schemas (first (:databases ws)))))
        (is (= "unprovisioned" (:status (first (:databases ws)))))
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
