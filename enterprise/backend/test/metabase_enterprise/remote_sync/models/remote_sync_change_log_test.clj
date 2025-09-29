(ns metabase-enterprise.remote-sync.models.remote-sync-change-log-test
  "Comprehensive unit tests for the remote-sync-change-log namespace.
  Tests only the public methods: dirty-collection? and dirty-for-collection."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.models.remote-sync-change-log :as change-log]
   [metabase-enterprise.remote-sync.test-helpers :as remote-sync.th]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each remote-sync.th/clean-change-log)

;;; ------------------------------------------------------------------------------------------------
;;; Tests for dirty-collection?
;;; ------------------------------------------------------------------------------------------------

(deftest dirty-collection?-basic-functionality-test
  (testing "dirty-collection? basic functionality"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Card card {:name "Test Card"
                         :collection_id (:id collection)
                         :creator_id (mt/user->id :rasta)
                         :display "table"
                         :dataset_query (mt/native-query {:query "SELECT 1"})}]

      (testing "collection is not dirty when no sync log exists"
        (is (false? (change-log/dirty-collection? (:id collection)))))

      (testing "collection is dirty when entity has change log after last sync"
        (mt/with-temp
          [:model/RemoteSyncChangeLog _ {:model_type "Collection"
                                         :model_entity_id (:entity_id collection)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
           :model/RemoteSyncChangeLog _ {:model_type "Card"
                                         :model_entity_id (:entity_id card)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (java.time.OffsetDateTime/now)}]

          (is (true? (change-log/dirty-collection? (:id collection))))))

      (testing "collection is not dirty when change log is older than last sync"
        ;; Clear previous entries
        (t2/delete! :model/RemoteSyncChangeLog)

        (mt/with-temp
          [:model/RemoteSyncChangeLog _ {:model_type "Card"
                                         :model_entity_id (:entity_id card)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (.minusHours (java.time.OffsetDateTime/now) 2)}
           :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                         :model_entity_id (:entity_id collection)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}]

          (is (false? (change-log/dirty-collection? (:id collection)))))))))

(deftest dirty-collection?-different-model-types-test
  (testing "dirty-collection? with different model types"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}

       :model/Collection snip-collection {:name "Snippets Test Collection"
                                          :namespace "snippets"
                                          :location "/"}
       :model/Card card {:name "Test Card"
                         :collection_id (:id collection)
                         :creator_id (mt/user->id :rasta)
                         :display "table"
                         :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/Dashboard dashboard {:name "Test Dashboard"
                                   :collection_id (:id collection)
                                   :creator_id (mt/user->id :rasta)}
       :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                          :collection_id (:id snip-collection)
                                          :creator_id (mt/user->id :rasta)
                                          :content "SELECT * FROM table"}
       :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                     :model_entity_id (:entity_id collection)
                                     :sync_type "import"
                                     :status "success"
                                     :most_recent true
                                     :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}]

      (testing "dirty when card has recent changes"
        (mt/with-temp
          [:model/RemoteSyncChangeLog _ {:model_type "Card"
                                         :model_entity_id (:entity_id card)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (java.time.OffsetDateTime/now)}]
          (is (true? (change-log/dirty-collection? (:id collection))))))

      (testing "dirty when dashboard has recent changes"
        (t2/delete! :model/RemoteSyncChangeLog :model_type "Card")
        (mt/with-temp
          [:model/RemoteSyncChangeLog _ {:model_type "Collection"
                                         :model_entity_id (:entity_id collection)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
           :model/RemoteSyncChangeLog _ {:model_type "Dashboard"
                                         :model_entity_id (:entity_id dashboard)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (java.time.OffsetDateTime/now)}]
          (is (true? (change-log/dirty-collection? (:id collection))))))

      (testing "dirty when snippet has recent changes"
        (t2/delete! :model/RemoteSyncChangeLog :model_type "Dashboard")
        (mt/with-temp
          [:model/RemoteSyncChangeLog _ {:model_type "Collection"
                                         :model_entity_id (:entity_id collection)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
           :model/RemoteSyncChangeLog _ {:model_type "NativeQuerySnippet"
                                         :model_entity_id (:entity_id snippet)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (java.time.OffsetDateTime/now)}]
          (is (true? (change-log/dirty-collection? (:id snip-collection))))))

      (testing "dirty when collection itself has recent changes"
        (t2/delete! :model/RemoteSyncChangeLog :model_type "NativeQuerySnippet")
        (mt/with-temp
          [:model/RemoteSyncChangeLog _ {:model_type "Collection"
                                         :model_entity_id (:entity_id collection)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
           :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                         :model_entity_id (:entity_id collection)
                                         :sync_type "udpate"
                                         :status "success"
                                         :most_recent true
                                         :created_at (java.time.OffsetDateTime/now)}]
          (is (true? (change-log/dirty-collection? (:id collection)))))))))

