(ns metabase-enterprise.remote-sync.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.core :as core]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

;; bulk-set-remote-sync tests

(deftest bulk-set-remote-sync-enables-single-collection-test
  (testing "bulk-set-remote-sync enables remote sync on a single collection"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (core/bulk-set-remote-sync {coll-id true})
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll-id)))))))

(deftest bulk-set-remote-sync-disables-single-collection-test
  (testing "bulk-set-remote-sync disables remote sync on a single collection"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced true}]
      (core/bulk-set-remote-sync {coll-id false})
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll-id)))))))

(deftest bulk-set-remote-sync-enables-multiple-collections-test
  (testing "bulk-set-remote-sync enables remote sync on multiple collections"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced false}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced false}]
      (core/bulk-set-remote-sync {coll1-id true coll2-id true})
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll1-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll2-id)))))))

(deftest bulk-set-remote-sync-mixed-operations-test
  (testing "bulk-set-remote-sync handles mixed enable/disable operations"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced false}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced true}]
      (core/bulk-set-remote-sync {coll1-id true coll2-id false})
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll1-id))))
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll2-id)))))))

(deftest bulk-set-remote-sync-cascades-to-descendants-test
  (testing "bulk-set-remote-sync cascades remote sync to descendant collections when enabling"
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced false}
                   :model/Collection {child-id :id} {:name "Child" :location (format "/%d/" parent-id) :is_remote_synced false}
                   :model/Collection {grandchild-id :id} {:name "Grandchild" :location (format "/%d/%d/" parent-id child-id) :is_remote_synced false}]
      (core/bulk-set-remote-sync {parent-id true})
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id child-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id grandchild-id)))))))

(deftest bulk-set-remote-sync-cascades-disable-to-descendants-test
  (testing "bulk-set-remote-sync cascades disable to descendant collections"
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced true}
                   :model/Collection {child-id :id} {:name "Child" :location (format "/%d/" parent-id) :is_remote_synced true}
                   :model/Collection {grandchild-id :id} {:name "Grandchild" :location (format "/%d/%d/" parent-id child-id) :is_remote_synced true}]
      (core/bulk-set-remote-sync {parent-id false})
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id child-id))))
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id grandchild-id)))))))

(deftest bulk-set-remote-sync-throws-on-non-remote-synced-dependencies-test
  (testing "bulk-set-remote-sync throws when enabling a collection with non-remote-synced dependencies"
    (mt/with-temp [:model/Collection {remote-synced-coll-id :id} {:name "Remote Synced" :location "/" :is_remote_synced false}
                   :model/Collection {regular-coll-id :id} {:name "Regular" :location "/" :is_remote_synced false}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id regular-coll-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id remote-synced-coll-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Uses content that is not remote synced"
           (core/bulk-set-remote-sync {remote-synced-coll-id true}))))))

(deftest bulk-set-remote-sync-throws-on-remote-synced-dependents-test
  (testing "bulk-set-remote-sync throws when disabling a collection that has remote-synced dependents"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced true}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced true}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id coll1-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id coll2-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Used by remote synced content"
           (core/bulk-set-remote-sync {coll1-id false}))))))

(deftest bulk-set-remote-sync-empty-map-no-op-test
  (testing "bulk-set-remote-sync with empty map is a no-op"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (core/bulk-set-remote-sync {})
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll-id)))))))

(deftest bulk-set-remote-sync-transaction-rollback-on-error-test
  (testing "bulk-set-remote-sync rolls back all changes on error"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced true}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced true}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id coll1-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id coll2-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      ;; Try to disable one - should fail because coll1 has dependents in coll2
      (is (thrown? clojure.lang.ExceptionInfo
                   (core/bulk-set-remote-sync {coll1-id false})))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll1-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll2-id)))))))

(deftest bulk-set-remote-sync-allows-disabling-when-no-dependents-test
  (testing "bulk-set-remote-sync allows disabling when there are no external remote-synced dependents"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced true}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced false}
                   :model/Card {source-card-id :id} {:name "Source Card"
                                                     :collection_id coll1-id
                                                     :database_id (mt/id)
                                                     :dataset_query (mt/mbql-query venues)}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id coll2-id
                                  :database_id (mt/id)
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" source-card-id)})}]
      ;; Should succeed because dependents are not in a remote-synced collection
      (core/bulk-set-remote-sync {coll1-id false})
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id coll1-id)))))))

;;; ------------------------------------------- Event Publishing Tests -------------------------------------------

(deftest bulk-set-remote-sync-publishes-event-when-enabling-test
  (testing "bulk-set-remote-sync publishes :event/collection-update when enabling remote sync"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (let [published-events (atom [])]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic event]
                                                            (swap! published-events conj [topic event])
                                                            event)]
          (core/bulk-set-remote-sync {coll-id true})
          (is (= 1 (count @published-events)))
          (is (= :event/collection-update (ffirst @published-events)))
          (is (true? (get-in (first @published-events) [1 :object :is_remote_synced])))
          (is (= coll-id (get-in (first @published-events) [1 :object :id]))))))))

(deftest bulk-set-remote-sync-publishes-event-when-disabling-test
  (testing "bulk-set-remote-sync publishes :event/collection-update when disabling remote sync"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced true}]
      (let [published-events (atom [])]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic event]
                                                            (swap! published-events conj [topic event])
                                                            event)]
          (core/bulk-set-remote-sync {coll-id false})
          (is (= 1 (count @published-events)))
          (is (= :event/collection-update (ffirst @published-events)))
          (is (false? (get-in (first @published-events) [1 :object :is_remote_synced])))
          (is (= coll-id (get-in (first @published-events) [1 :object :id]))))))))

