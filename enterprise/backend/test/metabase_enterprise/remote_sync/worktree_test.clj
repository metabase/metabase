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

(defn- worktree-id [collection-id]
  (t2/select-one-fn :worktree_id :model/Collection :id collection-id))

(deftest worktree-id-is-inherited-from-the-parent-collection-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-a"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection {collection :id} {:worktree_id worktree}]
    (testing "a sub-collection joins its parent's worktree"
      (mt/with-temp [:model/Collection {child :id} {:location (format "/%d/" collection)}]
        (is (= worktree (worktree-id child)))))
    (testing "the parent wins over an explicitly passed worktree_id"
      (mt/with-temp [:model/Collection {child :id} {:location    (format "/%d/" main-collection)
                                                    :worktree_id worktree}]
        (is (nil? (worktree-id child)))))
    (testing "a collection created in the main app has no worktree"
      (mt/with-temp [:model/Collection {child :id} {}]
        (is (nil? (worktree-id child)))))))

(deftest worktree-membership-is-immutable-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-b"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection {collection :id} {:worktree_id worktree}]
    (testing "worktree_id cannot be written directly"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"worktree_id cannot be changed"
           (t2/update! :model/Collection collection {:worktree_id nil}))))
    (testing "a collection cannot be moved out of its worktree"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Cannot move content into or out of a remote sync worktree"
           (t2/update! :model/Collection collection {:location (format "/%d/" main-collection)}))))
    (testing "a main-app collection cannot be moved into one"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Cannot move content into or out of a remote sync worktree"
           (t2/update! :model/Collection main-collection {:location (format "/%d/" collection)}))))))

