(ns metabase-enterprise.workspaces.api-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws-core]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f]
                      (mt/with-premium-features #{:workspaces}
                        (f))))

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
                              :status           "unprovisioned"}]}
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
                                                           :status           "provisioned")]})
            db   (first (:databases resp))]
        (is (= ""  (:output_schema db)))
        (is (= {}  (:database_details db)))
        (is (= "unprovisioned" (:status db)))))))

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
                                                                   :status           "provisioned")]})
            db           (first (:databases resp))]
        (is (= ""  (:output_schema db)))
        (is (= {}  (:database_details db)))
        (is (= "unprovisioned" (:status db)))))))

(deftest post-workspace-requires-superuser-test
  (testing "Non-superusers get 403 from POST /ee/workspace"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/user-http-request :rasta :post 403 "ee/workspace"
                            {:name "Denied" :databases [(ws-db-payload)]}))))

(deftest post-workspace-schema-validation-test
  (testing "POST with missing :name returns 400"
    (mt/user-http-request :crowberto :post 400 "ee/workspace"
                          {:databases [(ws-db-payload)]})))

(deftest post-workspace-rejects-empty-databases-test
  (testing "POST with an empty :databases list returns 400 — a Workspace must have at least one database"
    (mt/user-http-request :crowberto :post 400 "ee/workspace"
                          {:name "No DBs" :databases []})))

(deftest put-workspace-rejects-empty-databases-test
  (testing "PUT with an empty :databases list returns 400"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Start" :databases [(ws-db-payload)]})]
        (mt/user-http-request :crowberto :put 400 (str "ee/workspace/" id)
                              {:name "Start" :databases []})))))

(deftest get-workspace-list-test
  (testing "GET /ee/workspace returns all workspaces with hydrated databases"
    (mt/with-model-cleanup [:model/Workspace]
      (let [created-a (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                            {:name "WS A" :databases [(ws-db-payload)]})
            created-b (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                            {:name "WS B" :databases [(ws-db-payload)]})
            resp      (mt/user-http-request :crowberto :get 200 "ee/workspace")
            by-id     (into {} (map (juxt :id identity)) resp)]
        (is (contains? by-id (:id created-a)))
        (is (contains? by-id (:id created-b)))
        (is (= 1 (count (:databases (get by-id (:id created-a))))))
        (is (= 1 (count (:databases (get by-id (:id created-b))))))))))

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
                              :status           "unprovisioned"}]}
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
                                               {:name "Guarded" :databases [(ws-db-payload)]})]
        (mt/user-http-request :rasta :put 403 (str "ee/workspace/" id)
                              {:name "Nope" :databases [(ws-db-payload)]})))))

(deftest get-workspace-requires-superuser-test
  (testing "Non-superusers get 403 from GET endpoints"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Guarded" :databases [(ws-db-payload)]})]
        (mt/user-http-request :rasta :get 403 "ee/workspace")
        (mt/user-http-request :rasta :get 403 (str "ee/workspace/" id))))))

(deftest post-provision-triggers-provisioning-test
  (testing "POST /ee/workspace/:id/provision runs provisioning and returns triggered count"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "To Init" :databases [(ws-db-payload)]})
            called       (atom [])]
        (with-redefs [provisioning/run-async!                  (fn [f] (f))
                      provisioning/provision-workspace-database!
                      (fn [wsd-id] (swap! called conj wsd-id) nil)]
          (let [resp (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" id "/provision") {})]
            (is (= {:workspace_id id :triggered 1} resp))
            (is (= 1 (count @called)))))))))

(deftest post-provision-skips-already-initialized-test
  (testing "POST /ee/workspace/:id/provision skips WorkspaceDatabases that are already :provisioned"
    (mt/with-temp [:model/Workspace {id :id} {:name "Mixed"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     id
                    :database_id      (mt/id)
                    :database_details {:user "x"}
                    :output_schema    "done"
                    :input_schemas    ["public"]
                    :status           :provisioned}]
      (let [called (atom [])]
        (with-redefs [provisioning/run-async!                  (fn [f] (f))
                      provisioning/provision-workspace-database!
                      (fn [wsd-id] (swap! called conj wsd-id) nil)]
          (let [resp (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" id "/provision") {})]
            (is (= {:workspace_id id :triggered 0} resp))
            (is (empty? @called))))))))

(deftest post-provision-requires-superuser-test
  (testing "Non-superusers get 403 from POST /ee/workspace/:id/provision"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Guarded" :databases [(ws-db-payload)]})]
        (mt/user-http-request :rasta :post 403 (str "ee/workspace/" id "/provision") {})))))

