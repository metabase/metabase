(ns metabase-enterprise.workspaces.api-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- ws-db-payload
  ([] (ws-db-payload {}))
  ([overrides]
   (merge {:database_id      (mt/id)
           :database_details {:user "alice" :password "s3cr3t"}
           :output_schema    "ws_out"
           :input_schemas    ["public"]}
          overrides)))

(deftest post-workspace-creates-test
  (testing "POST /ee/workspace creates a workspace with nested databases"
    (mt/with-model-cleanup [:model/Workspace]
      (let [resp (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                       {:name      "Made by API"
                                        :databases [(ws-db-payload)]})]
        (is (=? {:id        integer?
                 :name      "Made by API"
                 :databases [{:database_id      (mt/id)
                              :database_details {:user "alice" :password "s3cr3t"}
                              :output_schema    "ws_out"
                              :input_schemas    ["public"]
                              :status           "uninitialized"}]}
                resp))
        (is (t2/exists? :model/Workspace :id (:id resp)))))))

(deftest post-workspace-accepts-status-test
  (testing "POST /ee/workspace accepts :status on each database and echoes it back"
    (mt/with-model-cleanup [:model/Workspace]
      (let [resp (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                       {:name      "With Status"
                                        :databases [(ws-db-payload {:status "initialized"})]})]
        (is (= "initialized" (:status (first (:databases resp)))))))))

(deftest put-workspace-updates-status-test
  (testing "PUT /ee/workspace/:id can change a workspace_database's :status"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Evolving" :databases [(ws-db-payload)]})
            resp         (mt/user-http-request :crowberto :put 200 (str "ee/workspace/" id)
                                               {:name      "Evolving"
                                                :databases [(ws-db-payload {:status "initialized"})]})]
        (is (= "initialized" (:status (first (:databases resp)))))))))

(deftest post-workspace-rejects-unknown-status-test
  (testing "POST with an unknown :status value is rejected"
    (mt/user-http-request :crowberto :post 400 "ee/workspace"
                          {:name "Bad Status" :databases [(ws-db-payload {:status "nonsense"})]})))

(deftest post-workspace-requires-superuser-test
  (testing "Non-superusers get 403 from POST /ee/workspace"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/user-http-request :rasta :post 403 "ee/workspace"
                            {:name "Denied" :databases []}))))

(deftest post-workspace-schema-validation-test
  (testing "POST with missing :name returns 400"
    (mt/user-http-request :crowberto :post 400 "ee/workspace"
                          {:databases []})))

(deftest get-workspace-list-test
  (testing "GET /ee/workspace returns all workspaces with hydrated databases"
    (mt/with-model-cleanup [:model/Workspace]
      (let [created-a (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                            {:name "WS A" :databases [(ws-db-payload)]})
            created-b (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                            {:name "WS B" :databases []})
            resp      (mt/user-http-request :crowberto :get 200 "ee/workspace")
            by-id     (into {} (map (juxt :id identity)) resp)]
        (is (contains? by-id (:id created-a)))
        (is (contains? by-id (:id created-b)))
        (is (= 1 (count (:databases (get by-id (:id created-a))))))
        (is (= [] (:databases (get by-id (:id created-b)))))))))

(deftest get-workspace-by-id-test
  (testing "GET /ee/workspace/:id returns one workspace hydrated"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name      "Single"
                                                :databases [(ws-db-payload)]})
            resp         (mt/user-http-request :crowberto :get 200 (str "ee/workspace/" id))]
        (is (=? {:id        id
                 :name      "Single"
                 :databases [{:database_id      (mt/id)
                              :database_details {:user "alice" :password "s3cr3t"}
                              :output_schema    "ws_out"
                              :input_schemas    ["public"]}]}
                resp)))))

  (testing "GET /ee/workspace/:id with unknown id returns 404"
    (mt/user-http-request :crowberto :get 404 (str "ee/workspace/" Integer/MAX_VALUE))))

(deftest put-workspace-replaces-databases-test
  (testing "PUT /ee/workspace/:id replaces the workspace's databases"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}]
        (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                 {:name      "Before"
                                                  :databases [(ws-db-payload {:output_schema "keep"
                                                                              :input_schemas ["keep"]})
                                                              (ws-db-payload {:database_id   db2-id
                                                                              :output_schema "drop"
                                                                              :input_schemas ["drop"]})]})
              resp         (mt/user-http-request :crowberto :put 200 (str "ee/workspace/" id)
                                                 {:name      "After"
                                                  :databases [(ws-db-payload {:output_schema "keep"
                                                                              :input_schemas ["keep"]})
                                                              (ws-db-payload {:database_id   db2-id
                                                                              :output_schema "new"
                                                                              :input_schemas ["new"]})]})]
          (is (= "After" (:name resp)))
          (is (= #{"keep" "new"} (into #{} (map :output_schema) (:databases resp))))
          (is (not (t2/exists? :model/WorkspaceDatabase :workspace_id id :output_schema "drop"))))))))

(deftest put-workspace-requires-superuser-test
  (testing "Non-superusers get 403 from PUT /ee/workspace/:id"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Guarded" :databases []})]
        (mt/user-http-request :rasta :put 403 (str "ee/workspace/" id)
                              {:name "Nope" :databases []})))))

(deftest get-workspace-requires-superuser-test
  (testing "Non-superusers get 403 from GET endpoints"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Guarded" :databases []})]
        (mt/user-http-request :rasta :get 403 "ee/workspace")
        (mt/user-http-request :rasta :get 403 (str "ee/workspace/" id))))))
