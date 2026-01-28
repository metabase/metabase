(ns metabase-enterprise.workspaces.util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase-enterprise.workspaces.util :as ws.u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ignore-constraint-violation-test
  (testing "ignore-constraint-violation catches duplicate key violations"
    (let [ws (ws.tu/create-empty-ws! "Test Workspace")]
      (testing "first insert succeeds and returns the inserted row"
        (let [result (ws.u/ignore-constraint-violation
                      (t2/insert-returning-instance! :model/WorkspaceGraph
                                                     {:workspace_id  (:id ws)
                                                      :graph_version 1
                                                      :graph         {:marker "first"}}))]
          (is (= 1 (:graph_version result)))))

      (testing "duplicate insert is silently ignored (returns nil)"
        (let [result (ws.u/ignore-constraint-violation
                      (t2/insert-returning-instance! :model/WorkspaceGraph
                                                     {:workspace_id  (:id ws)
                                                      :graph_version 1
                                                      :graph         {:marker "second"}}))]
          (is (nil? result))))

      (testing "only one row exists in the database"
        (is (= #{"first"} (t2/select-fn-set (comp :marker :graph) [:model/WorkspaceGraph :graph] :workspace_id (:id ws)))))

      (testing "we can insert a non-conflicting row"
        (let [result (ws.u/ignore-constraint-violation
                      (t2/insert-returning-instance! :model/WorkspaceGraph
                                                     {:workspace_id  (:id ws)
                                                      :graph_version 2
                                                      :graph         {:marker "third"}}))]
          (is (some? result))
          (is (= #{"first" "third"} (t2/select-fn-set (comp :marker :graph) [:model/WorkspaceGraph :graph] :workspace_id (:id ws)))))))))

(deftest ignore-constraint-violation-rethrows-other-exceptions-test
  (testing "ignore-constraint-violation rethrows non-constraint exceptions"
    (is (thrown-with-msg? Exception
                          #"Test exception"
                          (ws.u/ignore-constraint-violation
                           (throw (Exception. "Test exception")))))))
