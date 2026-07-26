(ns metabase-enterprise.remote-sync.eid-translation-util-worktree-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.api.common :as api]
   [metabase.eid-translation.util :as eid-translation.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]))

(use-fixtures :once (fixtures/initialize :db))

(deftest entity-id-worktree-scoped-collision-test
  (testing "entity_id resolution is scoped by the current worktree, since a worktree pull can create a row with
           the same entity_id as its counterpart in the main app or another worktree"
    (mt/with-temp [:model/RemoteSyncWorktree wt {:branch (str (random-uuid))}]
      (let [shared-eid (u/generate-nano-id)]
        (mt/with-temp [:model/Card main-card {:entity_id shared-eid}]
          (binding [api/*current-worktree-id* (:id wt)]
            (mt/with-temp [:model/Card wt-card {:entity_id shared-eid}]
              (testing "main scope resolves to the main app's card"
                (binding [api/*current-worktree-id* nil]
                  (is (= (:id main-card) (eid-translation.util/->id :card shared-eid)))))
              (testing "worktree scope resolves to the worktree's own card"
                (is (= (:id wt-card) (eid-translation.util/->id :card shared-eid))))
              (testing "batched lookup is scoped the same way"
                (is (= {shared-eid {:id (:id wt-card) :type :card :status :ok}}
                       (eid-translation.util/model->entity-ids->ids {:card [shared-eid]})))
                (binding [api/*current-worktree-id* nil]
                  (is (= {shared-eid {:id (:id main-card) :type :card :status :ok}}
                         (eid-translation.util/model->entity-ids->ids {:card [shared-eid]}))))))))))))