(deftest entity-ids-are-remapped-per-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree-1 :id} {:branch "feature-c"}
                 :model/RemoteSyncWorktree {worktree-2 :id} {:branch "feature-d"}
                 :model/Collection {main-collection :id} {}]
    (let [source (t2/select-one-fn :entity_id :model/Collection :id main-collection)
          pull!  (fn [worktree name]
                   (binding [mi/*deserializing?*  true
                             serdes/*worktree-id* worktree]
                     (:id (serdes/load-insert! "Collection" {:name      name
                                                             :location  "/"
                                                             :entity_id source}))))]
      (mt/with-model-cleanup [:model/Collection]
        (let [checkout-1 (pull! worktree-1 "Checked out once")
              checkout-2 (pull! worktree-2 "Checked out twice")]
          (testing "each worktree checks the branch entity out into a row of its own, in that worktree"
            (is (not= checkout-1 checkout-2))
            (is (= [worktree-1 worktree-2] [(worktree-id checkout-1) (worktree-id checkout-2)])))
          (testing "with a fresh entity_id, so the main app's row keeps the one the branch knows"
            (is (= source (t2/select-one-fn :entity_id :model/Collection :id main-collection)))
            (is (not (contains? #{source} (t2/select-one-fn :entity_id :model/Collection :id checkout-1))))
            (is (not (contains? #{source} (t2/select-one-fn :entity_id :model/Collection :id checkout-2)))))
          (testing "a lookup resolves to the copy belonging to the worktree being loaded"
            (is (= checkout-1 (binding [serdes/*worktree-id* worktree-1]
                                (:id (serdes/lookup-by-id :model/Collection source)))))
            (is (= checkout-2 (binding [serdes/*worktree-id* worktree-2]
                                (:id (serdes/lookup-by-id :model/Collection source)))))
            (is (= main-collection (:id (serdes/lookup-by-id :model/Collection source)))))
          (testing "and an export writes the branch's id back, not the worktree's own"
            (is (= source (binding [serdes/*worktree-id* worktree-1]
                            (:entity_id (serdes/extract-one "Collection" {}
                                                            (t2/select-one :model/Collection :id checkout-1))))))))))))

(deftest worktree-content-created-locally-gets-a-branch-id-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-l"}
                 :model/Collection {collection :id} {:worktree_id worktree}]
    (let [local (t2/select-one-fn :entity_id :model/Collection :id collection)
          entry #(t2/select-one :model/RemoteSyncWorktreeRemapping :worktree_id worktree :target_entity_id local)]
      (testing "a collection made inside the worktree starts with no remapping"
        (is (nil? (entry))))
      (binding [serdes/*worktree-id* worktree]
        (let [exported (:entity_id (serdes/extract-one "Collection" {}
                                                       (t2/select-one :model/Collection :id collection)))]
          (testing "exporting it mints an id for the branch rather than pushing the local one"
            (is (not= local exported))
            (is (=? {:source_entity_id exported} (entry))))
          (testing "and the id is stable across exports"
            (is (= exported (:entity_id (serdes/extract-one "Collection" {}
                                                            (t2/select-one :model/Collection :id collection)))))))))))

(deftest worktree-collections-are-admin-only-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-e"}
                 :model/Collection {collection-id :id} {:worktree_id worktree}]
    (let [collection (t2/select-one :model/Collection :id collection-id)]
      (testing "admins can read and write a worktree's collections"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (mi/can-read? collection))
          (is (mi/can-write? collection))))
      (testing "everyone else cannot"
        (mt/with-current-user (mt/user->id :rasta)
          (is (not (mi/can-read? collection)))
          (is (not (mi/can-write? collection))))))))

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

(deftest serdes-extraction-is-scoped-to-the-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-j"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection {worktree-collection :id} {:worktree_id worktree}
                 :model/Card {main-card :id} {:collection_id main-collection}
                 :model/Card {worktree-card :id} {:collection_id worktree-collection}]
    (let [extract (fn [model ids]
                    (into #{} (map :id) (serdes/extract-query model {:where [:in :id ids]})))
          collections #(extract "Collection" [main-collection worktree-collection])
          cards       #(extract "Card" [main-card worktree-card])]
      (testing "the plain serdes API exports main-app content only"
        (is (= #{main-collection} (collections)))
        (is (= #{main-card} (cards))))
      (testing "a worktree push exports that worktree's content only"
        (binding [serdes/*worktree-id* worktree]
          (is (= #{worktree-collection} (collections)))
          (is (= #{worktree-card} (cards))))))))

(deftest worktree-collection-children-match-the-worktree-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-h"}
                 :model/Collection {main-collection :id} {}
                 :model/Collection parent {:worktree_id worktree}
                 :model/Collection {child :id} {:location (format "/%d/" (:id parent))}]
    (testing "the children of a worktree collection are its worktree's collections"
      (is (= #{child} (set (map :id (collection/effective-children parent))))))
    (testing "the children of a main-app collection never include worktree collections"
      (is (empty? (collection/effective-children (t2/select-one :model/Collection :id main-collection)))))))

(deftest delete-worktree!-removes-its-content-test
  (mt/with-temp [:model/RemoteSyncWorktree {worktree :id} {:branch "feature-f"}
                 :model/Collection {main-collection :id} {}
                 :model/Card {main-card :id} {:collection_id main-collection}
                 :model/Collection {collection :id} {:worktree_id worktree}
                 :model/Card {card :id} {:collection_id collection}
                 :model/Dashboard {dashboard :id} {:collection_id collection}
                 :model/DashboardCard {dashcard :id} {:dashboard_id dashboard :card_id card}]
    (t2/insert! :model/RemoteSyncWorktreeRemapping {:worktree_id      worktree
                                                    :source_entity_id (u/generate-nano-id)
                                                    :target_entity_id (u/generate-nano-id)})
    (impl/delete-worktree! worktree)
    (testing "the worktree, its collections, their contents, and its remappings are gone"
      (is (not (t2/exists? :model/RemoteSyncWorktree :id worktree)))
      (is (not (t2/exists? :model/RemoteSyncWorktreeRemapping :worktree_id worktree)))
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
