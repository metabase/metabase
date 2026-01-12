(ns metabase-enterprise.remote-sync.models.remote-sync-object-test
  "Unit tests for the remote-sync-object namespace.
  Tests the public methods: dirty-global? and dirty-for-global."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as rs-object]
   [metabase-enterprise.remote-sync.test-helpers :as th]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each th/clean-remote-sync-state)

;;; ------------------------------------------------------------------------------------------------
;;; Tests for dirty-global?
;;; ------------------------------------------------------------------------------------------------

(deftest dirty-global?-no-objects-test
  (testing "dirty-global? returns false when no remote sync objects exist"
    (is (false? (rs-object/dirty-global?)))))

(deftest dirty-global?-synced-objects-test
  (testing "dirty-global? returns false when all objects are synced"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Card card {:name "Test Card"
                         :collection_id (:id collection)
                         :creator_id (mt/user->id :rasta)
                         :display "table"
                         :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/RemoteSyncObject _ {:model_type "card"
                                  :model_id (:id card)
                                  :model_name (:name card)
                                  :status "synced"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (is (false? (rs-object/dirty-global?))))))

(deftest dirty-global?-pending-objects-test
  (testing "dirty-global? returns true when objects have pending status"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Card card {:name "Test Card"
                         :collection_id (:id collection)
                         :creator_id (mt/user->id :rasta)
                         :display "table"
                         :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/RemoteSyncObject _ {:model_type "card"
                                  :model_id (:id card)
                                  :model_name (:name card)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (is (true? (rs-object/dirty-global?))))))

(deftest dirty-global?-error-objects-test
  (testing "dirty-global? returns true when objects have error status"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Card card {:name "Test Card"
                         :collection_id (:id collection)
                         :creator_id (mt/user->id :rasta)
                         :display "table"
                         :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/RemoteSyncObject _ {:model_type "card"
                                  :model_id (:id card)
                                  :model_name (:name card)
                                  :status "error"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (is (true? (rs-object/dirty-global?))))))

(deftest dirty-global?-mixed-status-test
  (testing "dirty-global? returns true when some objects are not synced"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Card card1 {:name "Test Card 1"
                          :collection_id (:id collection)
                          :creator_id (mt/user->id :rasta)
                          :display "table"
                          :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/Card card2 {:name "Test Card 2"
                          :collection_id (:id collection)
                          :creator_id (mt/user->id :rasta)
                          :display "table"
                          :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/RemoteSyncObject _ {:model_type "card"
                                  :model_id (:id card1)
                                  :model_name (:name card1)
                                  :status "synced"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "card"
                                  :model_id (:id card2)
                                  :model_name (:name card2)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (is (true? (rs-object/dirty-global?))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for dirty-for-global
;;; ------------------------------------------------------------------------------------------------

(deftest dirty-for-global-no-objects-test
  (testing "dirty-for-global returns empty when no remote sync objects exist"
    (is (empty? (rs-object/dirty-for-global)))))

(deftest dirty-for-global-synced-objects-test
  (testing "dirty-for-global returns empty when all objects are synced"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Card card {:name "Test Card"
                         :collection_id (:id collection)
                         :creator_id (mt/user->id :rasta)
                         :display "table"
                         :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/RemoteSyncObject _ {:model_type "card"
                                  :model_id (:id card)
                                  :model_name (:name card)
                                  :status "synced"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (is (empty? (rs-object/dirty-for-global))))))

(deftest dirty-for-global-returns-dirty-items-test
  (testing "dirty-for-global returns items with non-synced status"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Card card {:name "Test Card"
                         :collection_id (:id collection)
                         :creator_id (mt/user->id :rasta)
                         :display "table"
                         :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/RemoteSyncObject _ {:model_type "card"
                                  :model_id (:id card)
                                  :model_name (:name card)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (let [dirty-items (rs-object/dirty-for-global)]
        (is (= 1 (count dirty-items)))
        (let [item (first dirty-items)]
          (is (= (:id card) (:id item)))
          (is (= "Test Card" (:name item)))
          (is (= "card" (:model item)))
          (is (= "pending" (:sync_status item))))))))

(deftest dirty-for-global-multiple-model-types-test
  (testing "dirty-for-global with multiple model types"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Card card {:name "Test Card"
                         :collection_id (:id collection)
                         :creator_id (mt/user->id :rasta)
                         :display "table"
                         :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/Dashboard dashboard {:name "Test Dashboard"
                                   :collection_id (:id collection)
                                   :creator_id (mt/user->id :rasta)}
       :model/RemoteSyncObject _ {:model_type "card"
                                  :model_id (:id card)
                                  :model_name (:name card)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "dashboard"
                                  :model_id (:id dashboard)
                                  :model_name (:name dashboard)
                                  :status "error"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (let [dirty-items (rs-object/dirty-for-global)
            models (set (map :model dirty-items))]
        (is (= 2 (count dirty-items)))
        (is (= #{"card" "dashboard"} models))
        (let [items-by-model (group-by :model dirty-items)]
          (is (= "pending" (:sync_status (first (get items-by-model "card")))))
          (is (= "error" (:sync_status (first (get items-by-model "dashboard"))))))))))

(deftest dirty-for-global-includes-collections-test
  (testing "dirty-for-global includes collection items"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/RemoteSyncObject _ {:model_type "collection"
                                  :model_id (:id collection)
                                  :model_name (:name collection)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (let [dirty-items (rs-object/dirty-for-global)]
        (is (= 1 (count dirty-items)))
        (let [item (first dirty-items)]
          (is (= (:id collection) (:id item)))
          (is (= "Test Collection" (:name item)))
          (is (= "collection" (:model item))))))))

(deftest dirty-for-global-filters-synced-items-test
  (testing "dirty-for-global filters out synced items"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Card card1 {:name "Synced Card"
                          :collection_id (:id collection)
                          :creator_id (mt/user->id :rasta)
                          :display "table"
                          :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/Card card2 {:name "Pending Card"
                          :collection_id (:id collection)
                          :creator_id (mt/user->id :rasta)
                          :display "table"
                          :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/RemoteSyncObject _ {:model_type "card"
                                  :model_id (:id card1)
                                  :model_name (:name card1)
                                  :status "synced"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "card"
                                  :model_id (:id card2)
                                  :model_name (:name card2)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (let [dirty-items (rs-object/dirty-for-global)
            names (set (map :name dirty-items))]
        (is (= 1 (count dirty-items)))
        (is (= #{"Pending Card"} names))))))

(deftest dirty-for-global-includes-snippets-test
  (testing "dirty-for-global includes snippet items"
    (mt/with-temp
      [:model/Collection snip-collection {:name "Snippet Collection"
                                          :namespace "snippets"
                                          :location "/"}
       :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                          :collection_id (:id snip-collection)
                                          :creator_id (mt/user->id :rasta)
                                          :content "SELECT * FROM table"}
       :model/RemoteSyncObject _ {:model_type "snippet"
                                  :model_id (:id snippet)
                                  :model_name (:name snippet)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (let [dirty-items (rs-object/dirty-for-global)]
        (is (= 1 (count dirty-items)))
        (let [item (first dirty-items)]
          (is (= (:id snippet) (:id item)))
          (is (= "Test Snippet" (:name item)))
          (is (= "snippet" (:model item))))))))

(deftest dirty-for-global-includes-documents-test
  (testing "dirty-for-global includes document items"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Document document {:name "Test Document"
                                 :collection_id (:id collection)
                                 :creator_id (mt/user->id :rasta)}
       :model/RemoteSyncObject _ {:model_type "document"
                                  :model_id (:id document)
                                  :model_name (:name document)
                                  :status "error"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (let [dirty-items (rs-object/dirty-for-global)]
        (is (= 1 (count dirty-items)))
        (let [item (first dirty-items)]
          (is (= (:id document) (:id item)))
          (is (= "Test Document" (:name item)))
          (is (= "document" (:model item)))
          (is (= "error" (:sync_status item))))))))

(deftest dirty-for-global-all-model-types-test
  (testing "dirty-for-global handles all supported model types"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Collection snip-collection {:name "Snippet Collection"
                                          :namespace "snippets"
                                          :location "/"}
       :model/Card card {:name "Card Item"
                         :collection_id (:id collection)
                         :creator_id (mt/user->id :rasta)
                         :display "table"
                         :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/Dashboard dashboard {:name "Dashboard Item"
                                   :collection_id (:id collection)
                                   :creator_id (mt/user->id :rasta)}
       :model/Document document {:name "Document Item"
                                 :collection_id (:id collection)
                                 :creator_id (mt/user->id :rasta)}
       :model/NativeQuerySnippet snippet {:name "Snippet Item"
                                          :collection_id (:id snip-collection)
                                          :creator_id (mt/user->id :rasta)
                                          :content "SELECT * FROM table"}
       :model/RemoteSyncObject _ {:model_type "collection"
                                  :model_id (:id collection)
                                  :model_name (:name collection)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "card"
                                  :model_id (:id card)
                                  :model_name (:name card)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "dashboard"
                                  :model_id (:id dashboard)
                                  :model_name (:name dashboard)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "document"
                                  :model_id (:id document)
                                  :model_name (:name document)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "snippet"
                                  :model_id (:id snippet)
                                  :model_name (:name snippet)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (let [dirty-items (rs-object/dirty-for-global)
            models (set (map :model dirty-items))]
        (is (= 5 (count dirty-items)))
        (is (= #{"collection" "card" "dashboard" "document" "snippet"} models))))))

;;; ------------------------------------------------------------------------------------------------
;;; Integration Tests
;;; ------------------------------------------------------------------------------------------------

(deftest dirty-functions-consistency-test
  (testing "dirty-global? and dirty-for-global are consistent"
    (testing "when no dirty items exist"
      (is (false? (rs-object/dirty-global?)))
      (is (empty? (rs-object/dirty-for-global))))

    (testing "when dirty items exist"
      (mt/with-temp
        [:model/Collection collection {:name "Test Collection"
                                       :location "/"}
         :model/Card card {:name "Test Card"
                           :collection_id (:id collection)
                           :creator_id (mt/user->id :rasta)
                           :display "table"
                           :dataset_query (mt/native-query {:query "SELECT 1"})}
         :model/RemoteSyncObject _ {:model_type "card"
                                    :model_id (:id card)
                                    :model_name (:name card)
                                    :status "pending"
                                    :status_changed_at (java.time.OffsetDateTime/now)}]
        (is (true? (rs-object/dirty-global?)))
        (is (= 1 (count (rs-object/dirty-for-global))))))))
