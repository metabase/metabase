(ns metabase.query-processor.request-workspace-test
  "A query of a request that works in the workspace of its worktree reads that workspace's data: it reads nothing that
  holds the rows every workspace shares, and writes the state of its worktree's own Cards."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.query-processor.middleware.persistence :as qp.persistence]
   [metabase.query-processor.test :as qp]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]
   [toucan2.core :as t2]))

(deftest card-result-metadata-is-saved-in-a-workspace-worktree-test
  (testing "a run in a worktree that works in a workspace saves the result metadata of the worktree's own Card"
    (let [query       (mt/native-query {:query "SELECT ID, NAME FROM VENUES"})
          worktree-id (t2/insert-returning-pk! :remote_sync_worktree {:branch (mt/random-name)})]
      (try
        (mdb/with-worktree-scope {:type :worktree :worktree-id worktree-id}
          (let [card-id (t2/insert-returning-pk! :model/Card {:name                   (mt/random-name)
                                                              :display                :table
                                                              :visualization_settings {}
                                                              :dataset_query          query
                                                              :creator_id             (mt/user->id :crowberto)
                                                              :database_id            (mt/id)})]
            (t2/update! :model/Card :id card-id {:result_metadata nil})
            (mt/with-dynamic-fn-redefs [workspaces/workspace-bound? (constantly true)]
              (is (= :completed
                     (:status (qp/process-query (qp/userland-query query {:card-id    card-id
                                                                          :query-hash (qp.util/query-hash {})}))))))
            (is (= ["ID" "NAME"] (map :name (t2/select-one-fn :result_metadata :model/Card :id card-id))))))
        (finally
          (t2/delete! :remote_sync_worktree :id worktree-id))))))

(deftest persisted-model-is-not-substituted-test
  (let [query {:database 1
               :stages   [{:lib/type              :mbql.stage/native
                           :native                "SELECT 1"
                           :persisted-info/native "SELECT * FROM persisted"}]}]
    (testing "the persisted table of a model is used outside a workspace that a request names"
      (is (= query (qp.persistence/substitute-persisted-query query))))
    (testing "a query in a workspace that a request names does not use the persisted table, which holds the shared rows"
      (mt/with-dynamic-fn-redefs [workspaces/workspace-bound? (constantly true)]
        (binding [api/*current-user-id* nil]
          (let [stage (-> (qp.persistence/substitute-persisted-query query) :stages first)]
            (is (not (contains? stage :persisted-info/native)))
            (is (true? (:qp/skip-persisted-cache stage)))))))))
