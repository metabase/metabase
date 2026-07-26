(ns metabase.collections.models.collection-worktree-test
  "Coverage for remote-sync worktree read/write isolation in the Collection layer: `can-read?`/`can-write?`,
  `visible-collection-ids`, and the shared main-app system collections (trash, library, personal)."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :test-users :test-users-personal-collections))

(deftest worktree-collection-invisible-to-main-app-test
  (mt/with-temp [:model/RemoteSyncWorktree wt {:branch (str (random-uuid))}]
    (mt/with-test-user :crowberto
      (binding [api/*current-worktree-id* (:id wt)]
        (mt/with-temp [:model/Collection wt-coll {:name "wt coll"}]
          (testing "the worktree caller can read/write its own collection, and it's visible"
            (is (true? (mi/can-read? wt-coll)))
            (is (true? (mi/can-write? wt-coll)))
            (is (contains? (collection/visible-collection-ids {}) (:id wt-coll))))
          (testing "a main-app caller cannot read/write it, and it's not visible"
            (binding [api/*current-worktree-id* nil]
              (is (false? (mi/can-read? wt-coll)))
              (is (false? (mi/can-write? wt-coll)))
              (is (not (contains? (collection/visible-collection-ids {}) (:id wt-coll)))))))))))

(deftest main-app-collection-invisible-to-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree wt {:branch (str (random-uuid))}
                 :model/Collection main-coll {:name "main coll"}]
    (mt/with-test-user :crowberto
      (testing "the main-app caller can read/write it, and it's visible"
        (is (true? (mi/can-read? main-coll)))
        (is (true? (mi/can-write? main-coll)))
        (is (contains? (collection/visible-collection-ids {}) (:id main-coll))))
      (testing "a worktree caller cannot read/write it, and it's not visible"
        (binding [api/*current-worktree-id* (:id wt)]
          (is (false? (mi/can-read? main-coll)))
          (is (false? (mi/can-write? main-coll)))
          (is (not (contains? (collection/visible-collection-ids {}) (:id main-coll)))))))))

(deftest worktree-collection-deletion-does-not-touch-trash-test
  (testing "deleting an ordinary collection while a worktree is active does not misfire the trash-protection guard"
    (mt/with-temp [:model/RemoteSyncWorktree wt {:branch (str (random-uuid))}]
      (binding [api/*current-worktree-id* (:id wt)]
        (is (some? (mt/with-temp [:model/Collection wt-coll {:name "wt coll"}]
                     (:id wt-coll))))))))

(deftest trash-collection-is-shared-across-worktrees-test
  (mt/with-temp [:model/RemoteSyncWorktree wt {:branch (str (random-uuid))}]
    (let [main-trash-id (collection/trash-collection-id)]
      (testing "the trash collection resolves to the same shared row from within a worktree"
        (binding [api/*current-worktree-id* (:id wt)]
          (is (= main-trash-id (collection/trash-collection-id)))
          (is (nil? (:worktree_id (collection/trash-collection))))))
      (testing "and the trash collection itself has no worktree_id"
        (is (nil? (:worktree_id (collection/trash-collection))))))))

(deftest library-collection-is-shared-across-worktrees-test
  (mt/with-temp [:model/Collection library {:type collection/library-collection-type :location "/"}]
    (mt/with-temp [:model/RemoteSyncWorktree wt {:branch (str (random-uuid))}]
      (testing "the library collection resolves to the same shared row from within a worktree"
        (binding [api/*current-worktree-id* (:id wt)]
          (is (= (:id library) (:id (collection/library-collection))))
          (mt/with-test-user :crowberto
            (testing "and is readable/writable from within the worktree"
              (is (true? (mi/can-read? library)))
              (is (true? (mi/can-write? library))))))))))

(deftest personal-collection-created-under-worktree-stays-main-app-test
  (mt/with-temp [:model/RemoteSyncWorktree wt {:branch (str (random-uuid))}
                 :model/User user {}]
    (binding [api/*current-worktree-id* (:id wt)
              collection/*allow-deleting-personal-collections* true]
      (mt/with-temp [:model/Collection personal {:personal_owner_id (:id user)}]
        (testing "a personal collection created while a worktree is active is still tagged main-app (worktree_id nil)"
          (is (nil? (:worktree_id personal))))
        (testing "it resolves the same way from the worktree scope and from the main-app scope"
          (is (= (:id personal) (:id (collection/user->existing-personal-collection (:id user)))))
          (binding [api/*current-worktree-id* nil]
            (is (= (:id personal) (:id (collection/user->existing-personal-collection (:id user)))))))))))
