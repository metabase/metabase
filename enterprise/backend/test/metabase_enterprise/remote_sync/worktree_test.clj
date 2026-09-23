(ns metabase-enterprise.remote-sync.worktree-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase.app-db.worktree :as mdb.worktree]
   [metabase.search.test-util :as search.tu]
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

(defn- root-item-names []
  (->> (mt/user-http-request :crowberto :get 200 "collection/root/items")
       :data
       (map :name)
       set))

(deftest a-root-listing-shows-one-worktree-test
  (mt/with-temp [:model/Card _ {:name "Main app card" :collection_id nil}]
    (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "listing-" (random-uuid))})]
      (mdb.worktree/with-worktree worktree-id
        (t2/insert-returning-pk! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                    {:name "Branch card" :collection_id nil})))
      (try
        (testing "the main app lists its own content"
          (let [names (root-item-names)]
            (is (contains? names "Main app card"))
            (is (not (contains? names "Branch card")))))
        (testing "a worktree lists only what it checked out"
          (remote-sync.db/set-user-worktree! (mt/user->id :crowberto) worktree-id)
          (let [names (root-item-names)]
            (is (contains? names "Branch card"))
            (is (not (contains? names "Main app card")))))
        (finally
          (remote-sync.db/set-user-worktree! (mt/user->id :crowberto) nil)
          (remote-sync.db/delete-worktree! worktree-id))))))

(deftest a-root-listing-shows-the-worktree-own-collections-test
  (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "listing-coll-" (random-uuid))})
        user-id           (mt/user->id :crowberto)]
    (try
      (mdb.worktree/with-worktree worktree-id
        (t2/insert-returning-pk! :model/Collection {:name "Branch collection" :location "/"}))
      (testing "the main app lists its own"
        (is (not (contains? (root-item-names) "Branch collection"))))
      (testing "a worktree lists the collections it checked out"
        (remote-sync.db/set-user-worktree! user-id worktree-id)
        (is (contains? (root-item-names) "Branch collection")))
      (finally
        (remote-sync.db/set-user-worktree! user-id nil)
        (remote-sync.db/delete-worktree! worktree-id)))))

(deftest search-reads-one-worktree-test
  (search.tu/with-appdb-search-if-available-without-fallback
    (mt/with-temp [:model/Card _ {:name "Zzyzx main app card"}]
      (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "search-" (random-uuid))})
            user-id           (mt/user->id :crowberto)
            names             #(into #{} (map :name) (search.tu/search-results "Zzyzx" {:current-user-id user-id}))]
        (try
          (mdb.worktree/with-worktree worktree-id
            (t2/insert-returning-pk! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                        {:name "Zzyzx branch card"})))
          (testing "the main app finds its own content"
            (is (contains? (names) "Zzyzx main app card"))
            (is (not (contains? (names) "Zzyzx branch card"))))
          (testing "a worktree finds what it checked out"
            (remote-sync.db/set-user-worktree! user-id worktree-id)
            (is (contains? (names) "Zzyzx branch card"))
            (is (not (contains? (names) "Zzyzx main app card"))))
          (finally
            (remote-sync.db/set-user-worktree! user-id nil)
            (remote-sync.db/delete-worktree! worktree-id)))))))
