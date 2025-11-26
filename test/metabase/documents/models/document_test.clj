(ns metabase.documents.models.document-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.models.document :as document]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest public-sharing-test
  (testing "Document's :public_uuid visibility based on public sharing setting"
    (testing "comes back if public sharing is enabled"
      (tu/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp [:model/Document document {:public_uuid (str (random-uuid))}]
          (is (=? u/uuid-regex
                  (:public_uuid document))))))
    (testing "comes back as nil if public sharing is disabled"
      (tu/with-temporary-setting-values [enable-public-sharing false]
        (mt/with-temp [:model/Document document {:public_uuid (str (random-uuid))}]
          (is (= nil
                 (:public_uuid document))))))))

(deftest sync-document-cards-collection-matching-cards-test
  (testing "should only update cards with matching document_id"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Target Collection"}
                   :model/Document {document-id :id} {:name "Test Document"}
                   :model/Card {card1-id :id} {:name "Document Card 1"
                                               :document_id document-id
                                               :collection_id nil
                                               :dataset_query (mt/mbql-query venues)}
                   :model/Card {card2-id :id} {:name "Document Card 2"
                                               :document_id document-id
                                               :collection_id nil
                                               :dataset_query (mt/mbql-query venues)}
                   :model/Card {other-card-id :id} {:name "Other Card"
                                                    :type :question
                                                    :collection_id nil
                                                    :dataset_query (mt/mbql-query venues)}]
      (let [updated-count (document/sync-document-cards-collection! document-id collection-id)]
        ;; Should update exactly 2 cards
        (is (= 2 updated-count))

        ;; Verify the document cards were updated
        (let [updated-card1 (t2/select-one :model/Card :id card1-id)
              updated-card2 (t2/select-one :model/Card :id card2-id)
              other-card (t2/select-one :model/Card :id other-card-id)]
          (is (= collection-id (:collection_id updated-card1)))
          (is (= collection-id (:collection_id updated-card2)))
          ;; Other card should not be affected
          (is (nil? (:collection_id other-card))))))))

(deftest sync-document-cards-collection-nil-document-document-id-test
  (testing "should not affect cards with nil document_id"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Target Collection"}
                   :model/Document {document-id :id} {:name "Test Document"}
                   :model/Card {nil-document-card-id :id} {:name "Nil Document Card"
                                                           :document_id nil
                                                           :collection_id nil
                                                           :dataset_query (mt/mbql-query venues)}]
      (let [updated-count (document/sync-document-cards-collection! document-id collection-id)]
        ;; Should update 0 cards since no cards have matching document_id
        (is (= 0 updated-count))

        ;; Verify the card with nil document_id was not affected
        (let [unchanged-card (t2/select-one :model/Card :id nil-document-card-id)]
          (is (nil? (:collection_id unchanged-card))))))))

(deftest sync-document-cards-collection-empty-result-sets-test
  (testing "should handle empty result sets gracefully"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Target Collection"}
                   :model/Document {document-id :id} {:name "Empty Document"}]
      ;; No cards associated with this document
      (let [updated-count (document/sync-document-cards-collection! document-id collection-id)]
        ;; Should return 0 for no updates
        (is (= 0 updated-count))))))

(deftest document-collection-sync-hook-triggers-on-collection-change-test
  (testing "Hook is called when document collection_id changes"
    (mt/with-temp
      [:model/Collection {old-collection-id :id} {:name "Old Collection"}
       :model/Collection {new-collection-id :id} {:name "New Collection"}
       :model/Document {document-id :id} {:collection_id old-collection-id
                                          :name "Test Document"}
       :model/Card {card1-id :id} {:name "Card 1"
                                   :document_id document-id
                                   :collection_id old-collection-id}
       :model/Card {card2-id :id} {:name "Card 2"
                                   :document_id document-id
                                   :collection_id old-collection-id}]

      ;; Update the document's collection_id
      (t2/update! :model/Document document-id {:collection_id new-collection-id})

      ;; Verify that associated cards were updated to match the new collection
      (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id card1-id))))
      (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id card2-id)))))))

(deftest document-collection-sync-hook-handles-nil-collections-test
  (testing "Hook correctly handles nil collection values"
    (mt/with-temp
      [:model/Collection {collection-id :id} {:name "Test Collection"}
       :model/Document {document-id :id} {:collection_id collection-id
                                          :name "Test Document"}
       :model/Card {card-id :id} {:name "Card"
                                  :document_id document-id
                                  :collection_id collection-id}]

      ;; Move document to no collection (nil)
      (t2/update! :model/Document document-id {:collection_id nil})

      ;; Verify that the card's collection_id was updated to nil
      (is (nil? (:collection_id (t2/select-one :model/Card :id card-id)))))))

