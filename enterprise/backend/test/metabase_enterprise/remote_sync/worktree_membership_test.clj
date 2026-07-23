(ns metabase-enterprise.remote-sync.worktree-membership-test
  "remote_sync_worktree_id is derived, never client-supplied: rows inherit it from whatever contains
   them (item -> collection, dashcard/tab -> dashboard, action -> model card), re-derive it when they
   move, and follow their collection when the collection itself moves."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- worktree-id-of [model id]
  (t2/select-one-fn :remote_sync_worktree_id model :id id))

(defn- make-worktree-collection!
  "Tag an existing collection as `worktree-id`'s checkout, bypassing the model hooks that derive the
   column (a checkout root has no parent to derive from outside a real pull)."
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
        (is (= wt (worktree-id-of :model/Action action)))
        (testing "moving an item to a main-app collection clears it, moving back restores it"
          (t2/update! :model/Card card {:collection_id main-coll})
          (is (nil? (worktree-id-of :model/Card card)))
          (t2/update! :model/Card card {:collection_id wt-coll})
          (is (= wt (worktree-id-of :model/Card card))))))
    (testing "items created in a main-app collection have no worktree"
      (mt/with-temp [:model/Card {card :id} {:collection_id main-coll}]
        (is (nil? (worktree-id-of :model/Card card)))))))

(deftest collection-move-cascades-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {wt :id}      {:branch "wt-cascade-branch"}
                 :model/Collection         {wt-root :id} {:is_remote_synced true}
                 :model/Collection         {plain :id}   {}]
    (mt/id) ; force test-db setup so with-temp Card defaults reference a real database
    (make-worktree-collection! wt-root wt)
    (mt/with-temp [:model/Collection {child :id}         {:location (format "/%d/" plain)}
                   :model/Card       {card-in-plain :id} {:collection_id plain}
                   :model/Card       {card-in-child :id} {:collection_id child}]
      (testing "moving a collection into a checkout stamps its subtree and all contents"
        (collection/move-collection! (t2/select-one :model/Collection :id plain)
                                     (format "/%d/" wt-root))
        (is (= wt (worktree-id-of :model/Collection plain)))
        (is (= wt (worktree-id-of :model/Collection child)))
        (is (= wt (worktree-id-of :model/Card card-in-plain)))
        (is (= wt (worktree-id-of :model/Card card-in-child))))
      (testing "moving it back out clears the whole subtree"
        (collection/move-collection! (t2/select-one :model/Collection :id plain) "/")
        (is (nil? (worktree-id-of :model/Collection plain)))
        (is (nil? (worktree-id-of :model/Collection child)))
        (is (nil? (worktree-id-of :model/Card card-in-plain)))
        (is (nil? (worktree-id-of :model/Card card-in-child)))))))