(deftest post-provision-404-on-unknown-workspace-test
  (testing "POST to /provision with an unknown id returns 404"
    (mt/user-http-request :crowberto :post 404 (str "ee/workspace/" Integer/MAX_VALUE "/provision") {})))

(deftest put-rejects-drop-of-initialized-test
  (testing "PUT returns 409 when it would drop an :provisioned workspace_database"
    (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {id :id} {:name "Locked"}
                   :model/WorkspaceDatabase _
                   {:workspace_id id :database_id (mt/id)
                    :database_details {:user "u"} :output_schema "s"
                    :input_schemas ["public"] :status :provisioned}]
      (mt/user-http-request :crowberto :put 409 (str "ee/workspace/" id)
                            {:name      "Locked"
                             :databases [{:database_id db2-id :input_schemas ["public"]}]}))))

(deftest put-rejects-input-schemas-change-on-initialized-test
  (testing "PUT returns 409 when it would change :input_schemas of an :provisioned row"
    (mt/with-temp [:model/Workspace {id :id} {:name "Locked"}
                   :model/WorkspaceDatabase _
                   {:workspace_id id :database_id (mt/id)
                    :database_details {:user "u"} :output_schema "s"
                    :input_schemas ["public"] :status :provisioned}]
      (mt/user-http-request :crowberto :put 409 (str "ee/workspace/" id)
                            {:name      "Locked"
                             :databases [{:database_id (mt/id) :input_schemas ["something_else"]}]}))))

(deftest put-preserves-initialized-row-test
  (testing "PUT that preserves (database_id, input_schemas) of an :provisioned row succeeds and leaves the row untouched"
    (mt/with-temp [:model/Workspace {id :id} {:name "Locked"}
                   :model/WorkspaceDatabase {init-id :id}
                   {:workspace_id     id
                    :database_id      (mt/id)
                    :database_details {:user "keep" :password "pw"}
                    :output_schema    "kept_schema"
                    :input_schemas    ["public"]
                    :status           :provisioned}]
      (let [resp (mt/user-http-request :crowberto :put 200 (str "ee/workspace/" id)
                                       {:name      "Renamed"
                                        :databases [{:database_id (mt/id) :input_schemas ["public"]}]})]
        (is (= "Renamed" (:name resp)))
        (is (= "provisioned" (-> resp :databases first :status)))
        (is (= {:user "keep" :password "pw"} (-> resp :databases first :database_details)))
        (is (= "kept_schema" (-> resp :databases first :output_schema)))
        (testing "the row's database-side id is unchanged"
          (is (= init-id (t2/select-one-pk :model/WorkspaceDatabase :workspace_id id))))))))

(deftest post-unprovision-triggers-test
  (testing "POST /ee/workspace/:id/unprovision returns triggered count and calls the per-row fn for each initialized row"
    (mt/with-temp [:model/Workspace {id :id} {:name "Live"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     id
                    :database_id      (mt/id)
                    :database_details {:user "u"}
                    :output_schema    "mb_isolation"
                    :input_schemas    ["public"]
                    :status           :provisioned}]
      (let [called (atom [])]
        (with-redefs [provisioning/run-async!                   (fn [f] (f))
                      provisioning/unprovision-workspace-database!
                      (fn [wsd-id] (swap! called conj wsd-id) nil)]
          (let [resp (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" id "/unprovision") {})]
            (is (= {:workspace_id id :triggered 1} resp))
            (is (= 1 (count @called)))))))))

(deftest post-unprovision-skips-uninitialized-test
  (testing "POST /ee/workspace/:id/unprovision with no :provisioned rows returns triggered=0 and calls nothing"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{id :id} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                           {:name "Fresh" :databases [(ws-db-payload)]})
            called   (atom [])]
        (with-redefs [provisioning/run-async!                   (fn [f] (f))
                      provisioning/unprovision-workspace-database!
                      (fn [wsd-id] (swap! called conj wsd-id) nil)]
          (let [resp (mt/user-http-request :crowberto :post 200 (str "ee/workspace/" id "/unprovision") {})]
            (is (= {:workspace_id id :triggered 0} resp))
            (is (empty? @called))))))))