(deftest document-collection-sync-hook-only-affects-cards-test
  (testing "Hook only updates cards with  matching document_id"
    (mt/with-temp
      [:model/Collection {old-collection-id :id} {:name "Old Collection"}
       :model/Collection {new-collection-id :id} {:name "New Collection"}
       :model/Document {document-id :id} {:collection_id old-collection-id
                                          :name "Test Document"}
       ;; Card that should be updated (correct type and document_id)
       :model/Card {in-document-card-id :id} {:name "In-Document Card"
                                              :type :question
                                              :document_id document-id
                                              :collection_id old-collection-id}
       ;; Card that should be updated (wrong type)
       :model/Card {question-card-id :id} {:name "Question Card"
                                           :type :model
                                           :collection_id old-collection-id}
       ;; Card that should NOT be updated (no document_id)
       :model/Card {regular-card-id :id} {:name "Regular Card"
                                          :collection_id old-collection-id}]

      ;; Update the document's collection_id
      (t2/update! :model/Document document-id {:collection_id new-collection-id})

      ;; Verify only the correct card was updated
      (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id in-document-card-id))))

      ;; Verify other cards were NOT updated
      (is (= old-collection-id (:collection_id (t2/select-one :model/Card :id question-card-id))))
      (is (= old-collection-id (:collection_id (t2/select-one :model/Card :id regular-card-id)))))))

