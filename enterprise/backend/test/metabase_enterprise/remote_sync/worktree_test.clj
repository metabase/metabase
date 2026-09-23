(ns metabase-enterprise.remote-sync.worktree-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.app-db.worktree :as mdb.worktree]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest deleting-a-worktree-takes-what-it-checked-out-test
  (testing "deleting a worktree deletes the content it checked out, including the Trash it was created with"
    (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "delete-me-" (random-uuid))})
          [collection-id card-id]
          (mdb.worktree/with-worktree worktree-id
            (let [collection-id (t2/insert-returning-pk! :model/Collection {:name "Checked out"})]
              [collection-id
               (t2/insert-returning-pk! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                           {:collection_id collection-id}))]))]
      (remote-sync.db/delete-worktree! worktree-id)
      (mdb.worktree/without-worktree-scoping
       (is (nil? (t2/select-one :model/Worktree :id worktree-id)))
       (is (nil? (t2/select-one :model/Collection :id collection-id)))
       (is (nil? (t2/select-one :model/Card :id card-id)))
       (is (zero? (t2/count :model/Collection :worktree_id worktree-id)))))))