(deftest post-unprovision-requires-superuser-test
  (testing "Non-superusers get 403 from POST /:id/unprovision"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Guarded" :databases [(ws-db-payload)]})]
        (mt/user-http-request :rasta :post 403 (str "ee/workspace/" id "/unprovision") {})))))

(deftest post-unprovision-404-on-unknown-workspace-test
  (testing "POST /ee/workspace/:id/unprovision with an unknown id returns 404"
    (mt/user-http-request :crowberto :post 404 (str "ee/workspace/" Integer/MAX_VALUE "/unprovision") {})))

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
  (testing "DELETE /ee/workspace/:id returns 409 when any child is :provisioned"
    (mt/with-temp [:model/Workspace {id :id} {:name "Live"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     id
                    :database_id      (mt/id)
                    :database_details {:user "u"}
                    :output_schema    "done"
                    :input_schemas    ["public"]
                    :status           :provisioned}]
      (mt/user-http-request :crowberto :delete 409 (str "ee/workspace/" id))
      (is (t2/exists? :model/Workspace :id id)))))

(deftest delete-workspace-requires-superuser-test
  (testing "Non-superusers get 403 from DELETE /:id"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Guarded" :databases [(ws-db-payload)]})]
        (mt/user-http-request :rasta :delete 403 (str "ee/workspace/" id))))))

(deftest delete-workspace-404-on-unknown-test
  (testing "DELETE /:id with an unknown id returns 404"
    (mt/user-http-request :crowberto :delete 404 (str "ee/workspace/" Integer/MAX_VALUE))))

(deftest post-workspace-records-creator-test
  (testing "POST records the authenticated user as :creator_id and returns a hydrated :creator"
    (mt/with-model-cleanup [:model/Workspace]
      (let [resp (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                       {:name "Created By Me" :databases [(ws-db-payload)]})]
        (testing "response includes :creator as a user object"
          (is (=? {:creator {:id    (mt/user->id :crowberto)
                             :email (:email (mt/fetch-user :crowberto))}}
                  resp)))
        (testing "response does not leak the raw :creator_id column"
          (is (not (contains? resp :creator_id))))
        (testing "the row stores the current user id in creator_id"
          (is (= (mt/user->id :crowberto)
                 (t2/select-one-fn :creator_id :model/Workspace :id (:id resp)))))))))

(deftest deleting-creator-user-nulls-out-workspace-creator-test
  (testing "FK onDelete SET NULL: deleting the creator user leaves the workspace with nil :creator_id and :creator"
    (mt/with-model-cleanup [:model/Workspace]
      (mt/with-temp [:model/User {tmp-user-id :id} {:first_name "Temp" :email "temp@example.com"}
                     :model/Workspace {ws-id :id} {:name "Orphaned" :creator_id tmp-user-id}]
        (is (= tmp-user-id (t2/select-one-fn :creator_id :model/Workspace :id ws-id)))
        (t2/delete! :model/User :id tmp-user-id)
        (testing "workspace survives"
          (is (t2/exists? :model/Workspace :id ws-id)))
        (testing "creator_id is now nil"
          (is (nil? (t2/select-one-fn :creator_id :model/Workspace :id ws-id))))
        (testing "API response has :creator nil"
          (let [resp (mt/user-http-request :crowberto :get 200 (str "ee/workspace/" ws-id))]
            (is (contains? resp :creator))
            (is (nil? (:creator resp)))))))))

