(ns metabase-enterprise.remote-sync.worktree-membership-test
  "remote_sync_worktree_id is derived at insert, never client-supplied, and immutable afterwards: rows
   inherit it from whatever contains them (item -> collection, dashcard/tab -> dashboard, action ->
   model card, collection -> parent collection), and moves that would change it are refused —
   worktree content changes only through pulls."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- worktree-id-of [model id]
  (t2/select-one-fn :remote_sync_worktree_id model :id id))

(defn- make-worktree-collection!
  "Tag an existing collection as one of `worktree-id`'s worktree collections, bypassing the model hooks
   that derive the column (a worktree root has no parent to derive from outside a real pull)."
  [collection-id worktree-id]
  (t2/query {:update (t2/table-name :model/Collection)
             :set    {:remote_sync_worktree_id worktree-id}
             :where  [:= :id collection-id]}))

(deftest items-inherit-collection-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {wt :id}        {:branch "wt-membership-branch"}
                 :model/Collection         {main-coll :id} {:is_remote_synced true}
                 :model/Collection         {wt-coll :id}   {:is_remote_synced true}]
    (mt/id) ; force test-db setup so with-temp Card defaults reference a real database
    (make-worktree-collection! wt-coll wt)
    (testing "items created in a worktree collection inherit its worktree"
      (mt/with-temp [:model/Card          {card :id}     {:collection_id wt-coll :type :model}
                     :model/Dashboard     {dash :id}     {:collection_id wt-coll}
                     :model/DashboardCard {dashcard :id} {:dashboard_id dash :card_id card}
                     :model/DashboardTab  {tab :id}      {:dashboard_id dash}
                     :model/Action        {action :id}   {:name "wt action" :model_id card :type :query}]
        (is (= wt (worktree-id-of :model/Card card)))
        (is (= wt (worktree-id-of :model/Dashboard dash)))
        (is (= wt (worktree-id-of :model/DashboardCard dashcard)))
        (is (= wt (worktree-id-of :model/DashboardTab tab)))
        (is (= wt (worktree-id-of :model/Action action)))))
    (testing "items created in a main-app collection have no worktree"
      (mt/with-temp [:model/Card {card :id} {:collection_id main-coll}]
        (is (nil? (worktree-id-of :model/Card card)))))
    (testing "collections created inside a worktree collection inherit its worktree"
      (mt/with-temp [:model/Collection {sub :id} {:location          (format "/%d/" wt-coll)
                                                  :is_remote_synced true}]
        (is (= wt (worktree-id-of :model/Collection sub)))
        (testing "and so do their items"
          (mt/with-temp [:model/Card {card :id} {:collection_id sub}]
            (is (= wt (worktree-id-of :model/Card card)))))))))

(deftest items-cannot-change-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {wt :id}          {:branch "wt-item-move-branch"}
                 :model/Collection         {main-coll :id}   {:is_remote_synced true}
                 :model/Collection         {wt-coll :id}     {:is_remote_synced true}
                 :model/Collection         {wt-sibling :id}  {:is_remote_synced true}]
    (mt/id)
    (make-worktree-collection! wt-coll wt)
    (make-worktree-collection! wt-sibling wt)
    (mt/with-temp [:model/Card {wt-card :id}   {:collection_id wt-coll}
                   :model/Card {main-card :id} {:collection_id main-coll}]
      (testing "moving an item out of a worktree is refused"
        (is (thrown-with-msg? Exception #"Cannot move content into or out of a remote sync worktree"
                              (t2/update! :model/Card wt-card {:collection_id main-coll})))
        (is (= wt (worktree-id-of :model/Card wt-card))))
      (testing "moving an item into a worktree is refused"
        (is (thrown-with-msg? Exception #"Cannot move content into or out of a remote sync worktree"
                              (t2/update! :model/Card main-card {:collection_id wt-coll})))
        (is (nil? (worktree-id-of :model/Card main-card))))
      (testing "moving an item within the same worktree is fine"
        (t2/update! :model/Card wt-card {:collection_id wt-sibling})
        (is (= wt (worktree-id-of :model/Card wt-card)))))))

(deftest collections-cannot-change-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {wt :id}      {:branch "wt-coll-move-branch"}
                 :model/Collection         {wt-root :id} {:is_remote_synced true}
                 :model/Collection         {plain :id}   {}]
    (mt/id)
    (make-worktree-collection! wt-root wt)
    (testing "moving a collection into a worktree is refused"
      (is (thrown-with-msg? Exception #"Cannot move a collection into or out of a remote sync worktree"
                            (t2/update! :model/Collection plain {:location (format "/%d/" wt-root)})))
      (is (nil? (worktree-id-of :model/Collection plain))))
    (testing "moving a worktree collection out is refused"
      (mt/with-temp [:model/Collection {wt-sub :id} {:location          (format "/%d/" wt-root)
                                                     :is_remote_synced true}]
        (is (= wt (worktree-id-of :model/Collection wt-sub)))
        (is (thrown-with-msg? Exception #"Cannot move a collection into or out of a remote sync worktree"
                              (t2/update! :model/Collection wt-sub {:location "/"})))
        (is (= wt (worktree-id-of :model/Collection wt-sub)))))))
