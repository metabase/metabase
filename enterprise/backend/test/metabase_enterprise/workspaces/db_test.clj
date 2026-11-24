(ns metabase-enterprise.workspaces.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.test :as mt]))

(deftest ^:synchronized reads-over-partitions-test
  (mt/with-temp [:model/Database          {db1 :id} {}
                 :model/Database          {db2 :id} {}
                 :model/Database          {db3 :id} {}
                 :model/Workspace         {ws1 :id} {}
                 :model/Workspace         {ws2 :id} {}
                 :model/Workspace         {ws3 :id} {}
                 :model/WorkspaceDatabase _         {:workspace_id ws3 :database_id db1}
                 :model/WorkspaceDatabase _         {:workspace_id ws1 :database_id db2 :status :provisioned}
                 :model/WorkspaceDatabase _         {:workspace_id ws2 :database_id db3 :status :provisioned}]
    (testing "the lowest id over partitions"
      (is (= (min db2 db3)
             (ws.db/database-id-with-active-workspace-databases [db3 db1 db2])
             (mt/with-partition-size 2 (ws.db/database-id-with-active-workspace-databases [db3 db1 db2])))))
    (testing "rows ordered by id over partitions"
      (is (= (mapv :id (ws.db/workspace-databases-of-workspaces [ws3 ws1 ws2]))
             (mapv :id (mt/with-partition-size 2 (ws.db/workspace-databases-of-workspaces [ws3 ws1 ws2]))))))
    (testing "a map from partitions"
      (is (= #{db1 db2 db3}
             (set (keys (mt/with-partition-size 2 (ws.db/database-id->database [db1 db2 db3])))))))))
