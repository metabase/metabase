(ns metabase-enterprise.workspaces.api-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- ws-db-payload
  ([] (ws-db-payload {}))
  ([overrides]
   (merge {:database_id   (mt/id)
           :input_schemas ["public"]}
          overrides)))

(deftest post-workspace-creates-test
  (testing "POST /ee/workspace creates a workspace with server-defaulted output_schema / database_details / status"
    (mt/with-model-cleanup [:model/Workspace]
      (let [resp (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                       {:name      "Made by API"
                                        :databases [(ws-db-payload)]})]
        (is (=? {:id        integer?
                 :name      "Made by API"
                 :databases [{:database_id      (mt/id)
                              :database_details {}
                              :output_schema    ""
                              :input_schemas    ["public"]
                              :status           "uninitialized"}]}
                resp))
        (is (t2/exists? :model/Workspace :id (:id resp)))))))

(deftest post-workspace-strips-server-controlled-fields-test
  (testing "output_schema / database_details / status on the request body are silently ignored"
    (mt/with-model-cleanup [:model/Workspace]
      (let [resp (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                       {:name      "Sneaky"
                                        :databases [(assoc (ws-db-payload)
                                                           :output_schema    "evil"
                                                           :database_details {:user "hacker" :password "pwned"}
                                                           :status           "initialized")]})
            db   (first (:databases resp))]
        (is (= ""  (:output_schema db)))
        (is (= {}  (:database_details db)))
        (is (= "uninitialized" (:status db)))))))

(deftest put-workspace-strips-server-controlled-fields-test
  (testing "PUT ignores output_schema / database_details / status from the client"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Evolving" :databases [(ws-db-payload)]})
            resp         (mt/user-http-request :crowberto :put 200 (str "ee/workspace/" id)
                                               {:name      "Evolving"
                                                :databases [(assoc (ws-db-payload)
                                                                   :output_schema    "evil"
                                                                   :database_details {:user "hacker"}
                                                                   :status           "initialized")]})
            db           (first (:databases resp))]
        (is (= ""  (:output_schema db)))
        (is (= {}  (:database_details db)))
        (is (= "uninitialized" (:status db)))))))

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
                              :database_details {}
                              :output_schema    ""
                              :input_schemas    ["public"]
                              :status           "uninitialized"}]}
                resp)))))

  (testing "GET /ee/workspace/:id with unknown id returns 404"
    (mt/user-http-request :crowberto :get 404 (str "ee/workspace/" Integer/MAX_VALUE))))

(deftest put-workspace-replaces-databases-test
  (testing "PUT /ee/workspace/:id replaces the workspace's databases"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}]
        (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                                 {:name      "Before"
                                                  :databases [(ws-db-payload)
                                                              (ws-db-payload {:database_id   db2-id
                                                                              :input_schemas ["to_drop"]})]})
              resp         (mt/user-http-request :crowberto :put 200 (str "ee/workspace/" id)
                                                 {:name      "After"
                                                  :databases [(ws-db-payload)
                                                              (ws-db-payload {:database_id   db2-id
                                                                              :input_schemas ["fresh"]})]})]
          (is (= "After" (:name resp)))
          (is (= 2 (count (:databases resp))))
          (is (= #{["public"] ["fresh"]} (into #{} (map :input_schemas) (:databases resp))))
          (testing "only the two databases from the PUT survive (the previous ['to_drop'] row is gone)"
            (is (= 2 (t2/count :model/WorkspaceDatabase :workspace_id id)))))))))

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

(deftest post-initialize-triggers-provisioning-test
  (testing "POST /ee/workspace/:id/initialize runs provisioning and returns triggered count"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "To Init" :databases [(ws-db-payload)]})
            called       (atom [])]
        (with-redefs [provisioning/run-async!                  (fn [f] (f))
                      provisioning/provision-workspace-database!
                      (fn [wsd-id] (swap! called conj wsd-id) nil)]
          (let [resp (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" id "/initialize") {})]
            (is (= {:workspace_id id :triggered 1} resp))
            (is (= 1 (count @called)))))))))

(deftest post-initialize-skips-already-initialized-test
  (testing "POST /ee/workspace/:id/initialize skips WorkspaceDatabases that are already :initialized"
    (mt/with-temp [:model/Workspace {id :id} {:name "Mixed"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     id
                    :database_id      (mt/id)
                    :database_details {:user "x"}
                    :output_schema    "done"
                    :input_schemas    ["public"]
                    :status           :initialized}]
      (let [called (atom [])]
        (with-redefs [provisioning/run-async!                  (fn [f] (f))
                      provisioning/provision-workspace-database!
                      (fn [wsd-id] (swap! called conj wsd-id) nil)]
          (let [resp (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" id "/initialize") {})]
            (is (= {:workspace_id id :triggered 0} resp))
            (is (empty? @called))))))))

(deftest post-initialize-requires-superuser-test
  (testing "Non-superusers get 403 from POST /ee/workspace/:id/initialize"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Guarded" :databases []})]
        (mt/user-http-request :rasta :post 403 (str "ee/workspace/" id "/initialize") {})))))

(deftest post-initialize-404-on-unknown-workspace-test
  (testing "POST to /initialize with an unknown id returns 404"
    (mt/user-http-request :crowberto :post 404 (str "ee/workspace/" Integer/MAX_VALUE "/initialize") {})))

