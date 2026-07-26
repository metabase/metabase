(ns metabase-enterprise.remote-sync.hooks-verification-test
  "Cross-model regression coverage for the worktree_id stamp/immutable/parent-worktree hooks wired into
  content models' before-insert/before-update (see metabase.remote-sync.core)."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest stamp-on-insert-test
  (mt/with-temp [:model/RemoteSyncWorktree wt {:branch (str (random-uuid))}]
    (binding [api/*current-worktree-id* (:id wt)]
      (mt/with-temp [:model/Collection coll {:name "wt coll"}]
        (is (= (:id wt) (:worktree_id coll))))
      (mt/with-temp [:model/Collection parent {:name "wt parent"}
                     :model/Collection transforms-parent {:name "wt transforms parent" :namespace "transforms"}
                     :model/Card card {:collection_id (:id parent) :name "wt card"}
                     :model/Dashboard dash {:collection_id (:id parent) :name "wt dash"}
                     :model/DashboardCard dc {:dashboard_id (:id dash) :card_id (:id card)}
                     :model/Transform transform {:name "wt transform" :collection_id (:id transforms-parent)
                                                 :source {:type :query :query {}}}]
        (is (= (:id wt) (:worktree_id card)))
        (is (= (:id wt) (:worktree_id dash)))
        (is (= (:id wt) (:worktree_id dc)))
        (is (= (:id wt) (:worktree_id transform)))
        (mt/with-temp [:model/ParameterCard pc {:card_id (:id card)
                                                :parameterized_object_type "card"
                                                :parameterized_object_id (:id card)
                                                :parameter_id "abc"}]
          (is (= (:id wt) (:worktree_id pc)))))
      (mt/with-temp [:model/Segment segment {:table_id (mt/id :venues) :name "wt segment"}]
        (is (= (:id wt) (:worktree_id segment))))))
  (testing "no active worktree -> nil"
    (mt/with-temp [:model/Collection coll {:name "no wt"}]
      (is (nil? (:worktree_id coll))))))

(deftest immutable-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree wt {:branch (str (random-uuid))}]
    (binding [api/*current-worktree-id* (:id wt)]
      (mt/with-temp [:model/Collection coll {:name "wt coll"}
                     :model/Card card {:collection_id (:id coll) :name "wt card"}
                     :model/Segment segment {:table_id (mt/id :venues) :name "wt segment"}]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"worktree_id cannot be changed"
                              (t2/update! :model/Collection (:id coll) {:worktree_id nil})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"worktree_id cannot be changed"
                              (t2/update! :model/Card (:id card) {:worktree_id nil})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"worktree_id cannot be changed"
                              (t2/update! :model/Segment (:id segment) {:worktree_id nil})))))))

(deftest parent-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree wt {:branch (str (random-uuid))}
                 :model/Collection main-coll {:name "main coll"}]
    (binding [api/*current-worktree-id* (:id wt)]
      (mt/with-temp [:model/Collection wt-coll-a {:name "wt coll a"}
                     :model/Collection wt-coll-b {:name "wt coll b"}
                     :model/Card card {:collection_id (:id wt-coll-a) :name "wt card"}]
        (testing "moving within the same worktree is allowed"
          (t2/update! :model/Card (:id card) {:collection_id (:id wt-coll-b)})
          (is (= (:id wt-coll-b) (t2/select-one-fn :collection_id :model/Card :id (:id card)))))
        (testing "moving across worktree boundary is blocked"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot move content"
                                (t2/update! :model/Card (:id card) {:collection_id (:id main-coll)}))))
        (testing "Collection location-based parent check: moving into a different-worktree parent is blocked"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot move content"
                                (t2/update! :model/Collection (:id wt-coll-a) {:location (str "/" (:id main-coll) "/")}))))
        (testing "Collection location-based parent check: moving within the same worktree is allowed"
          (t2/update! :model/Collection (:id wt-coll-a) {:location (str "/" (:id wt-coll-b) "/")})
          (is (= (str "/" (:id wt-coll-b) "/") (t2/select-one-fn :location :model/Collection :id (:id wt-coll-a)))))))))