(deftest personal-collection-edge-cases-test
  (testing "Personal collection handling"
    (binding [collection/*allow-deleting-personal-collections* true]
      (mt/with-temp [:model/User {user-id :id} {:first_name "Test" :last_name "User" :email "test@example.com"}
                     :model/Collection {personal-collection-id :id} {:name "Personal Collection"
                                                                     :personal_owner_id user-id}
                     :model/Collection {regular-collection-id :id} {:name "Regular Collection"}
                     :model/Document {document-id :id} {:collection_id regular-collection-id
                                                        :name "Personal Test Document"}
                     :model/Card {card-id :id} {:name "Personal Card"
                                                :document_id document-id
                                                :collection_id regular-collection-id
                                                :dataset_query (mt/mbql-query venues)}]

        (testing "moving document to personal collection moves associated cards"
          (mt/with-current-user user-id
            ;; As the personal collection owner, update should succeed
            (t2/update! :model/Document document-id {:collection_id personal-collection-id})

            ;; Verify both document and card moved to personal collection
            (is (= personal-collection-id (:collection_id (t2/select-one :model/Document :id document-id))))
            (is (= personal-collection-id (:collection_id (t2/select-one :model/Card :id card-id))))))

        (testing "moving document from personal collection works"
          (mt/with-current-user user-id
            ;; Move back to regular collection
            (t2/update! :model/Document document-id {:collection_id regular-collection-id})

            ;; Verify both document and card moved back
            (is (= regular-collection-id (:collection_id (t2/select-one :model/Document :id document-id))))
            (is (= regular-collection-id (:collection_id (t2/select-one :model/Card :id card-id))))))))))

(deftest validate-collection-move-permissions-allows-move-with-both-permissions-test
  (testing "allows move when user has write permissions for both collections"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/Collection {new-collection-id :id} {:name "New Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permissions to both collections
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) old-collection-id)
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) new-collection-id)

          ;; Should not throw any exception
          (is (some? (document/validate-collection-move-permissions old-collection-id new-collection-id))))))))

(deftest validate-collection-move-permissions-throws-403-missing-old-permission-test
  (testing "throws 403 when user lacks write permission for old collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/Collection {new-collection-id :id} {:name "New Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permission only to new collection
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) new-collection-id)

          ;; Should throw 403 exception
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                (document/validate-collection-move-permissions old-collection-id new-collection-id))))))))

(deftest validate-collection-move-permissions-throws-403-missing-new-permission-test
  (testing "throws 403 when user lacks write permission for new collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/Collection {new-collection-id :id} {:name "New Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permission only to old collection
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) old-collection-id)

          ;; Should throw 403 exception
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                (document/validate-collection-move-permissions old-collection-id new-collection-id))))))))

(deftest validate-collection-move-permissions-throws-403-no-permissions-test
  (testing "throws 403 when user lacks write permissions for both collections"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/Collection {new-collection-id :id} {:name "New Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; No permissions granted

          ;; Should throw 403 exception
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that."
                                (document/validate-collection-move-permissions old-collection-id new-collection-id))))))))

(deftest validate-collection-move-permissions-allows-move-from-root-test
  (testing "allows move when old collection is nil (moving from root)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {new-collection-id :id} {:name "New Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permission to new collection
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) new-collection-id)

          ;; Should not throw any exception when old collection is nil
          (is (some? (document/validate-collection-move-permissions nil new-collection-id))))))))

(deftest validate-collection-move-permissions-allows-move-to-root-test
  (testing "allows move when new collection is nil (moving to root)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permission to old collection
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) old-collection-id)

          ;; Should not throw any exception when new collection is nil
          (is (nil? (document/validate-collection-move-permissions old-collection-id nil))))))))

(deftest validate-collection-move-permissions-allows-move-both-nil-test
  (testing "allows move when both collections are nil"
    (mt/with-temp [:model/User {user-id :id} {}]
      (mt/with-current-user user-id
        ;; Should not throw any exception when both collections are nil
        (is (nil? (document/validate-collection-move-permissions nil nil)))))))

(deftest validate-collection-move-permissions-throws-400-nonexistent-collection-test
  (testing "throws 400 when new collection does not exist"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permission to old collection
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) old-collection-id)

          ;; Use a non-existent collection ID
          (let [non-existent-id 999999]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid Request."
                                  (document/validate-collection-move-permissions old-collection-id non-existent-id)))))))))

(deftest validate-collection-move-permissions-throws-400-archived-collection-test
  (testing "throws 400 when new collection is archived"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                     :model/Collection {archived-collection-id :id} {:name "Archived Collection" :archived true}
                     :model/User {user-id :id} {}]
        (mt/with-current-user user-id
          ;; Grant write permissions to both collections
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) old-collection-id)
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) archived-collection-id)

          ;; Should throw 400 exception for archived collection
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid"
                                (document/validate-collection-move-permissions old-collection-id archived-collection-id))))))))

(deftest validate-collection-move-permissions-superuser-test
  (testing "superuser can move between any collections"
    (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                   :model/Collection {new-collection-id :id} {:name "New Collection"}]
      (mt/with-current-user (mt/user->id :crowberto)
        ;; Superuser should be able to move without explicit permissions
        (is (some? (document/validate-collection-move-permissions old-collection-id new-collection-id)))))))

(deftest hydrate-document-creator-test
  (testing "hydrates document creator correctly"
    (mt/with-temp [:model/User {user-id :id} {:first_name "John"
                                              :last_name "Doe"
                                              :email "john.doe@example.com"}
                   :model/Document {document-id :id} {:name "Test Document"
                                                      :creator_id user-id}]
      (let [hydrated-doc (t2/hydrate (t2/select-one :model/Document :id document-id) :creator)]
        (testing "creator is hydrated with correct user data"
          (is (some? (:creator hydrated-doc)))
          (is (= user-id (get-in hydrated-doc [:creator :id])))
          (is (= "John" (get-in hydrated-doc [:creator :first_name])))
          (is (= "Doe" (get-in hydrated-doc [:creator :last_name])))
          (is (= "john.doe@example.com" (get-in hydrated-doc [:creator :email]))))))))

(deftest hydrate-multiple-documents-creator-test
  (testing "hydrates creators for multiple documents efficiently"
    (mt/with-temp [:model/User {user1-id :id} {:first_name "Alice"
                                               :last_name "Smith"
                                               :email "alice@example.com"}
                   :model/User {user2-id :id} {:first_name "Bob"
                                               :last_name "Jones"
                                               :email "bob@example.com"}
                   :model/Document {doc1-id :id} {:name "Document 1"
                                                  :creator_id user1-id}
                   :model/Document {doc2-id :id} {:name "Document 2"
                                                  :creator_id user2-id}
                   :model/Document {doc3-id :id} {:name "Document 3"
                                                  :creator_id user1-id}] ; Same creator as doc1
      (let [documents (t2/select :model/Document :id [:in [doc1-id doc2-id doc3-id]])
            hydrated-docs (t2/hydrate documents :creator)]
        (testing "all documents have their creators hydrated"
          (is (= 3 (count hydrated-docs)))
          (doseq [doc hydrated-docs]
            (is (some? (:creator doc)))
            (is (some? (get-in doc [:creator :id])))
            (is (some? (get-in doc [:creator :first_name])))
            (is (some? (get-in doc [:creator :last_name])))
            (is (some? (get-in doc [:creator :email])))))

        (testing "creators are correctly matched to documents"
          (let [doc1 (first (filter #(= doc1-id (:id %)) hydrated-docs))
                doc2 (first (filter #(= doc2-id (:id %)) hydrated-docs))
                doc3 (first (filter #(= doc3-id (:id %)) hydrated-docs))]
            (is (= user1-id (get-in doc1 [:creator :id])))
            (is (= "Alice" (get-in doc1 [:creator :first_name])))

            (is (= user2-id (get-in doc2 [:creator :id])))
            (is (= "Bob" (get-in doc2 [:creator :first_name])))

            (is (= user1-id (get-in doc3 [:creator :id])))
            (is (= "Alice" (get-in doc3 [:creator :first_name])))))))))

(deftest hydrate-document-cards-test
  (testing "hydrates document cards correctly"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/Card {card1-id :id} {:name "Card 1"
                                               :dataset_query (mt/mbql-query venues {:limit 5})
                                               :document_id document-id}
                   :model/Card {card2-id :id} {:name "Card 2"
                                               :dataset_query (mt/mbql-query venues {:limit 10})
                                               :document_id document-id}]
      (let [hydrated-doc (t2/hydrate (t2/select-one :model/Document :id document-id) :cards)]
        (testing "cards are hydrated as a map keyed by card ID"
          (is (map? (:cards hydrated-doc)))
          (is (= 2 (count (:cards hydrated-doc))))
          (is (contains? (:cards hydrated-doc) card1-id))
          (is (contains? (:cards hydrated-doc) card2-id)))

        (testing "cards contain correct data"
          (is (= "Card 1" (get-in hydrated-doc [:cards card1-id :name])))
          (is (= "Card 2" (get-in hydrated-doc [:cards card2-id :name])))
          (is (= document-id (get-in hydrated-doc [:cards card1-id :document_id])))
          (is (= document-id (get-in hydrated-doc [:cards card2-id :document_id]))))))))

(deftest hydrate-document-cards-excludes-archived-test
  (testing "hydrated cards exclude archived cards"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/Card {active-card-id :id} {:name "Active Card"
                                                     :dataset_query (mt/mbql-query venues {:limit 5})
                                                     :document_id document-id
                                                     :archived false}
                   :model/Card {archived-card-id :id} {:name "Archived Card"
                                                       :dataset_query (mt/mbql-query venues {:limit 5})
                                                       :document_id document-id
                                                       :archived true}]
      (let [hydrated-doc (t2/hydrate (t2/select-one :model/Document :id document-id) :cards)]
        (testing "only active cards are included"
          (is (= 1 (count (:cards hydrated-doc))))
          (is (contains? (:cards hydrated-doc) active-card-id))
          (is (not (contains? (:cards hydrated-doc) archived-card-id))))))))

(deftest hydrate-multiple-documents-cards-test
  (testing "hydrates cards for multiple documents efficiently"
    (mt/with-temp [:model/Document {doc1-id :id} {:name "Document 1"}
                   :model/Document {doc2-id :id} {:name "Document 2"}
                   :model/Document {doc3-id :id} {:name "Document 3"}
                   :model/Card {card1-id :id} {:name "Card 1"
                                               :dataset_query (mt/mbql-query venues {:limit 5})
                                               :document_id doc1-id}
                   :model/Card {card2-id :id} {:name "Card 2"
                                               :dataset_query (mt/mbql-query venues {:limit 5})
                                               :document_id doc1-id}
                   :model/Card {card3-id :id} {:name "Card 3"
                                               :dataset_query (mt/mbql-query venues {:limit 5})
                                               :document_id doc2-id}]
      (let [documents (t2/select :model/Document :id [:in [doc1-id doc2-id doc3-id]])
            hydrated-docs (t2/hydrate documents :cards)]
        (testing "all documents have cards field"
          (is (= 3 (count hydrated-docs)))
          (doseq [doc hydrated-docs]
            (is (map? (:cards doc)))))

        (testing "cards are correctly matched to documents"
          (let [doc1 (first (filter #(= doc1-id (:id %)) hydrated-docs))
                doc2 (first (filter #(= doc2-id (:id %)) hydrated-docs))
                doc3 (first (filter #(= doc3-id (:id %)) hydrated-docs))]
            (testing "document 1 has two cards"
              (is (= 2 (count (:cards doc1))))
              (is (contains? (:cards doc1) card1-id))
              (is (contains? (:cards doc1) card2-id)))

            (testing "document 2 has one card"
              (is (= 1 (count (:cards doc2))))
              (is (contains? (:cards doc2) card3-id)))

            (testing "document 3 has no cards"
              (is (empty? (:cards doc3))))))))))

(deftest document-collection-position-field-handling-test
  (testing "Document model supports collection_position field"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Collection"}
                   :model/Document {document-id :id} {:name "Positioned Document"
                                                      :collection_id collection-id
                                                      :collection_position 5}]
      (let [document (t2/select-one :model/Document :id document-id)]
        (testing "collection_position is stored and retrieved correctly"
          (is (= 5 (:collection_position document)))))

      (testing "collection_position can be updated"
        (t2/update! :model/Document document-id {:collection_position 10})
        (let [updated-document (t2/select-one :model/Document :id document-id)]
          (is (= 10 (:collection_position updated-document)))))

      (testing "collection_position can be set to nil"
        (t2/update! :model/Document document-id {:collection_position nil})
        (let [updated-document (t2/select-one :model/Document :id document-id)]
          (is (nil? (:collection_position updated-document))))))))

;;; ------------------------------------------------- Serialization Tests -------------------------------------------

(deftest document-serdes-spec-test
  (testing "Document serialization spec includes all required fields"
    (let [spec (serdes/make-spec "Document" {})]
      (is (= [:archived :archived_directly :content_type :entity_id :name :collection_position]
             (:copy spec)))
      (is (= [:view_count :last_viewed_at :public_uuid :made_public_by_id :dependency_analysis_version] (:skip spec)))
      (is (contains? (:transform spec) :created_at))
      (is (contains? (:transform spec) :document))
      (is (contains? (:transform spec) :updated_at))
      (is (contains? (:transform spec) :collection_id))
      (is (contains? (:transform spec) :creator_id))
      (testing "foreign key transformers are properly configured"
        (is (get-in spec [:transform :collection_id ::serdes/fk]))
        (is (get-in spec [:transform :creator_id ::serdes/fk]))))))

(deftest document-serdes-dependencies-test
  (testing "Document dependencies method works correctly"
    (testing "with collection and creator"
      (let [document {:collection_id 123
                      :creator_id 456
                      :serdes/meta [{:model "Document" :id "test-entity-id"}]}
            deps (serdes/dependencies document)]
        (is (= #{[{:model "Collection" :id 123}]}
               deps))))))

(deftest document-serdes-smartlink-single-reference-test
  (testing "single smartLink card reference"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 789}]
                                                             :model "card"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document" :id "test-entity-id"}]}
          deps (serdes/dependencies document)]
      (is (contains? deps [{:model "Card" :id 789}]))
      (is (contains? deps [{:model "Collection" :id 123}])))))

(deftest document-serdes-smartlink-multiple-references-test
  (testing "multiple smartLink references of different types"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 789}]
                                                             :model "card"}}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Dashboard" :id 456}]
                                                             :model "dashboard"}}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Table" :id 321}]
                                                             :model "table"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document" :id "test-entity-id"}]}
          deps (serdes/dependencies document)]
      (is (contains? deps [{:model "Card" :id 789}]))
      (is (contains? deps [{:model "Dashboard" :id 456}]))
      (is (contains? deps [{:model "Table" :id 321}]))
      (is (contains? deps [{:model "Collection" :id 123}])))))

(deftest document-serdes-smartlink-nested-structure-test
  (testing "nested smartLink in complex prose mirror structure"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "text" :text "Some text"}]}
                                         {:type "bulletList"
                                          :content [{:type "listItem"
                                                     :content [{:type "paragraph"
                                                                :content [{:type "smartLink"
                                                                           :attrs {:entityId [{:model "Card" :id 999}]
                                                                                   :model "card"}}]}]}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document" :id "test-entity-id"}]}
          deps (serdes/dependencies document)]
      (is (contains? deps [{:model "Card" :id 999}]))
      (is (contains? deps [{:model "Collection" :id 123}])))))

(deftest document-serdes-smartlink-no-smartlinks-test
  (testing "document with no smartLinks"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "text" :text "Plain text only"}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document" :id "test-entity-id"}]}
          deps (serdes/dependencies document)]
      (is (= #{[{:model "Collection" :id 123}]}
             deps)))))

(deftest document-serdes-smartlink-unknown-model-test
  (testing "unknown smartLink model type is ignored"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs {:entityId [{:model "Unknown" :id 789}]
                                                             :model "unknown-model"}}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 456}]
                                                             :model "card"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document" :id "test-entity-id"}]}
          deps (serdes/dependencies document)]
      (is (contains? deps [{:model "Card" :id 456}]))
      (is (not (some #(= (:model (first %)) "unknown-model") deps))))))

(deftest document-serdes-smartlink-missing-entity-id-test
  (testing "smartLink with missing entityId is ignored"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs {:model "card"}}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 456}]
                                                             :model "card"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document" :id "test-entity-id"}]}
          deps (serdes/dependencies document)]
      (is (contains? deps [{:model "Card" :id 456}]))
      (is (= 2 (count deps)))))) ; collection and one valid card

(deftest document-serdes-smartlink-duplicate-references-test
  (testing "duplicate smartLink references are deduplicated"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 789}]
                                                             :model "card"}}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 789}]
                                                             :model "card"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document" :id "test-entity-id"}]}
          deps (serdes/dependencies document)]
      (is (contains? deps [{:model "Card" :id 789}]))
      (is (= 2 (count deps)))))) ; collection and one unique card

(deftest document-serdes-smartlink-empty-content-test
  (testing "empty document content"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content []}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document" :id "test-entity-id"}]}
          deps (serdes/dependencies document)]
      (is (= #{[{:model "Collection" :id 123}]}
             deps)))))

(deftest document-serdes-smartlink-missing-model-test
  (testing "smartLink with missing model is ignored"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 789}]}}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 456}]
                                                             :model "card"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document" :id "test-entity-id"}]}
          deps (serdes/dependencies document)]
      (is (contains? deps [{:model "Card" :id 456}]))
      (is (= 2 (count deps)))))) ; collection and one valid card

(deftest document-serdes-smartlink-nil-attrs-test
  (testing "smartLink with nil attrs is ignored"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "smartLink"
                                                     :attrs nil}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 456}]
                                                             :model "card"}}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document" :id "test-entity-id"}]}
          deps (serdes/dependencies document)]
      (is (contains? deps [{:model "Card" :id 456}]))
      (is (= 2 (count deps)))))) ; collection and one valid card

(deftest document-serdes-smartlink-mixed-content-test
  (testing "mix of smartLinks and other node types"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "paragraph"
                                          :content [{:type "text" :text "Check out this "}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Card" :id 789}]
                                                             :model "card"}}
                                                    {:type "text" :text " and this "}
                                                    {:type "smartLink"
                                                     :attrs {:entityId [{:model "Dashboard" :id 456}]
                                                             :model "dashboard"}}]}
                                         {:type "heading"
                                          :attrs {:level 2}
                                          :content [{:type "text" :text "Section with table"}]}
                                         {:type "table"
                                          :content [{:type "tableRow"
                                                     :content [{:type "tableCell"
                                                                :content [{:type "paragraph"
                                                                           :content [{:type "smartLink"
                                                                                      :attrs {:entityId [{:model "Table" :id 321}]
                                                                                              :model "table"}}]}]}]}]}]}
                    :content_type "application/json+vnd.prose-mirror"
                    :serdes/meta [{:model "Document" :id "test-entity-id"}]}
          deps (serdes/dependencies document)]
      (is (contains? deps [{:model "Card" :id 789}]))
      (is (contains? deps [{:model "Dashboard" :id 456}]))
      (is (contains? deps [{:model "Table" :id 321}]))
      (is (contains? deps [{:model "Collection" :id 123}]))
      (is (= 4 (count deps)))))) ; 3 smartLinks + collection

(deftest document-serdes-smartlink-non-prose-mirror-test
  (testing "non-prose-mirror content type documents don't extract smartLinks"
    (let [document {:collection_id 123
                    :creator_id 456
                    :document {:type "doc"
                               :content [{:type "smartLink"
                                          :attrs {:entityId [{:model "Card" :id 456}]
                                                  :model "card"}}]}
                    :content_type "application/json" ; Not prose-mirror
                    :serdes/meta [{:model "Document" :id "test-entity-id"}]}
          deps (serdes/dependencies document)]
      (is (contains? deps [{:model "Collection" :id 123}])))))

(deftest document-serdes-descendants-embedded-cards-test
  (testing "Document descendants includes embedded cards"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "cardEmbed"
                                                                            :attrs {:id 456}}
                                                                           {:type "cardEmbed"
                                                                            :attrs {:id 789}}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [descendants (serdes/descendants "Document" document-id {})]
        (is (= {["Card" 456] {"Document" document-id}
                ["Card" 789] {"Document" document-id}}
               descendants))))))

(deftest document-serdes-descendants-smart-links-test
  (testing "Document descendants includes smart links"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "smartLink"
                                                                            :attrs {:entityId 456
                                                                                    :model "card"}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 789
                                                                                    :model "dashboard"}}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [descendants (serdes/descendants "Document" document-id {})]
        (is (= {["Card" 456] {"Document" document-id}
                ["Dashboard" 789] {"Document" document-id}}
               descendants))))))

(deftest document-serdes-descendants-mixed-content-test
  (testing "Document descendants includes both embedded cards and smart links"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "cardEmbed"
                                                                            :attrs {:id 111}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 222
                                                                                    :model "card"}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 333
                                                                                    :model "table"}}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [descendants (serdes/descendants "Document" document-id {})]
        (is (= {["Card" 111] {"Document" document-id}
                ["Card" 222] {"Document" document-id}
                ["Table" 333] {"Document" document-id}}
               descendants))))))

(deftest document-serdes-descendants-empty-document-test
  (testing "Document descendants handles document with no embedded content"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "paragraph"
                                                                            :content [{:type "text" :text "Plain text only"}]}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [descendants (serdes/descendants "Document" document-id {})]
        (is (= {} descendants))))))

(deftest document-serdes-descendants-nonexistent-document-test
  (testing "Document descendants returns nil for non-existent document"
    (let [descendants (serdes/descendants "Document" 99999999 {})]
      (is (nil? descendants)))))

(deftest document-serdes-descendants-unknown-smart-link-model-test
  (testing "Document descendants ignores smart links with unknown model types"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "smartLink"
                                                                            :attrs {:entityId 456
                                                                                    :model "card"}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 789
                                                                                    :model "unknown-model"}}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [descendants (serdes/descendants "Document" document-id {})]
        ;; Should only include the known model type
        (is (= {["Card" 456] {"Document" document-id}}
               descendants))
        ;; Should not include unknown model
        (is (not (contains? descendants ["Unknown" 789])))))))

(deftest document-serdes-descendants-duplicate-references-test
  (testing "Document descendants handles duplicate references correctly"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "cardEmbed"
                                                                            :attrs {:id 456}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 456
                                                                                    :model "card"}}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [descendants (serdes/descendants "Document" document-id {})]
        ;; Should merge duplicate references - same card referenced twice
        (is (= {["Card" 456] {"Document" document-id}}
               descendants))
        ;; Should only have one entry for the card
        (is (= 1 (count descendants)))))))

(deftest document-serdes-descendants-non-prose-mirror-test
  (testing "Document descendants handles non-prose-mirror documents"
    (mt/with-temp [:model/Document {document-id :id} {:document {:some "other format"}
                                                      :content_type "application/json"}] ; Not prose-mirror
      (let [descendants (serdes/descendants "Document" document-id {})]
        (is (nil? descendants))))))

(deftest document-serdes-descendants-all-model-types-test
  (testing "Document descendants correctly maps all supported smart link model types"
    (mt/with-temp [:model/Document {document-id :id} {:document {:type "doc"
                                                                 :content [{:type "smartLink"
                                                                            :attrs {:entityId 111
                                                                                    :model "card"}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 222
                                                                                    :model "dashboard"}}
                                                                           {:type "smartLink"
                                                                            :attrs {:entityId 333
                                                                                    :model "table"}}]}
                                                      :content_type "application/json+vnd.prose-mirror"}]
      (let [descendants (serdes/descendants "Document" document-id {})]
        (is (= {["Card" 111] {"Document" document-id}
                ["Dashboard" 222] {"Document" document-id}
                ["Table" 333] {"Document" document-id}}
               descendants))
        ;; Verify all supported model types are included
        (is (contains? descendants ["Card" 111]))
        (is (contains? descendants ["Dashboard" 222]))
        (is (contains? descendants ["Table" 333]))))))