(deftest dirty-collection?-collection-hierarchy-test
  (testing "dirty-collection? with collection hierarchy"
    (mt/with-temp
      [:model/Collection root-collection {:name "Root Collection"
                                          :location "/"}
       :model/Collection child-collection {:name "Child Collection"
                                           :location (str "/" (:id root-collection) "/")}
       :model/Card child-card {:name "Child Card"
                               :collection_id (:id child-collection)
                               :creator_id (mt/user->id :rasta)
                               :display "table"
                               :dataset_query (mt/native-query {:query "SELECT 1"})}]

      (testing "root collection is dirty when child collection has changes"
        (mt/with-temp
          [:model/RemoteSyncChangeLog _ {:model_type "Collection"
                                         :model_entity_id (:entity_id root-collection)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
           :model/RemoteSyncChangeLog _ {:model_type "Card"
                                         :model_entity_id (:entity_id child-card)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (java.time.OffsetDateTime/now)}]

          (is (true? (change-log/dirty-collection? (:id root-collection))))
          (is (true? (change-log/dirty-collection? (:id child-collection))))))

      (testing "works with deeper nesting"
        (mt/with-temp
          [:model/Collection grandchild-collection {:name "Grandchild Collection"
                                                    :location (str "/" (:id root-collection) "/" (:id child-collection) "/")}
           :model/Card grandchild-card {:name "Grandchild Card"
                                        :collection_id (:id grandchild-collection)
                                        :creator_id (mt/user->id :rasta)
                                        :display "table"
                                        :dataset_query (mt/native-query {:query "SELECT 1"})}]

          ;; Clear previous change logs
          (t2/delete! :model/RemoteSyncChangeLog :model_type "Card")

          (mt/with-temp
            [:model/RemoteSyncChangeLog _ {:model_type "Collection"
                                           :model_entity_id (:entity_id root-collection)
                                           :sync_type "import"
                                           :status "success"
                                           :most_recent true
                                           :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
             :model/RemoteSyncChangeLog _ {:model_type "Card"
                                           :model_entity_id (:entity_id grandchild-card)
                                           :sync_type "import"
                                           :status "success"
                                           :most_recent true
                                           :created_at (java.time.OffsetDateTime/now)}]

            (is (true? (change-log/dirty-collection? (:id root-collection))))))))))

(deftest dirty-collection?-edge-cases-test
  (testing "dirty-collection? edge cases"
    (testing "non-existent collection"
      (is (false? (change-log/dirty-collection? 999999))))

    (testing "collection with no entities"
      (mt/with-temp
        [:model/Collection empty-collection {:name "Empty Collection"
                                             :location "/"}]
        (is (false? (change-log/dirty-collection? (:id empty-collection))))))

    (testing "collection with entities but no change logs"
      (mt/with-temp
        [:model/Collection collection {:name "Collection"
                                       :location "/"}
         :model/Card _ {:name "Card"
                        :collection_id (:id collection)
                        :creator_id (mt/user->id :rasta)
                        :display "table"
                        :dataset_query (mt/native-query {:query "SELECT 1"})}]
        (is (false? (change-log/dirty-collection? (:id collection))))))

    (testing "collection with failed sync status"
      (mt/with-temp
        [:model/Collection collection {:name "Collection"
                                       :location "/"}
         :model/Card card {:name "Card"
                           :collection_id (:id collection)
                           :creator_id (mt/user->id :rasta)
                           :display "table"
                           :dataset_query (mt/native-query {:query "SELECT 1"})}
         :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                       :model_entity_id (:entity_id collection)
                                       :sync_type "import"
                                       :status "success"
                                       :most_recent true
                                       :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
         :model/RemoteSyncChangeLog _ {:model_type "Card"
                                       :model_entity_id (:entity_id card)
                                       :sync_type "import"
                                       :status "error"
                                       :most_recent true
                                       :created_at (java.time.OffsetDateTime/now)}]

        (is (true? (change-log/dirty-collection? (:id collection))))))

    (testing "collection considers both import and export as valid sync types"
      (mt/with-temp
        [:model/Collection collection {:name "Collection"
                                       :location "/"}
         :model/Card card {:name "Card"
                           :collection_id (:id collection)
                           :creator_id (mt/user->id :rasta)
                           :display "table"
                           :dataset_query (mt/native-query {:query "SELECT 1"})}
         :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                       :model_entity_id (:entity_id collection)
                                       :sync_type "export"
                                       :status "success"
                                       :most_recent true
                                       :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
         :model/RemoteSyncChangeLog _ {:model_type "Card"
                                       :model_entity_id (:entity_id card)
                                       :sync_type "import"
                                       :status "success"
                                       :most_recent true
                                       :created_at (java.time.OffsetDateTime/now)}]

        (is (true? (change-log/dirty-collection? (:id collection))))))))

;;; ------------------------------------------------------------------------------------------------
;;; Tests for dirty-for-collection
;;; ------------------------------------------------------------------------------------------------

(deftest dirty-for-collection-basic-functionality-test
  (testing "dirty-for-collection basic functionality"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Card card {:name "Test Card"
                         :collection_id (:id collection)
                         :creator_id (mt/user->id :rasta)
                         :display "table"
                         :dataset_query (mt/native-query {:query "SELECT 1"})}]

      (testing "returns empty when no dirty items"
        (is (empty? (change-log/dirty-for-collection (:id collection)))))

      (testing "returns dirty items with details"
        (mt/with-temp
          [:model/RemoteSyncChangeLog _ {:model_type "Collection"
                                         :model_entity_id (:entity_id collection)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
           :model/RemoteSyncChangeLog _ {:model_type "Card"
                                         :model_entity_id (:entity_id card)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (java.time.OffsetDateTime/now)}]

          (let [dirty-items (change-log/dirty-for-collection (:id collection))]
            (is (= 1 (count dirty-items)))
            (let [item (first dirty-items)]
              (is (= (:id card) (:id item)))
              (is (= "Test Card" (:name item)))
              (is (= "card" (:model item)))
              (is (= "import" (:sync_status item))))))))))

(deftest dirty-for-collection-multiple-model-types-test
  (testing "dirty-for-collection with multiple model types"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Collection snip-collection {:name "Test Snippet Collection"
                                          :location "/"
                                          :namespace "snippets"}
       :model/Card card {:name "Test Card"
                         :collection_id (:id collection)
                         :creator_id (mt/user->id :rasta)
                         :display "table"
                         :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/Dashboard dashboard {:name "Test Dashboard"
                                   :collection_id (:id collection)
                                   :creator_id (mt/user->id :rasta)}
       :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                          :collection_id (:id snip-collection)
                                          :creator_id (mt/user->id :rasta)
                                          :content "SELECT * FROM table"}
       :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                     :model_entity_id (:entity_id collection)
                                     :sync_type "import"
                                     :status "success"
                                     :most_recent true
                                     :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
       :model/RemoteSyncChangeLog _ {:model_type "Card"
                                     :model_entity_id (:entity_id card)
                                     :sync_type "import"
                                     :status "success"
                                     :most_recent true
                                     :created_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncChangeLog _ {:model_type "Dashboard"
                                     :model_entity_id (:entity_id dashboard)
                                     :sync_type "export"
                                     :status "success"
                                     :most_recent true
                                     :created_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncChangeLog _ {:model_type "NativeQuerySnippet"
                                     :model_entity_id (:entity_id snippet)
                                     :sync_type "import"
                                     :status "success"
                                     :most_recent true
                                     :created_at (java.time.OffsetDateTime/now)}]

      (let [dirty-items (change-log/dirty-for-collection (:id collection))
            models (set (map :model dirty-items))]

        (testing "returns all dirty model types"
          (is (= 2 (count dirty-items)))
          (is (= #{"card" "dashboard"} models)))

        (testing "includes correct sync status for each item"
          (let [items-by-model (group-by :model dirty-items)]
            (is (= "import" (:sync_status (first (get items-by-model "card")))))
            (is (= "export" (:sync_status (first (get items-by-model "dashboard")))))))))))

(deftest dirty-for-collection-nested-collections-test
  (testing "dirty-for-collection with nested collections"
    (mt/with-temp
      [:model/Collection root-collection {:name "Root Collection"
                                          :location "/"}
       :model/Collection child-collection {:name "Child Collection"
                                           :location (str "/" (:id root-collection) "/")}
       :model/Card root-card {:name "Root Card"
                              :collection_id (:id root-collection)
                              :creator_id (mt/user->id :rasta)
                              :display "table"
                              :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/Card child-card {:name "Child Card"
                               :collection_id (:id child-collection)
                               :creator_id (mt/user->id :rasta)
                               :display "table"
                               :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                     :model_entity_id (:entity_id root-collection)
                                     :sync_type "import"
                                     :status "success"
                                     :most_recent true
                                     :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
       :model/RemoteSyncChangeLog _ {:model_type "Card"
                                     :model_entity_id (:entity_id root-card)
                                     :sync_type "import"
                                     :status "success"
                                     :most_recent true
                                     :created_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncChangeLog _ {:model_type "Card"
                                     :model_entity_id (:entity_id child-card)
                                     :sync_type "import"
                                     :status "success"
                                     :most_recent true
                                     :created_at (java.time.OffsetDateTime/now)}
       :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                     :model_entity_id (:entity_id child-collection)
                                     :sync_type "import"
                                     :status "success"
                                     :most_recent true
                                     :created_at (java.time.OffsetDateTime/now)}]

      (testing "root collection query includes items from child collections"
        (let [dirty-items (change-log/dirty-for-collection (:id root-collection))
              names (set (map :name dirty-items))]
          (is (= 3 (count dirty-items)))
          (is (= #{"Root Card" "Child Card" "Child Collection"} names))))

      (testing "child collection query includes only its own items and itself"
        (let [dirty-items (change-log/dirty-for-collection (:id child-collection))
              names (set (map :name dirty-items))]
          (is (= 2 (count dirty-items)))
          (is (= #{"Child Card" "Child Collection"} names)))))))

(deftest dirty-for-collection-edge-cases-test
  (testing "dirty-for-collection edge cases"
    (testing "non-existent collection"
      (is (empty? (change-log/dirty-for-collection 999999))))

    (testing "collection with no entities"
      (mt/with-temp
        [:model/Collection empty-collection {:name "Empty Collection"
                                             :location "/"}]
        (is (empty? (change-log/dirty-for-collection (:id empty-collection))))))

    (testing "filters out non-most-recent change log entries"
      (mt/with-temp
        [:model/Collection collection {:name "Collection"
                                       :location "/"}
         :model/Card card {:name "Card"
                           :collection_id (:id collection)
                           :creator_id (mt/user->id :rasta)
                           :display "table"
                           :dataset_query (mt/native-query {:query "SELECT 1"})}
         :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                       :model_entity_id (:entity_id collection)
                                       :sync_type "import"
                                       :status "success"
                                       :most_recent true
                                       :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
         :model/RemoteSyncChangeLog _ {:model_type "Card"
                                       :model_entity_id (:entity_id card)
                                       :sync_type "import"
                                       :status "success"
                                       :most_recent false
                                       :created_at (java.time.OffsetDateTime/now)}]

        (is (empty? (change-log/dirty-for-collection (:id collection))))))

    (testing "includes items with failed sync status"
      (mt/with-temp
        [:model/Collection collection {:name "Collection"
                                       :location "/"}
         :model/Card card {:name "Card"
                           :collection_id (:id collection)
                           :creator_id (mt/user->id :rasta)
                           :display "table"
                           :dataset_query (mt/native-query {:query "SELECT 1"})}
         :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                       :model_entity_id (:entity_id collection)
                                       :sync_type "import"
                                       :status "success"
                                       :most_recent true
                                       :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
         :model/RemoteSyncChangeLog _ {:model_type "Card"
                                       :model_entity_id (:entity_id card)
                                       :sync_type "import"
                                       :status "error"
                                       :most_recent true
                                       :created_at (java.time.OffsetDateTime/now)}]

        (let [dirty-items (change-log/dirty-for-collection (:id collection))]
          (is (= 1 (count dirty-items))))))))

;;; ------------------------------------------------------------------------------------------------
;;; Integration Tests
;;; ------------------------------------------------------------------------------------------------

(deftest dirty-functions-integration-test
  (testing "dirty-collection? and dirty-for-collection work together"
    (mt/with-temp
      [:model/Collection collection {:name "Test Collection"
                                     :location "/"}
       :model/Card card1 {:name "Card 1"
                          :collection_id (:id collection)
                          :creator_id (mt/user->id :rasta)
                          :display "table"
                          :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/Card _card2 {:name "Card 2"
                           :collection_id (:id collection)
                           :creator_id (mt/user->id :rasta)
                           :display "table"
                           :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/Dashboard dashboard {:name "Dashboard"
                                   :collection_id (:id collection)
                                   :creator_id (mt/user->id :rasta)}]

      (testing "when no changes exist"
        (is (false? (change-log/dirty-collection? (:id collection))))
        (is (empty? (change-log/dirty-for-collection (:id collection)))))

      (testing "when changes exist"
        (mt/with-temp
          [:model/RemoteSyncChangeLog _ {:model_type "Collection"
                                         :model_entity_id (:entity_id collection)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
           :model/RemoteSyncChangeLog _ {:model_type "Card"
                                         :model_entity_id (:entity_id card1)
                                         :sync_type "import"
                                         :status "success"
                                         :most_recent true
                                         :created_at (java.time.OffsetDateTime/now)}
           :model/RemoteSyncChangeLog _ {:model_type "Dashboard"
                                         :model_entity_id (:entity_id dashboard)
                                         :sync_type "export"
                                         :status "success"
                                         :most_recent true
                                         :created_at (java.time.OffsetDateTime/now)}]

          (is (true? (change-log/dirty-collection? (:id collection))))

          (let [dirty-items (change-log/dirty-for-collection (:id collection))]
            (is (= 2 (count dirty-items)))
            (is (= #{"Card 1" "Dashboard"} (set (map :name dirty-items)))))))

      (testing "consistency after cleanup"
        (is (false? (change-log/dirty-collection? (:id collection))))
        (is (empty? (change-log/dirty-for-collection (:id collection))))))))

(deftest cross-collection-isolation-test
  (testing "changes in one collection don't affect other collections"
    (mt/with-temp
      [:model/Collection collection1 {:name "Collection 1"
                                      :location "/"}
       :model/Collection collection2 {:name "Collection 2"
                                      :location "/"}
       :model/Card card1 {:name "Card 1"
                          :collection_id (:id collection1)
                          :creator_id (mt/user->id :rasta)
                          :display "table"
                          :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/Card _card2 {:name "Card 2"
                           :collection_id (:id collection2)
                           :creator_id (mt/user->id :rasta)
                           :display "table"
                           :dataset_query (mt/native-query {:query "SELECT 1"})}
       :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                     :model_entity_id (:entity_id collection1)
                                     :sync_type "import"
                                     :status "success"
                                     :most_recent true
                                     :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
       :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                     :model_entity_id (:entity_id collection2)
                                     :sync_type "import"
                                     :status "success"
                                     :most_recent true
                                     :created_at (.minusHours (java.time.OffsetDateTime/now) 1)}
       :model/RemoteSyncChangeLog _ {:model_type "Card"
                                     :model_entity_id (:entity_id card1)
                                     :sync_type "import"
                                     :status "success"
                                     :most_recent true
                                     :created_at (java.time.OffsetDateTime/now)}]

      (testing "collection1 is dirty but collection2 is not"
        (is (true? (change-log/dirty-collection? (:id collection1))))
        (is (false? (change-log/dirty-collection? (:id collection2))))

        (is (= 1 (count (change-log/dirty-for-collection (:id collection1)))))
        (is (empty? (change-log/dirty-for-collection (:id collection2))))))))

 ;;; ------------------------------------------------------------------------------------------------
;;; Tests for dirty-global? and dirty-for-global
;;; ------------------------------------------------------------------------------------------------

(deftest dirty-global?-basic-functionality-test
  (testing "dirty-global? detects changes in any remote-synced collection"
    (mt/with-temp [:model/Collection remote-col {:location "/" :type "remote-synced"}]
      ;; No changes initially
      (is (false? (change-log/dirty-global?))
          "Should return false when no changes exist")

      ;; Create a change in a remote-synced collection
      (mt/with-temp [:model/Card card {:collection_id (:id remote-col)}
                     :model/RemoteSyncChangeLog _ {:model_type "Card"
                                                   :model_entity_id (:entity_id card)
                                                   :sync_type "dirty"
                                                   :status "pending"
                                                   :most_recent true}]
        (is (true? (change-log/dirty-global?))
            "Should return true when changes exist in a remote-synced collection"))))

  (testing "dirty-global? ignores changes in non-remote-synced collections"
    (mt/with-temp [:model/Collection {col-id :id} {:location "/" :type "default"}
                   :model/Card {card-entity-id :enity-id} {:collection_id col-id}
                   :model/RemoteSyncChangeLog _ {:model_type "Card"
                                                 :model_entity_id card-entity-id
                                                 :sync_type "dirty"
                                                 :status "pending"
                                                 :most_recent true}]
      (is (false? (change-log/dirty-global?))
          "Should return false when changes are only in non-remote-synced collections"))))

(deftest dirty-global?-after-sync-test
  (testing "dirty-global? returns false after successful sync"
    (mt/with-temp [:model/Collection remote-col {:location "/" :type "remote-synced"}]
      ;; Create a change
      (mt/with-temp [:model/Card card {:collection_id (:id remote-col)}
                     :model/RemoteSyncChangeLog _ {:model_type "Card"
                                                   :model_entity_id (:entity_id card)
                                                   :sync_type "dirty"
                                                   :status "pending"
                                                   :most_recent true
                                                   :created_at #t "2024-01-01T00:00:00"}]
        (is (true? (change-log/dirty-global?))
            "Should have dirty items before sync")

        ;; Simulate successful export sync
        (mt/with-temp [:model/RemoteSyncChangeLog _ {:model_type "Collection"
                                                     :model_entity_id (:entity_id remote-col)
                                                     :sync_type "export"
                                                     :status "success"
                                                     :most_recent false
                                                     :created_at #t "2024-01-02T00:00:00"}]
          (is (false? (change-log/dirty-global?))
              "Should return false after successful sync")))))

  (testing "dirty-global? detects new changes after sync"
    (mt/with-temp [:model/Collection remote-col {:location "/" :type "remote-synced"}
                   :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                                 :model_entity_id (:entity_id remote-col)
                                                 :sync_type "export"
                                                 :status "success"
                                                 :most_recent false
                                                 :created_at #t "2024-01-01T00:00:00"}]

      ;; Create a new change after the sync
      (mt/with-temp [:model/Card card {:collection_id (:id remote-col)}
                     :model/RemoteSyncChangeLog _ {:model_type "Card"
                                                   :model_entity_id (:entity_id card)
                                                   :sync_type "dirty"
                                                   :status "pending"
                                                   :most_recent true
                                                   :created_at #t "2024-01-03T00:00:00"}]
        (is (true? (change-log/dirty-global?))
            "Should detect changes made after the last sync")))))

(deftest dirty-for-global-basic-functionality-test
  (testing "dirty-for-global returns all dirty items across remote-synced collections"
    (mt/with-temp [:model/Collection remote-col {:location "/" :type "remote-synced"}]
      ;; No dirty items initially
      (is (empty? (change-log/dirty-for-global))
          "Should return empty seq when no changes exist")

      ;; Create multiple dirty items
      (mt/with-temp [:model/Card card1 {:collection_id (:id remote-col)
                                        :name "Test Card 1"}
                     :model/Card card2 {:collection_id (:id remote-col)
                                        :name "Test Card 2"}
                     :model/Dashboard dashboard {:collection_id (:id remote-col)
                                                 :name "Test Dashboard"}
                     :model/RemoteSyncChangeLog _ {:model_type "Card"
                                                   :model_entity_id (:entity_id card1)
                                                   :sync_type "dirty"
                                                   :status "pending"
                                                   :most_recent true}
                     :model/RemoteSyncChangeLog _ {:model_type "Card"
                                                   :model_entity_id (:entity_id card2)
                                                   :sync_type "dirty"
                                                   :status "pending"
                                                   :most_recent true}
                     :model/RemoteSyncChangeLog _ {:model_type "Dashboard"
                                                   :model_entity_id (:entity_id dashboard)
                                                   :sync_type "dirty"
                                                   :status "pending"
                                                   :most_recent true}]

        (let [results (change-log/dirty-for-global)]
          (is (= 3 (count results))
              "Should return all dirty items")
          (is (= #{"Test Card 1" "Test Card 2" "Test Dashboard"}
                 (set (map :name results)))
              "Should include all dirty items with correct names")
          (is (every? #(= "dirty" (:sync_status %)) results)
              "All items should have sync_status of 'dirty'")))))

  (testing "dirty-for-global includes items from nested collections"
    (mt/with-temp [:model/Collection remote-col {:location "/" :type "remote-synced"}
                   :model/Collection nested-col {:location (str "/" (:id remote-col) "/")
                                                 :type "remote-synced"
                                                 :name "Nested Collection"}
                   :model/Card _ {:collection_id (u/the-id nested-col)
                                  :name "Nested Card"
                                  :entity_id "nested-entity"}
                   :model/RemoteSyncChangeLog _ {:model_type "Card"
                                                 :model_entity_id "nested-entity"
                                                 :sync_type "dirty"
                                                 :status "pending"
                                                 :most_recent true}]

      (let [results (change-log/dirty-for-global)]
        (is (= 1 (count results))
            "Should include items from nested collections")
        (is (= "Nested Card" (:name (first results)))
            "Should have correct nested item"))))

  (testing "dirty-for-global respects model type variety"
    (mt/with-temp [:model/Collection remote-col {:location "/" :type "remote-synced"}
                   :model/Collection remote-snippet-col {:location "/" :type "remote-synced" :namespace "snippets"}
                   :model/Card card {:collection_id (:id remote-col)
                                     :name "Card Item"}
                   :model/Dashboard dashboard {:collection_id (:id remote-col)
                                               :name "Dashboard Item"}
                   :model/Document doc {:collection_id (:id remote-col)
                                        :name "Document Item"}
                   :model/NativeQuerySnippet snippet {:collection_id (:id remote-snippet-col)
                                                      :name "Snippet Item"}
                   :model/RemoteSyncChangeLog _ {:model_type "Card"
                                                 :model_entity_id (:entity_id card)
                                                 :sync_type "dirty"
                                                 :status "pending"
                                                 :most_recent true}
                   :model/RemoteSyncChangeLog _ {:model_type "Dashboard"
                                                 :model_entity_id (:entity_id dashboard)
                                                 :sync_type "dirty"
                                                 :status "pending"
                                                 :most_recent true}
                   :model/RemoteSyncChangeLog _ {:model_type "Document"
                                                 :model_entity_id (:entity_id doc)
                                                 :sync_type "dirty"
                                                 :status "pending"
                                                 :most_recent true}
                   :model/RemoteSyncChangeLog _ {:model_type "NativeQuerySnippet"
                                                 :model_entity_id (:entity_id snippet)
                                                 :sync_type "dirty"
                                                 :status "pending"
                                                 :most_recent true}]

      (let [results (change-log/dirty-for-global)
            models (set (map :model results))]
        (is (= 4 (count results))
            "Should return all model types")
        (is (= #{"card" "dashboard" "document" "snippet"} models)
            "Should include all different model types")))))

(deftest dirty-for-global-after-sync-test
  (testing "dirty-for-global returns empty after successful sync"
    (mt/with-temp [:model/Collection remote-col {:location "/" :type "remote-synced"}]
      ;; Create dirty items
      (mt/with-temp [:model/Card card {:collection_id (:id remote-col)}
                     :model/RemoteSyncChangeLog _ {:model_type "Card"
                                                   :model_entity_id (:entity_id card)
                                                   :sync_type "dirty"
                                                   :status "pending"
                                                   :most_recent true
                                                   :created_at #t "2024-01-01T00:00:00"}]

        ;; Verify dirty items exist
        (is (= 1 (count (change-log/dirty-for-global)))
            "Should have dirty items before sync")

        ;; Simulate successful sync
        (mt/with-temp [:model/RemoteSyncChangeLog _ {:model_type "Collection"
                                                     :model_entity_id (:entity_id remote-col)
                                                     :sync_type "export"
                                                     :status "success"
                                                     :most_recent false
                                                     :created_at #t "2024-01-02T00:00:00"}]
          (is (empty? (change-log/dirty-for-global))
              "Should return empty after successful sync")))))

  (testing "dirty-for-global only returns items changed after last sync"
    (mt/with-temp [:model/Collection remote-col {:location "/" :type "remote-synced"}
                   :model/RemoteSyncChangeLog _ {:model_type "Collection"
                                                 :model_entity_id (:entity_id remote-col)
                                                 :sync_type "export"
                                                 :status "success"
                                                 :most_recent false
                                                 :created_at #t "2024-01-01T00:00:00"}]
      ;; Create items with different timestamps
      (mt/with-temp [:model/Card old-card {:collection_id (:id remote-col)
                                           :name "Old Card"}
                     :model/Card new-card {:collection_id (:id remote-col)
                                           :name "New Card"}
                     :model/RemoteSyncChangeLog _ {:model_type "Card"
                                                   :model_entity_id (:entity_id old-card)
                                                   :sync_type "dirty"
                                                   :status "pending"
                                                   :most_recent true
                                                   :created_at #t "2023-12-31T00:00:00"}
                     :model/RemoteSyncChangeLog _ {:model_type "Card"
                                                   :model_entity_id (:entity_id new-card)
                                                   :sync_type "dirty"
                                                   :status "pending"
                                                   :most_recent true
                                                   :created_at #t "2024-01-02T00:00:00"}]
        (let [results (change-log/dirty-for-global)]
          (is (= 1 (count results))
              "Should only return items changed after sync")
          (is (= "New Card" (:name (first results)))
              "Should return only the new card"))))))
