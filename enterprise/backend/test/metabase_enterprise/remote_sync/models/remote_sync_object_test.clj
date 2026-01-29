(ns metabase-enterprise.remote-sync.models.remote-sync-object-test
  "Unit tests for the remote-sync-object namespace.
  Tests the public methods: dirty? and dirty-objects."
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
;;; Tests for dirty?
;;; ------------------------------------------------------------------------------------------------

(deftest dirty?-no-objects-test
  (testing "dirty? returns false when no remote sync objects exist"
    (is (false? (rs-object/dirty?)))))

(deftest dirty?-synced-objects-test
  (testing "dirty? returns false when all objects are synced"
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
      (is (false? (rs-object/dirty?))))))

(deftest dirty?-pending-objects-test
  (testing "dirty? returns true when objects have pending status"
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
      (is (true? (rs-object/dirty?))))))

(deftest dirty?-error-objects-test
  (testing "dirty? returns true when objects have error status"
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
      (is (true? (rs-object/dirty?))))))

(deftest dirty?-mixed-status-test
  (testing "dirty? returns true when some objects are not synced"
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
      (is (true? (rs-object/dirty?))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for dirty-objects
;;; ------------------------------------------------------------------------------------------------

(deftest dirty-objects-no-objects-test
  (testing "dirty-objects returns empty when no remote sync objects exist"
    (is (empty? (rs-object/dirty-objects)))))

(deftest dirty-objects-synced-objects-test
  (testing "dirty-objects returns empty when all objects are synced"
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
      (is (empty? (rs-object/dirty-objects))))))

(deftest dirty-objects-returns-dirty-items-test
  (testing "dirty-objects returns items with non-synced status"
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
      (let [dirty-items (rs-object/dirty-objects)]
        (is (= 1 (count dirty-items)))
        (let [item (first dirty-items)]
          (is (= (:id card) (:id item)))
          (is (= "Test Card" (:name item)))
          (is (= "card" (:model item)))
          (is (= "pending" (:sync_status item))))))))

(deftest dirty-objects-multiple-model-types-test
  (testing "dirty-objects with multiple model types"
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
      (let [dirty-items (rs-object/dirty-objects)
            models (set (map :model dirty-items))]
        (is (= 2 (count dirty-items)))
        (is (= #{"card" "dashboard"} models))
        (let [items-by-model (group-by :model dirty-items)]
          (is (= "pending" (:sync_status (first (get items-by-model "card")))))
          (is (= "error" (:sync_status (first (get items-by-model "dashboard"))))))))))

(deftest dirty-objects-includes-collections-test
  (testing "dirty-objects includes collection items"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/RemoteSyncObject _ {:model_type "collection"
                                  :model_id (:id collection)
                                  :model_name (:name collection)
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (let [dirty-items (rs-object/dirty-objects)]
        (is (= 1 (count dirty-items)))
        (let [item (first dirty-items)]
          (is (= (:id collection) (:id item)))
          (is (= "Test Collection" (:name item)))
          (is (= "collection" (:model item))))))))

(deftest dirty-objects-filters-synced-items-test
  (testing "dirty-objects filters out synced items"
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
      (let [dirty-items (rs-object/dirty-objects)
            names (set (map :name dirty-items))]
        (is (= 1 (count dirty-items)))
        (is (= #{"Pending Card"} names))))))

(deftest dirty-objects-includes-snippets-test
  (testing "dirty-objects includes snippet items"
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
      (let [dirty-items (rs-object/dirty-objects)]
        (is (= 1 (count dirty-items)))
        (let [item (first dirty-items)]
          (is (= (:id snippet) (:id item)))
          (is (= "Test Snippet" (:name item)))
          (is (= "snippet" (:model item))))))))

(deftest dirty-objects-includes-documents-test
  (testing "dirty-objects includes document items"
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
      (let [dirty-items (rs-object/dirty-objects)]
        (is (= 1 (count dirty-items)))
        (let [item (first dirty-items)]
          (is (= (:id document) (:id item)))
          (is (= "Test Document" (:name item)))
          (is (= "document" (:model item)))
          (is (= "error" (:sync_status item))))))))

(deftest dirty-objects-all-model-types-test
  (testing "dirty-objects handles all supported model types"
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
      (let [dirty-items (rs-object/dirty-objects)
            models (set (map :model dirty-items))]
        (is (= 5 (count dirty-items)))
        (is (= #{"collection" "card" "dashboard" "document" "snippet"} models))))))

;;; ------------------------------------------------------------------------------------------------
;;; Integration Tests
;;; ------------------------------------------------------------------------------------------------

(deftest dirty-functions-consistency-test
  (testing "dirty? and dirty-objects are consistent"
    (testing "when no dirty items exist"
      (is (false? (rs-object/dirty?)))
      (is (empty? (rs-object/dirty-objects))))

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
        (is (true? (rs-object/dirty?)))
        (is (= 1 (count (rs-object/dirty-objects))))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for Table, Field, and Segment in dirty-state queries
;;; ------------------------------------------------------------------------------------------------

(deftest dirty-objects-includes-tables-test
  (testing "dirty-objects includes table items with table_id and table_name"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Table table {:name "Test Table"
                           :collection_id (:id collection)
                           :is_published true}
       :model/RemoteSyncObject _ {:model_type "Table"
                                  :model_id (:id table)
                                  :model_name "Test Table"
                                  :model_collection_id (:id collection)
                                  :model_table_id (:id table)
                                  :model_table_name "Test Table"
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (let [dirty-items (rs-object/dirty-objects)]
        (is (= 1 (count dirty-items)))
        (let [item (first dirty-items)]
          (is (= (:id table) (:id item)))
          (is (= "Test Table" (:name item)))
          (is (= "table" (:model item)))
          (is (= "pending" (:sync_status item)))
          ;; For tables, table_id and table_name refer to themselves
          (is (= (:id table) (:table_id item)))
          (is (= "Test Table" (:table_name item))))))))

(deftest dirty-objects-includes-fields-test
  (testing "dirty-objects includes field items with table_id and table_name from parent table"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Table table {:name "Test Table"
                           :collection_id (:id collection)
                           :is_published true}
       :model/Field field {:name "test_field"
                           :table_id (:id table)
                           :base_type :type/Text
                           :database_type "TEXT"}
       :model/RemoteSyncObject _ {:model_type "Field"
                                  :model_id (:id field)
                                  :model_name "test_field"
                                  :model_collection_id (:id collection)
                                  :model_table_id (:id table)
                                  :model_table_name "Test Table"
                                  :status "update"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (let [dirty-items (rs-object/dirty-objects)]
        (is (= 1 (count dirty-items)))
        (let [item (first dirty-items)]
          (is (= (:id field) (:id item)))
          (is (= "test_field" (:name item)))
          (is (= "field" (:model item)))
          (is (= "update" (:sync_status item)))
          ;; collection_id should come from the parent table
          (is (= (:id collection) (:collection_id item)))
          ;; table_id and table_name should be from the parent table
          (is (= (:id table) (:table_id item)))
          (is (= "Test Table" (:table_name item))))))))

(deftest dirty-objects-includes-segments-test
  (testing "dirty-objects includes segment items with table_id and table_name from parent table"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Table table {:name "Test Table"
                           :collection_id (:id collection)
                           :is_published true}
       :model/Field field {:name "test_field"
                           :table_id (:id table)
                           :base_type :type/Text
                           :database_type "TEXT"}
       :model/Segment segment {:name "Test Segment"
                               :table_id (:id table)
                               :creator_id (mt/user->id :rasta)
                               :definition {:source-table (:id table)
                                            :filter [:= [:field (:id field) nil] "test"]}}
       :model/RemoteSyncObject _ {:model_type "Segment"
                                  :model_id (:id segment)
                                  :model_name "Test Segment"
                                  :model_collection_id (:id collection)
                                  :model_table_id (:id table)
                                  :model_table_name "Test Table"
                                  :status "create"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (let [dirty-items (rs-object/dirty-objects)]
        (is (= 1 (count dirty-items)))
        (let [item (first dirty-items)]
          (is (= (:id segment) (:id item)))
          (is (= "Test Segment" (:name item)))
          (is (= "segment" (:model item)))
          (is (= "create" (:sync_status item)))
          ;; collection_id should come from the parent table
          (is (= (:id collection) (:collection_id item)))
          ;; table_id and table_name should be from the parent table
          (is (= (:id table) (:table_id item)))
          (is (= "Test Table" (:table_name item))))))))

(deftest dirty-objects-all-model-types-including-new-test
  (testing "dirty-objects handles all supported model types including Table, Field, and Segment"
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
       :model/Table table {:name "Table Item"
                           :collection_id (:id collection)
                           :is_published true}
       :model/Field field {:name "field_item"
                           :table_id (:id table)
                           :base_type :type/Text
                           :database_type "TEXT"}
       :model/Segment segment {:name "Segment Item"
                               :table_id (:id table)
                               :creator_id (mt/user->id :rasta)
                               :definition {:source-table (:id table)
                                            :filter [:= [:field (:id field) nil] "test"]}}
       :model/RemoteSyncObject _ {:model_type "Collection"
                                  :model_id (:id collection)
                                  :model_name "Test Collection"
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "Card"
                                  :model_id (:id card)
                                  :model_name "Card Item"
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "Dashboard"
                                  :model_id (:id dashboard)
                                  :model_name "Dashboard Item"
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "Document"
                                  :model_id (:id document)
                                  :model_name "Document Item"
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "NativeQuerySnippet"
                                  :model_id (:id snippet)
                                  :model_name "Snippet Item"
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "Table"
                                  :model_id (:id table)
                                  :model_name "Table Item"
                                  :model_table_id (:id table)
                                  :model_table_name "Table Item"
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "Field"
                                  :model_id (:id field)
                                  :model_name "field_item"
                                  :model_table_id (:id table)
                                  :model_table_name "Table Item"
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncObject _ {:model_type "Segment"
                                  :model_id (:id segment)
                                  :model_name "Segment Item"
                                  :model_table_id (:id table)
                                  :model_table_name "Table Item"
                                  :status "pending"
                                  :status_changed_at (java.time.OffsetDateTime/now)}]
      (let [dirty-items (rs-object/dirty-objects)
            models (set (map :model dirty-items))]
        (is (= 8 (count dirty-items)))
        (is (= #{"collection" "card" "dashboard" "document" "nativequerysnippet" "table" "field" "segment"} models))))))