(deftest get-workspace-config-happy-path-json-test
  (testing "GET /ee/workspace/:id/config/json returns the full config.yml-shaped structure"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name    "Analytics Data Warehouse"
                    :engine  :postgres
                    :details {:host "mbdata.metabase.com" :port 5432 :user "admin" :dbname "stitchdata_incoming"}}
                   :model/Workspace {id :id} {:name "github"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     id
                    :database_id      db-id
                    :database_details {:user "mb_isolation_github" :password "secret"}
                    :output_schema    "mb_isolation_github"
                    :input_schemas    ["raw_github"]
                    :status           :provisioned}]
      (let [resp (mt/user-http-request :crowberto :get 200 (str "ee/workspace/" id "/config/json"))]
        (is (=? {:version 1
                 :config  {:databases [{:name    "Analytics Data Warehouse"
                                        :engine  "postgres"
                                        :details {:host                    "mbdata.metabase.com"
                                                  :port                    5432
                                                  :user                    "mb_isolation_github"
                                                  :password                "secret"
                                                  :dbname                  "stitchdata_incoming"
                                                  :schema-filters-type     "inclusion"
                                                  :schema-filters-patterns "raw_github"}}]
                           :users     [{:first_name   "Workspace"
                                        :last_name    "Admin"
                                        :email        "workspace@workspace.local"
                                        :password     "password1"
                                        :is_superuser true}]
                           :api-keys  [{:name    "Workspace API Key"
                                        :key     #(and (string? %) (re-matches #"mb_[A-Za-z0-9+/=]{8,251}" %))
                                        :group   "admin"
                                        :creator "workspace@workspace.local"}]
                           :workspace {:name      "github"
                                       :databases {(keyword "Analytics Data Warehouse")
                                                   {:input_schemas ["raw_github"]
                                                    :output_schema "mb_isolation_github"}}}}}
                resp))))))

