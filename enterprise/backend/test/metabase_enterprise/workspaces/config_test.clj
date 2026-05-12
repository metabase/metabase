(ns metabase-enterprise.workspaces.config-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.config :as config]
   [metabase-enterprise.workspaces.test-util :as workspaces.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest build-workspace-config-happy-path-test
  (testing "build-workspace-config returns a {:version 1 :config {...}} structure matching config.yml"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name    "Analytics Data Warehouse"
                    :engine  :postgres
                    :details {:host   "mbdata.metabase.com"
                              :port   5432
                              :user   "admin"
                              :dbname "stitchdata_incoming"}}
                   :model/Workspace {ws-id :id} {:name       "github"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "mb_isolation_github" :password "secret"}
                    :output_namespace "mb_isolation_github"
                    :input_schemas    ["raw_github"]
                    :status           :provisioned}]
      (let [cfg (config/build-workspace-config ws-id)]
        (testing "outer shape matches config.yml (version + config block)"
          (is (= 1 (:version cfg)))
          (is (= #{:databases :workspace} (set (keys (:config cfg))))))
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
        (testing "workspace entry uses flat input_schemas + driver-aware :output"
          (is (= "github" (-> cfg :config :workspace :name)))
          (is (= {"Analytics Data Warehouse"
                  {:input_schemas ["raw_github"]
                   :output        {:schema "mb_isolation_github"}}}
                 (-> cfg :config :workspace :databases))))))))

(deftest build-workspace-config-three-slot-engine-test
  (when (workspaces.tu/driver-loadable? :snowflake)
    (testing "Snowflake (3-slot, qualified-name-components=[:db :schema]) gets the :db slot populated from connection details"
      (mt/with-temp [:model/Database {db-id :id}
                     {:name    "Snowflake DW"
                      :engine  :snowflake
                      :details {:db "ANALYTICS" :user "u" :password "p"}}
                     :model/Workspace {ws-id :id} {:name       "snow"
                                                   :creator_id (mt/user->id :crowberto)}
                     :model/WorkspaceDatabase _
                     {:workspace_id     ws-id
                      :database_id      db-id
                      :database_details {}
                      :output_namespace "WS_ALICE"
                      :input_schemas    ["PUBLIC"]
                      :status           :provisioned}]
        (let [cfg (config/build-workspace-config ws-id)]
          (is (= {"Snowflake DW"
                  {:input_schemas ["PUBLIC"]
                   :output        {:db "ANALYTICS" :schema "WS_ALICE"}}}
                 (-> cfg :config :workspace :databases))))))))

(deftest build-workspace-config-joins-multiple-input-schemas-test
  (testing "Multiple input schemas are comma-joined in schema-filters-patterns"
    (mt/with-temp [:model/Database {db-id :id}
                   {:name "DW" :engine :postgres :details {:host "h" :port 5432}}
                   :model/Workspace {ws-id :id} {:name       "multi"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id     ws-id
                    :database_id      db-id
                    :database_details {:user "u" :password "p"}
                    :output_namespace "out"
                    :input_schemas    ["schema_a" "schema_b" "schema_c"]
                    :status           :provisioned}]
      (let [cfg (config/build-workspace-config ws-id)]
        (is (= "schema_a,schema_b,schema_c"
               (-> cfg :config :databases first :details :schema-filters-patterns)))))))

(deftest build-workspace-config-rejects-non-provisioned-test
  (testing "Any non-:provisioned WorkspaceDatabase causes a 409"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name       "Mixed"
                                                 :creator_id (mt/user->id :crowberto)}
                   :model/WorkspaceDatabase _
                   {:workspace_id ws-id :database_id (mt/id)
                    :database_details {} :output_namespace "" :input_schemas ["public"]
                    :status :unprovisioned}]
      (is (thrown-with-msg?
           Exception
           #"not :provisioned"
           (config/build-workspace-config ws-id))))))

(deftest build-workspace-config-empty-workspace-test
  (testing "A workspace with no databases still produces the version+config outer shape"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name       "Empty"
                                                 :creator_id (mt/user->id :crowberto)}]
      (let [cfg (config/build-workspace-config ws-id)]
        (is (= 1 (:version cfg)))
        (is (= "Empty" (-> cfg :config :workspace :name)))
        (is (= [] (-> cfg :config :databases)))
        (is (= {} (-> cfg :config :workspace :databases)))))))

(deftest build-workspace-config-missing-workspace-returns-nil-test
  (testing "A missing workspace returns nil"
    (mt/with-model-cleanup [:model/Workspace]
      (is (nil? (config/build-workspace-config Integer/MAX_VALUE))))))
