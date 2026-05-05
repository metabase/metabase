(ns metabase.documents.recent-views-test
  (:require
   [clojure.test :refer :all]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.activity-feed.models.recent-views :as recent-views.model]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- most-recent-view
  [user-id model-id model-type]
  (t2/select-one [:model/RecentViews :user_id :model :model_id]
                 :user_id  user-id
                 :model_id model-id
                 :model    model-type
                 {:order-by [[:id :desc]]}))

(deftest card-query-test
  (mt/with-test-user :rasta
    (testing "document cards should not be counted"
      (mt/with-temp [:model/Document {doc-id :id} {}
                     :model/Card card-3 {:creator_id (mt/user->id :rasta)
                                         :document_id doc-id}]
        (events/publish-event! :event/card-query {:card-id (:id card-3)
                                                  :user-id (mt/user->id :rasta)
                                                  :context :question})
        (is (nil? (most-recent-view (mt/user->id :rasta) (:id card-3) "card")))))))

(deftest legacy-card-read-test
  (testing "in_document cards should not be counted even with context :question"
    (mt/with-temp [:model/Document {doc-id :id} {}
                   :model/Card card {:creator_id (mt/user->id :rasta)
                                     :document_id doc-id}]
      (mt/with-test-user :rasta
        (events/publish-event! :event/card-read {:object-id (:id card)
                                                 :user-id (mt/user->id :rasta)
                                                 :context :question})
        (is (nil? (most-recent-view (mt/user->id :rasta) (:id card) "card")))))))

(deftest select-documents-for-recents-empty-input-test
  (testing "returns empty vector when given empty document-ids"
    (is (= [] (#'recent-views.model/document-recents [])))
    (is (= [] (#'recent-views.model/document-recents nil)))))

(deftest select-documents-for-recents-with-collection-test
  (testing "returns documents with collection information"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"
                                                    :authority_level "official"
                                                    :archived false}
                   :model/Document {doc1-id :id} {:name "Document 1"
                                                  :collection_id coll-id
                                                  :archived false}
                   :model/Document {doc2-id :id} {:name "Document 2"
                                                  :collection_id coll-id
                                                  :archived false}]
      (let [results (#'recent-views.model/document-recents [doc1-id doc2-id])]
        (is (= 2 (count results)))

        ;; Check first document
        (let [doc1 (first (filter #(= (:id %) doc1-id) results))]
          (is (= "Document 1" (:name doc1)))
          (is (= false (:archived doc1)))
          (is (= coll-id (:entity-coll-id doc1)))
          (is (= coll-id (:collection_id doc1)))
          (is (= "Test Collection" (:collection_name doc1)))
          (is (= "official" (:collection_authority_level doc1))))

        ;; Check second document
        (let [doc2 (first (filter #(= (:id %) doc2-id) results))]
          (is (= "Document 2" (:name doc2)))
          (is (= false (:archived doc2))))))))

(deftest select-documents-for-recents-without-collection-test
  (testing "returns documents without collection when collection_id is nil"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Orphan Document"
                                                 :collection_id nil
                                                 :archived false}]
      (let [results (#'recent-views.model/document-recents [doc-id])]
        (is (= 1 (count results)))
        (let [doc (first results)]
          (is (= "Orphan Document" (:name doc)))
          (is (= false (:archived doc)))
          (is (nil? (:entity-coll-id doc)))
          (is (nil? (:collection_id doc)))
          (is (nil? (:collection_name doc)))
          (is (nil? (:collection_authority_level doc))))))))

(deftest select-documents-for-recents-archived-collections-test
  (testing "excludes documents from archived collections via left join"
    (mt/with-temp [:model/Collection {archived-coll-id :id} {:name "Archived Collection"
                                                             :authority_level "official"
                                                             :archived true}
                   :model/Collection {active-coll-id :id} {:name "Active Collection"
                                                           :authority_level "official"
                                                           :archived false}
                   :model/Document {doc1-id :id} {:name "Document in Archived Collection"
                                                  :collection_id archived-coll-id
                                                  :archived false}
                   :model/Document {doc2-id :id} {:name "Document in Active Collection"
                                                  :collection_id active-coll-id
                                                  :archived false}]
      (let [results (#'recent-views.model/document-recents [doc1-id doc2-id])]
        (is (= 2 (count results)))

        ;; Document from archived collection should have nil collection info
        (let [doc1 (first (filter #(= (:id %) doc1-id) results))]
          (is (= "Document in Archived Collection" (:name doc1)))
          (is (= archived-coll-id (:entity-coll-id doc1)))
          (is (nil? (:collection_id doc1)))
          (is (nil? (:collection_name doc1)))
          (is (nil? (:collection_authority_level doc1))))

        ;; Document from active collection should have collection info
        (let [doc2 (first (filter #(= (:id %) doc2-id) results))]
          (is (= "Document in Active Collection" (:name doc2)))
          (is (= active-coll-id (:entity-coll-id doc2)))
          (is (= active-coll-id (:collection_id doc2)))
          (is (= "Active Collection" (:collection_name doc2)))
          (is (= "official" (:collection_authority_level doc2))))))))

(deftest select-documents-for-recents-archived-documents-test
  (testing "includes archived documents in results"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"
                                                    :archived false}
                   :model/Document {doc-id :id} {:name "Archived Document"
                                                 :collection_id coll-id
                                                 :archived true}]
      (let [results (#'recent-views.model/document-recents [doc-id])]
        (is (= 1 (count results)))
        (let [doc (first results)]
          (is (= "Archived Document" (:name doc)))
          (is (true? (:archived doc))))))))

(deftest select-documents-for-recents-nonexistent-ids-test
  (testing "handles non-existent document IDs gracefully"
    (let [results (#'recent-views.model/document-recents [999999 888888])]
      (is (= [] results)))))

(deftest select-documents-for-recents-mixed-ids-test
  (testing "handles mixed existing and non-existing document IDs"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Existing Document"
                                                 :archived false}]
      (let [results (#'recent-views.model/document-recents [doc-id 999999])]
        (is (= 1 (count results)))
        (is (= "Existing Document" (:name (first results))))))))

(deftest select-documents-for-recents-duplicates-test
  (testing "preserves order and handles duplicates in document-ids"
    (mt/with-temp [:model/Document {doc1-id :id} {:name "Document 1" :archived false}
                   :model/Document {doc2-id :id} {:name "Document 2" :archived false}]
      (let [results (#'recent-views.model/document-recents [doc1-id doc2-id doc1-id])]
        ;; Should return unique documents even if IDs are duplicated
        (is (= 2 (count results)))
        (is (= #{doc1-id doc2-id} (set (map :id results)))))))

  (deftest recents-api-with-documents-premium-feature-test
    (testing "/recents API returns documents when :document premium feature is enabled"
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                     :model/Document {doc-id :id} {:name "Test Document"
                                                   :collection_id coll-id
                                                   :archived false}]
      ;; Add document to recent views
        (activity-feed/update-users-recent-views! (mt/user->id :rasta) :model/Document doc-id :view)

      ;; Call the API
        (let [response (mt/user-http-request :rasta :get 200 "activity/recents" :context [:views])]
          (is (some #(and (= (:model %) "document")
                          (= (:id %) doc-id)
                          (= (:name %) "Test Document"))
                    (:recents response))
              "Document should be present in recents when premium feature is enabled"))))))
