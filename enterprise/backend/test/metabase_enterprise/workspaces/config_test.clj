(ns metabase-enterprise.workspaces.config-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.config :as config]
   [metabase.test :as mt]))

(deftest build-workspace-config-happy-path-test
  (testing "build-workspace-config returns a {:version 1 :config {...}} structure matching config.yml"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name    "Analytics Data Warehouse"
                    :engine  :postgres
                    :details {:host   "mbdata.metabase.com"
                              :port   5432
                              :user   "admin"
                              :dbname "stitchdata_incoming"}}
                   :model/Workspace {ws-id :id} {:name "github"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "mb_isolation_github" :password "secret"}
                    :output_schema    "mb_isolation_github"
                    :input_schemas    ["raw_github"]
                    :status           :provisioned}]
      (let [cfg (config/build-workspace-config ws-id)]
        (testing "outer shape matches config.yml (version + config block)"
          (is (= 1 (:version cfg)))
          (is (every? #(contains? (:config cfg) %) [:databases :users :workspace])))
        (testing "databases entry"
          (is (= 1 (count (-> cfg :config :databases))))
          (let [db (first (-> cfg :config :databases))]
            (is (= "Analytics Data Warehouse" (:name db)))
            (is (= :postgres (:engine db)))
            (testing "original details are preserved, workspace overrides win, schema-filters appended"
              (is (= {:host                    "mbdata.metabase.com"
                      :port                    5432
                      :user                    "mb_isolation_github"
                      :password                "secret"
                      :dbname                  "stitchdata_incoming"
                      :schema-filters-type     "inclusion"
                      :schema-filters-patterns "raw_github"}
                     (:details db))))))
        (testing "bundles a single default admin user marked as superuser"
          (is (= [{:first_name   "Workspace"
                   :last_name    "Admin"
                   :email        "workspace@workspace.local"
                   :password     "password1"
                   :is_superuser true}]
                 (-> cfg :config :users))))
        (testing "bundles an admin api-key whose creator matches the default user"
          (let [[api-key :as api-keys] (-> cfg :config :api-keys)]
            (is (= 1 (count api-keys)))
            (is (= "Workspace API Key" (:name api-key)))
            (is (= "admin" (:group api-key)))
            (is (= "workspace@workspace.local" (:creator api-key)))
            (testing "key is a well-formed mb_... string"
              (is (string? (:key api-key)))
              (is (re-matches #"mb_[A-Za-z0-9+/=]{8,251}" (:key api-key))))))
        (testing "workspace entry"
          (is (= "github" (-> cfg :config :workspace :name)))
          (is (= {"Analytics Data Warehouse"
                  {:input_schemas ["raw_github"]
                   :output_schema "mb_isolation_github"}}
                 (-> cfg :config :workspace :databases))))))))

(deftest build-workspace-config-joins-multiple-input-schemas-test
  (testing "Multiple input schemas are comma-joined in schema-filters-patterns"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name "DW" :engine :postgres :details {:host "h" :port 5432}}
                   :model/Workspace {ws-id :id} {:name "multi"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "u" :password "p"}
                    :output_schema    "out"
                    :input_schemas    ["schema_a" "schema_b" "schema_c"]
                    :status           :provisioned}]
      (let [cfg (config/build-workspace-config ws-id)]
        (is (= "schema_a,schema_b,schema_c"
               (-> cfg :config :databases first :details :schema-filters-patterns)))))))

(deftest build-workspace-config-rejects-non-provisioned-test
  (testing "Any non-:provisioned WorkspaceDatabase causes a 409"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "Mixed"}
                   :model/WorkspaceDatabase _
                   {:workspace_id ws-id :database_id (mt/id)
                    :database_details {} :output_schema "" :input_schemas ["public"]
                    :status :unprovisioned}]
      (is (thrown-with-msg?
           Exception
           #"not :provisioned"
           (config/build-workspace-config ws-id))))))

(deftest build-workspace-config-empty-workspace-test
  (testing "A workspace with no databases still produces the version+config outer shape with a default user"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "Empty"}]
      (let [cfg (config/build-workspace-config ws-id)]
        (is (= 1 (:version cfg)))
        (is (= "Empty" (-> cfg :config :workspace :name)))
        (is (= [] (-> cfg :config :databases)))
        (is (= {} (-> cfg :config :workspace :databases)))
        (is (= 1 (count (-> cfg :config :users))))))))

(deftest build-workspace-config-missing-workspace-returns-nil-test
  (testing "A missing workspace returns nil"
    (is (nil? (config/build-workspace-config Integer/MAX_VALUE)))))

(deftest build-workspace-config-includes-remote-sync-settings-test
  (testing "Remote-sync settings are copied from the source instance into :config :settings"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name "dw" :engine :postgres :details {:host "h" :port 5432}}
                   :model/Workspace {ws-id :id} {:name "synced"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "u" :password "p"}
                    :output_schema    "out"
                    :input_schemas    ["raw"]
                    :status           :provisioned}]
      (mt/with-temporary-setting-values [remote-sync-url    "https://github.com/metabase/stats-remote-sync"
                                         remote-sync-type   :read-write
                                         remote-sync-branch "main"
                                         remote-sync-token  "not-real"]
        (let [cfg (config/build-workspace-config ws-id)]
          (is (= {:remote-sync-url    "https://github.com/metabase/stats-remote-sync"
                  :remote-sync-type   :read-write
                  :remote-sync-branch "main"
                  :remote-sync-token  "not-real"}
                 (-> cfg :config :settings))))))))

(deftest build-workspace-config-omits-settings-when-url-blank-test
  (testing "Without remote-sync-url, the :settings section is omitted entirely"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name "dw" :engine :postgres :details {:host "h" :port 5432}}
                   :model/Workspace {ws-id :id} {:name "nosync"}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "u" :password "p"}
                    :output_schema    "out"
                    :input_schemas    ["raw"]
                    :status           :provisioned}]
      (mt/with-temporary-setting-values [remote-sync-url ""]
        (let [cfg (config/build-workspace-config ws-id)]
          (is (not (contains? (:config cfg) :settings))))))))