(deftest get-workspace-config-yaml-test
  (testing "GET /ee/workspace/:id/config/yaml returns the same config as a YAML text body"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name    "dw"
                    :engine  :postgres
                    :details {:host "h" :port 5432 :dbname "d"}}
                   :model/Workspace {id :id} {:name "myws"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     id
                    :database_id      db-id
                    :database_details {:user "u" :password "p"}
                    :output_schema    "s"
                    :input_schemas    ["raw"]
                    :status           :provisioned}]
      (let [resp (mt/user-http-request :crowberto :get 200 (str "ee/workspace/" id "/config/yaml"))]
        (is (string? resp))
        (is (re-find #"(?m)^version: 1" resp))
        (is (re-find #"(?m)^config:" resp))
        (is (re-find #"workspace@workspace\.local" resp))
        (is (re-find #"password1" resp))
        (is (re-find #"name: myws" resp))))))

(deftest get-workspace-config-409-on-non-provisioned-test
  (testing "GET /:id/config/:format returns 409 if any WorkspaceDatabase is not :provisioned"
    (mt/with-temp [:model/Workspace {id :id} {:name "Partial"}
                   :model/WorkspaceDatabase _
                   {:workspace_id id :database_id (mt/id)
                    :database_details {} :output_schema "" :input_schemas ["public"]
                    :status :unprovisioned}]
      (mt/user-http-request :crowberto :get 409 (str "ee/workspace/" id "/config/json")))))

(deftest get-workspace-config-requires-superuser-test
  (testing "Non-superusers get 403 from GET /:id/config/:format"
    (mt/with-model-cleanup [:model/Workspace]
      (let [{:keys [id]} (mt/user-http-request :crowberto :post 200 "ee/workspace"
                                               {:name "Guarded" :databases [(ws-db-payload)]})]
        (mt/user-http-request :rasta :get 403 (str "ee/workspace/" id "/config/json"))))))

(deftest get-workspace-config-404-on-unknown-test
  (testing "GET /:id/config/:format with an unknown id returns 404"
    (mt/user-http-request :crowberto :get 404 (str "ee/workspace/" Integer/MAX_VALUE "/config/json"))))

(deftest get-table-remappings-returns-rows-test
  (testing "GET /ee/workspace/remappings returns every row in the table_remapping table"
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2 :details {}}
                   :model/TableRemapping _
                   {:database_id     db-id
                    :from_schema     "raw"
                    :from_table_name "events"
                    :to_schema       "mb_iso_ws"
                    :to_table_name   "events"}
                   :model/TableRemapping _
                   {:database_id     db-id
                    :from_schema     "raw"
                    :from_table_name "users"
                    :to_schema       "mb_iso_ws"
                    :to_table_name   "users"}]
      (let [resp (mt/user-http-request :crowberto :get 200 "ee/workspace/remappings")]
        (is (sequential? resp))
        (let [ours (filter #(= db-id (:database_id %)) resp)]
          (is (= 2 (count ours)))
          (is (= #{"events" "users"}
                 (into #{} (map :from_table_name) ours)))
          (let [row (first ours)]
            (is (every? #(contains? row %)
                        [:id :database_id :from_schema :from_table_name
                         :to_schema :to_table_name :created_at
                         :from_table_id :to_table_id]))))))))

(deftest get-table-remappings-enriches-with-table-ids-test
  (testing "Each remapping row carries :from_table_id / :to_table_id — nil when no metabase_table row matches, id when it does"
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2 :details {}}
                   :model/Table {from-tid :id} {:db_id db-id :schema "raw" :name "events"}
                   :model/Table {to-tid :id}   {:db_id db-id :schema "mb_iso_ws" :name "events"}
                   :model/TableRemapping _
                   {:database_id     db-id
                    :from_schema     "raw"
                    :from_table_name "events"
                    :to_schema       "mb_iso_ws"
                    :to_table_name   "events"}
                   :model/TableRemapping _
                   {:database_id     db-id
                    :from_schema     "raw"
                    :from_table_name "unknown_from"
                    :to_schema       "mb_iso_ws"
                    :to_table_name   "unknown_to"}]
      (let [resp    (mt/user-http-request :crowberto :get 200 "ee/workspace/remappings")
            by-from (into {} (map (juxt :from_table_name identity))
                          (filter #(= db-id (:database_id %)) resp))]
        (testing "row with matching Tables gets both ids"
          (is (= from-tid (get-in by-from ["events" :from_table_id])))
          (is (= to-tid   (get-in by-from ["events" :to_table_id]))))
        (testing "row without matching Tables gets nils"
          (is (nil? (get-in by-from ["unknown_from" :from_table_id])))
          (is (nil? (get-in by-from ["unknown_from" :to_table_id]))))))))

(deftest get-table-remappings-requires-superuser-test
  (testing "Non-superusers get 403 from GET /ee/workspace/remappings"
    (mt/user-http-request :rasta :get 403 "ee/workspace/remappings")))

(deftest get-current-returns-config-test
  (testing "GET /ee/workspace/current enriches core/get-config with :remappings_count"
    (let [cfg {:name      "github"
               :databases {2 {:name          "Analytics Data Warehouse"
                              :input_schemas ["raw_github"]
                              :output_schema "mb__isolation_754bd_github"}}}]
      (with-redefs [ws-core/get-config (constantly cfg)
                    t2/count            (fn [& _args] 7)]
        (is (= (assoc cfg :remappings_count 7)
               (mt/user-http-request :crowberto :get 200 "ee/workspace/current")))))))

(deftest get-current-remappings-count-no-databases-test
  (testing "GET /ee/workspace/current returns :remappings_count 0 when the config has no databases"
    (with-redefs [ws-core/get-config (constantly {:name "empty" :databases {}})]
      (is (= {:name "empty" :databases {} :remappings_count 0}
             (mt/user-http-request :crowberto :get 200 "ee/workspace/current"))))))

(deftest get-current-returns-nil-when-no-config-test
  (testing "GET /ee/workspace/current returns 204 (empty body) when no workspace is active"
    (with-redefs [ws-core/get-config (constantly nil)]
      (is (nil? (mt/user-http-request :crowberto :get 204 "ee/workspace/current"))))))

(deftest get-current-requires-superuser-test
  (testing "Non-superusers get 403 from GET /ee/workspace/current"
    (mt/user-http-request :rasta :get 403 "ee/workspace/current")))
