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

(defn- worktree-header
  "Request options that work a request inside the worktree `worktree-id` names."
  [worktree-id]
  {:request-options {:headers {"x-metabase-worktree-id" (str worktree-id)}}})

(defn- root-item-names
  "The names in the root collection listing: the main app's, or the worktree `worktree-id`'s when it is non-nil."
  [worktree-id]
  (->> (if worktree-id
         (mt/user-http-request :crowberto :get 200 "collection/root/items" (worktree-header worktree-id))
         (mt/user-http-request :crowberto :get 200 "collection/root/items"))
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
          (let [names (root-item-names nil)]
            (is (contains? names "Main app card"))
            (is (not (contains? names "Branch card")))))
        (testing "a worktree lists only what it checked out"
          (let [names (root-item-names worktree-id)]
            (is (contains? names "Branch card"))
            (is (not (contains? names "Main app card")))))
        (finally
          (remote-sync.db/delete-worktree! worktree-id))))))

(deftest a-root-listing-shows-the-worktree-own-collections-test
  (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "listing-coll-" (random-uuid))})]
    (try
      (mdb.worktree/with-worktree worktree-id
        (t2/insert-returning-pk! :model/Collection {:name "Branch collection" :location "/"}))
      (testing "the main app lists its own"
        (is (not (contains? (root-item-names nil) "Branch collection"))))
      (testing "a worktree lists the collections it checked out"
        (is (contains? (root-item-names worktree-id) "Branch collection")))
      (finally
        (remote-sync.db/delete-worktree! worktree-id)))))

(deftest worktree-header-refusals-test
  (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "header-" (random-uuid))})]
    (try
      (testing "a header that is not a positive integer is a 400"
        (doseq [bad ["abc" "0" "-1" "1.5" ""]]
          (mt/user-http-request :crowberto :get 400 "collection/root/items"
                                {:request-options {:headers {"x-metabase-worktree-id" bad}}})))
      (testing "a non-superuser may not enter a worktree"
        (mt/user-http-request :rasta :get 403 "collection/root/items" (worktree-header worktree-id)))
      (testing "a header naming no worktree is a 404"
        (mt/user-http-request :crowberto :get 404 "collection/root/items" (worktree-header Integer/MAX_VALUE)))
      (finally
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
            (mdb.worktree/with-worktree worktree-id
              (is (contains? (names) "Zzyzx branch card"))
              (is (not (contains? (names) "Zzyzx main app card")))))
          (finally
            (remote-sync.db/delete-worktree! worktree-id)))))))

(deftest a-bookmark-stays-in-its-worktree-test
  (mt/with-temp [:model/Card main-card {:name "Main app bookmarked card" :collection_id nil}]
    (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "bookmark-" (random-uuid))})
          bookmark-names    #(->> (apply mt/user-http-request :crowberto :get 200 "bookmark" %&)
                                  (map :name)
                                  set)]
      (try
        (let [branch-card-id (mdb.worktree/with-worktree worktree-id
                               (t2/insert-returning-pk! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                                           {:name "Branch bookmarked card"
                                                                            :collection_id nil})))]
          (mt/user-http-request :crowberto :post 200 (str "bookmark/card/" (:id main-card)))
          (mt/user-http-request :crowberto :post 200 (str "bookmark/card/" branch-card-id) (worktree-header worktree-id))
          (testing "the main app lists only its own bookmarks"
            (is (= #{"Main app bookmarked card"} (bookmark-names))))
          (testing "a worktree lists only its own bookmarks"
            (is (= #{"Branch bookmarked card"} (bookmark-names (worktree-header worktree-id))))))
        (finally
          (t2/delete! :model/CardBookmark :user_id (mt/user->id :crowberto))
          (remote-sync.db/delete-worktree! worktree-id))))))

(deftest a-job-run-from-a-worktree-is-refused-test
  (mt/with-premium-features #{:transforms-basic}
    (mt/with-temp [:model/TransformJob job {:name "Main app job" :schedule "0 0 0 * * ?"}]
      (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "job-run-" (random-uuid))})]
        (try
          (testing "running a job from a worktree answers with a 400 rather than never answering"
            (is (= "A transform job runs the main app's transforms, never a worktree's"
                   (:message (deref (future (mt/user-http-request :crowberto :post 400 (str "transform-job/" (:id job) "/run")
                                                                  (worktree-header worktree-id)))
                                    10000 {:message ::timed-out})))))
          (finally
            (remote-sync.db/delete-worktree! worktree-id)))))))

(deftest a-worktree-leaves-transform-jobs-alone-test
  (testing "transform jobs live only in the main app: a worktree reads them but changes none"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/TransformJob {job-id :id} {:name "Main job" :schedule "0 0 0 * * ?"}]
        (let [{worktree-id :id} (remote-sync.db/insert-worktree! {:branch (str "jobs-" (random-uuid))})
              header            (worktree-header worktree-id)
              url               (str "transform-job/" job-id)]
          (try
            (is (false? (:can_execute (mt/user-http-request :crowberto :get 200 url header))))
            (mt/user-http-request :crowberto :post 403 "transform-job" header {:name "Branch job" :schedule "0 0 0 * * ?"})
            (mt/user-http-request :crowberto :put 403 url header {:name "Renamed" :schedule "0 0 1 * * ?"})
            (mt/user-http-request :crowberto :put 400 "transform-job/active" header {:active false})
            (mt/user-http-request :crowberto :delete 403 url header)
            (is (= {:name "Main job" :schedule "0 0 0 * * ?" :active true}
                   (t2/select-one [:model/TransformJob :name :schedule :active] :id job-id)))
            (finally
              (remote-sync.db/delete-worktree! worktree-id))))))))
