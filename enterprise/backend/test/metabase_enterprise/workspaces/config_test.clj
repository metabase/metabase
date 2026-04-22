(ns metabase-enterprise.workspaces.config-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.config :as config]
   [metabase.test :as mt]))

(deftest build-workspace-config-happy-path-test
  (testing "build-workspace-config merges DB details with workspace overrides and adds schema-filters"
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
                    :status           :initialized}]
      (let [cfg (config/build-workspace-config ws-id)]
        (testing "databases entry"
          (is (= 1 (count (:databases cfg))))
          (let [db (first (:databases cfg))]
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
        (testing "workspace entry"
          (is (= "github" (-> cfg :workspace :name)))
          (is (= {"Analytics Data Warehouse"
                  {:input_schemas ["raw_github"]
                   :output_schema "mb_isolation_github"}}
                 (-> cfg :workspace :databases))))))))

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
                    :status           :initialized}]
      (let [cfg (config/build-workspace-config ws-id)]
        (is (= "schema_a,schema_b,schema_c"
               (-> cfg :databases first :details :schema-filters-patterns)))))))

(deftest build-workspace-config-rejects-uninitialized-test
  (testing "Any :uninitialized WorkspaceDatabase causes a 409"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "Mixed"}
                   :model/WorkspaceDatabase _
                   {:workspace_id ws-id :database_id (mt/id)
                    :database_details {} :output_schema "" :input_schemas ["public"]
                    :status :uninitialized}]
      (is (thrown-with-msg?
           Exception
           #"uninitialized"
           (config/build-workspace-config ws-id))))))

(deftest build-workspace-config-empty-workspace-test
  (testing "A workspace with no databases produces empty databases arrays/maps"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "Empty"}]
      (let [cfg (config/build-workspace-config ws-id)]
        (is (= "Empty" (-> cfg :workspace :name)))
        (is (= []       (:databases cfg)))
        (is (= {}       (-> cfg :workspace :databases)))))))

(deftest build-workspace-config-missing-workspace-returns-nil-test
  (testing "A missing workspace returns nil"
    (is (nil? (config/build-workspace-config Integer/MAX_VALUE)))))
