(ns metabase-enterprise.workspaces.request-workspace-engine-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.request-workspace :as ws.request-workspace]))

(deftest engine-problem-test
  (testing "a JDBC engine connects through a pool that puts the workspace's login over the Database's details"
    (is (nil? (ws.request-workspace/engine-problem {:name "pg" :engine :postgres}))))
  (testing "another engine is refused: nothing checks that its connections take the workspace's login"
    (is (re-find #"uses engine not-a-jdbc-engine"
                 (ws.request-workspace/engine-problem {:name "x" :engine :not-a-jdbc-engine})))))
