(ns metabase.app-db.workspace-test
  "The workspace that the app DB connections of a thread are in, as the `metabase.workspace_id` setting of a Postgres
  connection."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- setting
  "The `metabase.workspace_id` setting of an app DB connection that this thread gets."
  []
  (:v (t2/query-one {:select [[[:current_setting "metabase.workspace_id" true] :v]]})))

(deftest connection-setting-test
  (when (= :postgres (mdb/db-type))
    (testing "a connection of a thread in no workspace is in none"
      (is (= "0" (setting))))
    (testing "a connection of a thread in a workspace is in that workspace"
      (mdb/with-workspace-id 5
        (is (= "5" (setting)))))
    (testing "after it, a connection is in none again"
      (is (= "0" (setting))))
    (testing "a connection of a thread that reads every workspace has no setting"
      (mdb/with-workspace-id :all
        (is (contains? #{nil ""} (setting)))))))

(deftest connection-setting-in-a-transaction-test
  (when (= :postgres (mdb/db-type))
    (testing "a thread that holds a connection, as in a transaction, changes the setting of that connection"
      (t2/with-transaction [_conn]
        (is (= "0" (setting)))
        (mdb/with-workspace-id 7
          (is (= "7" (setting)))
          (mdb/with-workspace-id nil
            (is (= "0" (setting))))
          (is (= "7" (setting))))
        (is (= "0" (setting)))))))

(deftest unique-identifier-test
  (testing "caches by app DB do not cross workspaces"
    (is (not= (mdb/unique-identifier) (mdb/with-workspace-id 5 (mdb/unique-identifier))))
    (is (= (mdb/unique-identifier) (mdb/with-workspace-id nil (mdb/unique-identifier))))))

(deftest a-connection-that-cannot-tell-its-class-is-not-postgres-test
  (testing "a connection whose isWrapperFor is not there, as a stub's, is not a Postgres connection"
    (let [stub (reify java.sql.Connection)]
      (is (false? (#'metabase.app-db.workspace/postgres-connection? stub))))))
