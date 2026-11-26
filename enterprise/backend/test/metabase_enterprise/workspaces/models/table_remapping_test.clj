(ns metabase-enterprise.workspaces.models.table-remapping-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.models.table-remapping :as table-remapping]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest write-function-statement-counts-do-not-grow-with-databases-test
  (mt/with-temp [:model/Database {d1 :id} {}
                 :model/Database {d2 :id} {}
                 :model/Database {d3 :id} {}
                 :model/Database {d4 :id} {}
                 :model/Database {d5 :id} {}
                 :model/Database {d6 :id} {}]
    (let [database-ids [d1 d2 d3 d4 d5 d6]
          delete!      (fn [ids]
                         (doseq [id ids]
                           (table-remapping/upsert-table-remapping! id nil {:schema "s" :table "from"} {:schema "t" :table "to"}))
                         (events.tu/statement-count! #(table-remapping/delete-table-remappings-of-databases! ids nil)))]
      (delete! (take 1 database-ids))
      (is (= (delete! (take 2 database-ids)) (delete! (take 6 database-ids)))))))

(deftest workspace-and-instance-deletes-do-not-grow-with-databases-test
  (mt/with-temp [:model/Database  {d1 :id} {}
                 :model/Database  {d2 :id} {}
                 :model/Database  {d3 :id} {}
                 :model/Database  {d4 :id} {}
                 :model/Database  {d5 :id} {}
                 :model/Database  {d6 :id} {}
                 :model/Workspace {ws :id} {:name "ws"}]
    (let [database-ids [d1 d2 d3 d4 d5 d6]
          remap!       (fn [ids workspace-id]
                         (doseq [id ids]
                           (table-remapping/upsert-table-remapping! id workspace-id {:schema "s" :table "from"}
                                                                    {:schema "t" :table "to"})))
          counted      (fn [delete! workspace-id ids]
                         (remap! ids workspace-id)
                         (events.tu/statement-count! delete!))]
      (testing "deleting a workspace's remappings"
        (counted #(table-remapping/delete-workspace-table-remappings! ws) ws (take 1 database-ids))
        (is (= (counted #(table-remapping/delete-workspace-table-remappings! ws) ws (take 2 database-ids))
               (counted #(table-remapping/delete-workspace-table-remappings! ws) ws database-ids))))
      (testing "deleting the instance's own remappings"
        (counted table-remapping/delete-instance-table-remappings! nil (take 1 database-ids))
        (is (= (counted table-remapping/delete-instance-table-remappings! nil (take 2 database-ids))
               (counted table-remapping/delete-instance-table-remappings! nil database-ids)))))))

(deftest instance-delete-keeps-workspace-remappings-test
  (mt/with-temp [:model/Database  {db :id} {}
                 :model/Workspace {ws :id} {:name "ws"}]
    (table-remapping/upsert-table-remapping! db nil {:schema "s" :table "from"} {:schema "t" :table "to"})
    (table-remapping/upsert-table-remapping! db ws {:schema "s" :table "from"} {:schema "w" :table "to"})
    (testing "an instance-level delete leaves the remappings of the workspaces that requests name"
      (table-remapping/delete-instance-table-remappings!)
      (is (= [ws] (t2/select-fn-vec :workspace_id :model/TableRemapping :database_id db))))
    (testing "a delete of a schema change on the instance's databases leaves them too"
      (table-remapping/upsert-table-remapping! db nil {:schema "s" :table "from"} {:schema "t" :table "to"})
      (table-remapping/delete-table-remappings-of-databases! [db] nil)
      (is (= [ws] (t2/select-fn-vec :workspace_id :model/TableRemapping :database_id db))))
    (testing "a workspace's delete removes its own"
      (table-remapping/delete-workspace-table-remappings! ws)
      (is (empty? (t2/select :model/TableRemapping :database_id db))))))