(deftest put-rejects-drop-of-initialized-test
  (testing "PUT returns 409 when it would drop an :initialized workspace_database"
    (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {id :id} {:name "Locked"}
                   :model/WorkspaceDatabase _
                   {:workspace_id id :database_id (mt/id)
                    :database_details {:user "u"} :output_schema "s"
                    :input_schemas ["public"] :status :initialized}]
      (mt/user-http-request :crowberto :put 409 (str "ee/workspace/" id)
                            {:name      "Locked"
                             :databases [{:database_id db2-id :input_schemas ["public"]}]}))))

(deftest put-rejects-input-schemas-change-on-initialized-test
  (testing "PUT returns 409 when it would change :input_schemas of an :initialized row"
    (mt/with-temp [:model/Workspace {id :id} {:name "Locked"}
                   :model/WorkspaceDatabase _
                   {:workspace_id id :database_id (mt/id)
                    :database_details {:user "u"} :output_schema "s"
                    :input_schemas ["public"] :status :initialized}]
      (mt/user-http-request :crowberto :put 409 (str "ee/workspace/" id)
                            {:name      "Locked"
                             :databases [{:database_id (mt/id) :input_schemas ["something_else"]}]}))))

(deftest put-preserves-initialized-row-test
  (testing "PUT that preserves (database_id, input_schemas) of an :initialized row succeeds and leaves the row untouched"
    (mt/with-temp [:model/Workspace {id :id} {:name "Locked"}
                   :model/WorkspaceDatabase {init-id :id}
                   {:workspace_id     id
                    :database_id      (mt/id)
                    :database_details {:user "keep" :password "pw"}
                    :output_schema    "kept_schema"
                    :input_schemas    ["public"]
                    :status           :initialized}]
      (let [resp (mt/user-http-request :crowberto :put 200 (str "ee/workspace/" id)
                                       {:name      "Renamed"
                                        :databases [{:database_id (mt/id) :input_schemas ["public"]}]})]
        (is (= "Renamed" (:name resp)))
        (is (= "initialized" (-> resp :databases first :status)))
        (is (= {:user "keep" :password "pw"} (-> resp :databases first :database_details)))
        (is (= "kept_schema" (-> resp :databases first :output_schema)))
        (testing "the row's database-side id is unchanged"
          (is (= init-id (t2/select-one-pk :model/WorkspaceDatabase :workspace_id id))))))))

(deftest post-deprovision-triggers-test
  (testing "POST /ee/workspace/:id/deprovision returns triggered count and calls the per-row fn for each initialized row"
    (mt/with-temp [:model/Workspace {id :id} {:name "Live"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     id
                    :database_id      (mt/id)
                    :database_details {:user "u"}
                    :output_schema    "mb_isolation"
                    :input_schemas    ["public"]
                    :status           :initialized}]
      (let [called (atom [])]
        (with-redefs [provisioning/run-async!                   (fn [f] (f))
                      provisioning/deprovision-workspace-database!
                      (fn [wsd-id] (swap! called conj wsd-id) nil)]
          (let [resp (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" id "/deprovision") {})]
            (is (= {:workspace_id id :triggered 1} resp))
            (is (= 1 (count @called)))))))))

(deftest post-deprovision-skips-uninitialized-test
  (testing "POST /ee/workspace/:id/deprovision with no :initialized rows returns triggered=0 and calls nothing"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                           {:name "Fresh" :databases [(ws-db-payload)]})
            called   (atom [])]
        (with-redefs [provisioning/run-async!                   (fn [f] (f))
                      provisioning/deprovision-workspace-database!
                      (fn [wsd-id] (swap! called conj wsd-id) nil)]
          (let [resp (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" id "/deprovision") {})]
            (is (= {:workspace_id id :triggered 0} resp))
            (is (empty? @called))))))))

(deftest post-deprovision-requires-superuser-test
  (testing "Non-superusers get 403 from POST /:id/deprovision"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Guarded" :databases []})]
        (mt/user-http-request :rasta :post 403 (str "ee/workspace/" id "/deprovision") {})))))

(deftest post-deprovision-404-on-unknown-workspace-test
  (testing "POST /ee/workspace/:id/deprovision with an unknown id returns 404"
    (mt/user-http-request :crowberto :post 404 (str "ee/workspace/" Integer/MAX_VALUE "/deprovision") {})))

(deftest delete-workspace-happy-path-test
  (testing "DELETE /ee/workspace/:id deletes a workspace with no initialized children"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "ToDelete" :databases [(ws-db-payload)]})]
        (is (= {:id id :deleted true}
               (mt/user-http-request :crowberto :delete 200 (str "ee/workspace/" id))))
        (is (not (t2/exists? :model/Workspace :id id)))
        (is (not (t2/exists? :model/WorkspaceDatabase :workspace_id id)))))))

(deftest delete-workspace-rejects-when-initialized-test
  (testing "DELETE /ee/workspace/:id returns 409 when any child is :initialized"
    (mt/with-temp [:model/Workspace {id :id} {:name "Live"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     id
                    :database_id      (mt/id)
                    :database_details {:user "u"}
                    :output_schema    "done"
                    :input_schemas    ["public"]
                    :status           :initialized}]
      (mt/user-http-request :crowberto :delete 409 (str "ee/workspace/" id))
      (is (t2/exists? :model/Workspace :id id)))))

(deftest delete-workspace-requires-superuser-test
  (testing "Non-superusers get 403 from DELETE /:id"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Guarded" :databases []})]
        (mt/user-http-request :rasta :delete 403 (str "ee/workspace/" id))))))

(deftest delete-workspace-404-on-unknown-test
  (testing "DELETE /:id with an unknown id returns 404"
    (mt/user-http-request :crowberto :delete 404 (str "ee/workspace/" Integer/MAX_VALUE))))
