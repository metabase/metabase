(ns metabase-enterprise.remote-sync.worktree-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fixtures/initialize :db)
  (fn [f] (mt/dataset test-data (mt/id) (f))))

(use-fixtures :each
  (fn [f]
    (mt/with-premium-features #{:remote-sync}
      (mt/with-current-user (mt/user->id :crowberto)
        (f)))))

(defn- worktree-id [model id]
  (t2/select-one-fn :worktree_id model :id id))

(deftest worktree-id-is-inherited-from-the-parent-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-a"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection {collection :id} {:worktree_id worktree}]
    (testing "content created under a worktree collection joins that worktree"
      (mt/with-temp [:model/Card {card :id} {:collection_id collection}
                     :model/Dashboard {dashboard :id} {:collection_id collection}
                     :model/DashboardCard {dashcard :id} {:dashboard_id dashboard :card_id card}
                     :model/DashboardTab {tab :id} {:dashboard_id dashboard :position 0}]
        (is (= [worktree worktree worktree worktree]
               [(worktree-id :model/Card card)
                (worktree-id :model/Dashboard dashboard)
                (worktree-id :model/DashboardCard dashcard)
                (worktree-id :model/DashboardTab tab)]))))
    (testing "the parent wins over an explicitly passed worktree_id"
      (mt/with-temp [:model/Card {card :id} {:collection_id main-collection :worktree_id worktree}]
        (is (nil? (worktree-id :model/Card card)))))
    (testing "a sub-collection joins its parent's worktree"
      (mt/with-temp [:model/Collection {child :id} {:location (format "/%d/" collection)}]
        (is (= worktree (worktree-id :model/Collection child)))))
    (testing "content created in the main app has no worktree"
      (mt/with-temp [:model/Card {card :id} {:collection_id main-collection}]
        (is (nil? (worktree-id :model/Card card)))))))

(deftest worktree-membership-is-immutable-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-b"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection {collection :id} {:worktree_id worktree}
                 :model/Card {card :id} {:collection_id collection}]
    (testing "worktree_id cannot be written directly"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"worktree_id cannot be changed"
           (t2/update! :model/Card card {:worktree_id nil}))))
    (testing "content cannot be moved out of its worktree"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Cannot move content into or out of a remote sync worktree"
           (t2/update! :model/Card card {:collection_id main-collection}))))
    (testing "content cannot be moved into a worktree"
      (mt/with-temp [:model/Card {main-card :id} {:collection_id main-collection}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Cannot move content into or out of a remote sync worktree"
             (t2/update! :model/Card main-card {:collection_id collection})))))
    (testing "a collection cannot be moved out of its worktree"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Cannot move content into or out of a remote sync worktree"
           (t2/update! :model/Collection collection {:location (format "/%d/" main-collection)}))))
    (testing "moves within the same worktree are fine"
      (mt/with-temp [:model/Collection {other :id} {:worktree_id worktree}]
        (is (pos? (t2/update! :model/Card card {:collection_id other})))))))