(deftest bulk-set-remote-sync-no-event-when-already-enabled-test
  (testing "bulk-set-remote-sync does not publish event when collection is already remote-synced"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced true}]
      (let [published-events (atom [])]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic event]
                                                            (swap! published-events conj [topic event])
                                                            event)]
          (core/bulk-set-remote-sync {coll-id true})
          (is (= 0 (count @published-events))))))))

(deftest bulk-set-remote-sync-no-event-when-already-disabled-test
  (testing "bulk-set-remote-sync does not publish event when collection is already not remote-synced"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection" :location "/" :is_remote_synced false}]
      (let [published-events (atom [])]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic event]
                                                            (swap! published-events conj [topic event])
                                                            event)]
          (core/bulk-set-remote-sync {coll-id false})
          (is (= 0 (count @published-events))))))))

(deftest bulk-set-remote-sync-events-only-for-changed-collections-test
  (testing "bulk-set-remote-sync only publishes events for collections whose status actually changed"
    (mt/with-temp [:model/Collection {coll1-id :id} {:name "Collection 1" :location "/" :is_remote_synced false}
                   :model/Collection {coll2-id :id} {:name "Collection 2" :location "/" :is_remote_synced true}
                   :model/Collection {coll3-id :id} {:name "Collection 3" :location "/" :is_remote_synced true}
                   :model/Collection {coll4-id :id} {:name "Collection 4" :location "/" :is_remote_synced false}]
      (let [published-events (atom [])]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic event]
                                                            (swap! published-events conj [topic event])
                                                            event)]
          ;; coll1: false -> true (should publish)
          ;; coll2: true -> true (should NOT publish)
          ;; coll3: true -> false (should publish)
          ;; coll4: false -> false (should NOT publish)
          (core/bulk-set-remote-sync {coll1-id true coll2-id true coll3-id false coll4-id false})
          (is (= 2 (count @published-events)))
          (let [event-collection-ids (set (map #(get-in % [1 :object :id]) @published-events))]
            (is (contains? event-collection-ids coll1-id))
            (is (contains? event-collection-ids coll3-id))
            (is (not (contains? event-collection-ids coll2-id)))
            (is (not (contains? event-collection-ids coll4-id)))))))))

;;; ------------------------------------------- No-Op Optimization Tests -------------------------------------------

(deftest bulk-set-remote-sync-skips-already-enabled-collections-test
  (testing "bulk-set-remote-sync does not update collections that are already in the target state (enable)"
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced true}
                   :model/Collection {child-id :id} {:name "Child" :location (format "/%d/" parent-id) :is_remote_synced true}]
      ;; Both collections already have is_remote_synced = true
      ;; The UPDATE should affect 0 rows because of the WHERE is_remote_synced = false clause
      (core/bulk-set-remote-sync {parent-id true})
      ;; Verify collections remain unchanged (the UPDATE was a no-op)
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id child-id)))))))

(deftest bulk-set-remote-sync-skips-already-disabled-collections-test
  (testing "bulk-set-remote-sync does not update collections that are already in the target state (disable)"
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced false}
                   :model/Collection {child-id :id} {:name "Child" :location (format "/%d/" parent-id) :is_remote_synced false}]
      ;; Both collections already have is_remote_synced = false
      ;; The UPDATE should affect 0 rows because of the WHERE is_remote_synced = true clause
      (core/bulk-set-remote-sync {parent-id false})
      ;; Verify collections remain unchanged (the UPDATE was a no-op)
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id child-id)))))))

(deftest bulk-set-remote-sync-only-updates-changed-descendants-test
  (testing "bulk-set-remote-sync only updates descendants that need changing"
    ;; Create all collections with is_remote_synced=false first (valid state),
    ;; then update child2 directly to avoid before-insert validation
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced false}
                   :model/Collection {child1-id :id} {:name "Child 1" :location (format "/%d/" parent-id) :is_remote_synced false}
                   :model/Collection {child2-id :id} {:name "Child 2" :location (format "/%d/" parent-id) :is_remote_synced false}]
      ;; Set child2 to already be remote-synced directly in DB (bypasses hooks)
      (t2/query-one {:update :collection :set {:is_remote_synced true} :where [:= :id child2-id]})
      ;; Parent and Child 1 are false, Child 2 is already true
      ;; When enabling parent, only parent and child1 should be updated, child2 should be skipped
      (core/bulk-set-remote-sync {parent-id true})
      ;; All should now be true
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id child1-id))))
      (is (true? (:is_remote_synced (t2/select-one :model/Collection :id child2-id)))))))

(deftest bulk-set-remote-sync-only-updates-changed-descendants-disable-test
  (testing "bulk-set-remote-sync only updates descendants that need changing (disable)"
    ;; Create all collections with is_remote_synced=true first (valid state),
    ;; then update child2 directly to avoid before-insert validation
    (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent" :location "/" :is_remote_synced true}
                   :model/Collection {child1-id :id} {:name "Child 1" :location (format "/%d/" parent-id) :is_remote_synced true}
                   :model/Collection {child2-id :id} {:name "Child 2" :location (format "/%d/" parent-id) :is_remote_synced true}]
      ;; Set child2 to already be not remote-synced directly in DB (bypasses hooks)
      (t2/query-one {:update :collection :set {:is_remote_synced false} :where [:= :id child2-id]})
      ;; Parent and Child 1 are true, Child 2 is already false
      ;; When disabling parent, only parent and child1 should be updated, child2 should be skipped
      (core/bulk-set-remote-sync {parent-id false})
      ;; All should now be false
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id parent-id))))
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id child1-id))))
      (is (false? (:is_remote_synced (t2/select-one :model/Collection :id child2-id)))))))