(deftest entity-ids-are-unique-per-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree-1 :id} {:branch "feature-c"}
                 :model/RemoteSyncWorktree {worktree-2 :id} {:branch "feature-d"}]
    (let [entity-id (u/generate-nano-id)]
      (mt/with-temp [:model/Collection {collection-1 :id} {:entity_id entity-id :worktree_id worktree-1}
                     :model/Collection {collection-2 :id} {:entity_id entity-id :worktree_id worktree-2}]
        (testing "the same entity_id can be checked out into several worktrees"
          (is (not= collection-1 collection-2)))
        (testing "the generated helper column never leaks into selected instances"
          (is (not (contains? (t2/select-one :model/Collection :id collection-1) :worktree_id_helper))))
        (testing "entity-id lookups resolve within the worktree serdes is loading"
          (is (= collection-1 (binding [serdes/*worktree-id* worktree-1]
                                (:id (serdes/lookup-by-id :model/Collection entity-id)))))
          (is (= collection-2 (binding [serdes/*worktree-id* worktree-2]
                                (:id (serdes/lookup-by-id :model/Collection entity-id)))))
          (is (nil? (serdes/lookup-by-id :model/Collection entity-id))))))))

(deftest worktree-content-is-admin-only-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-e"}
                 :model/Collection {collection-id :id} {:worktree_id worktree}
                 :model/Card {card-id :id} {:collection_id collection-id}]
    (let [collection (t2/select-one :model/Collection :id collection-id)
          card       (t2/select-one :model/Card :id card-id)]
      (testing "admins can read and write worktree content"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (mi/can-read? collection))
          (is (mi/can-write? collection))
          (is (mi/can-read? card))))
      (testing "everyone else cannot"
        (mt/with-current-user (mt/user->id :rasta)
          (is (not (mi/can-read? collection)))
          (is (not (mi/can-write? collection)))
          (is (not (mi/can-read? card))))))))

(deftest worktree-collections-are-hidden-from-listings-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-g"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection {worktree-collection :id} {:worktree_id worktree}]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [visible #(set (collection/visible-collection-ids %))]
        (testing "a worktree's collections are not visible by default, even to an admin"
          (is (contains? (visible {}) main-collection))
          (is (not (contains? (visible {}) worktree-collection))))
        (testing "they are when explicitly asked for"
          (is (contains? (visible {:include-worktrees? true}) worktree-collection)))))))

(deftest delete-worktree!-removes-its-content-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-f"}
                 :model/Collection {main-collection :id} {}
                 :model/Card {main-card :id} {:collection_id main-collection}
                 :model/Collection {collection :id} {:worktree_id worktree}
                 :model/Card {card :id} {:collection_id collection}
                 :model/Dashboard {dashboard :id} {:collection_id collection}
                 :model/DashboardCard {dashcard :id} {:dashboard_id dashboard :card_id card}]
    (impl/delete-worktree! worktree)
    (testing "the worktree, its collections, and their contents are gone"
      (is (not (t2/exists? :model/RemoteSyncWorktree :id worktree)))
      (is (not (t2/exists? :model/Collection :id collection)))
      (is (not (t2/exists? :model/Card :id card)))
      (is (not (t2/exists? :model/Dashboard :id dashboard)))
      (is (not (t2/exists? :model/DashboardCard :id dashcard))))
    (testing "main-app content is untouched"
      (is (t2/exists? :model/Card :id main-card))
      (is (t2/exists? :model/Collection :id main-collection)))))

(deftest worktree-crud-test
  (testing "GET /api/ee/remote-sync/worktree lists worktrees"
    (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-crud"}]
      (is (contains? (set (map :id (mt/user-http-request :crowberto :get 200 "ee/remote-sync/worktree")))
                     worktree))
      (is (=? {:id worktree :branch "feature-crud"}
              (mt/user-http-request :crowberto :get 200 (format "ee/remote-sync/worktree/%d" worktree))))))
  (testing "POST /api/ee/remote-sync/worktree creates one, and refuses a duplicate branch"
    (let [{worktree :id} (mt/user-http-request :crowberto :post 200 "ee/remote-sync/worktree"
                                               {:branch "feature-created"})]
      (is (= "feature-created" (t2/select-one-fn :branch :model/RemoteSyncWorktree :id worktree)))
      (is (= "A worktree for branch 'feature-created' already exists."
             (mt/user-http-request :crowberto :post 400 "ee/remote-sync/worktree" {:branch "feature-created"})))
      (testing "DELETE /api/ee/remote-sync/worktree/:id removes it"
        (mt/user-http-request :crowberto :delete 204 (format "ee/remote-sync/worktree/%d" worktree))
        (is (not (t2/exists? :model/RemoteSyncWorktree :id worktree))))))
  (testing "everything is superuser-only"
    (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-perms"}]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/remote-sync/worktree")))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 (format "ee/remote-sync/worktree/%d" worktree))))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "ee/remote-sync/worktree" {:branch "nope"})))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :delete 403 (format "ee/remote-sync/worktree/%d" worktree)))))))
