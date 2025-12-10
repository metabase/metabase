(ns metabase.documents.revisions.impl-test
  "Unit tests for Document revision serialization and reversion functionality."
  (:require
   [clojure.test :refer :all]
   [metabase.documents.revisions.impl]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest serialize-instance-document-test
  (testing "Document revision serialization excludes metadata fields"
    (let [document {:id 123
                    :name "Test Document"
                    :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Hello World"}]}]}
                    :creator_id 456
                    :created_at #t "2023-01-01T00:00:00Z"
                    :updated_at #t "2023-01-02T00:00:00Z"
                    :collection_id 789
                    :archived false}
          serialized (revision/serialize-instance :model/Document 123 document)]
      (testing "includes Document-specific fields"
        (is (= "Test Document" (:name serialized)))
        (is (= {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Hello World"}]}]}
               (:document serialized)))
        (is (= false (:archived serialized))))
      (testing "excludes metadata fields"
        (is (not (contains? serialized :id)))
        (is (not (contains? serialized :creator_id)))
        (is (not (contains? serialized :created_at)))
        (is (not (contains? serialized :updated_at)))
        (is (not (contains? serialized :collection_id)))))))

(deftest serialize-instance-document-with-id-test
  (testing "Document revision serialization works with different IDs"
    (let [document {:id 123
                    :name "Test Document"
                    :document {:type "doc" :content []}
                    :creator_id 456
                    :created_at #t "2023-01-01T00:00:00Z"
                    :updated_at #t "2023-01-02T00:00:00Z"
                    :collection_id 789}]
      (testing "works with matching ID"
        (let [serialized (revision/serialize-instance :model/Document 123 document)]
          (is (= "Test Document" (:name serialized)))
          (is (not (contains? serialized :id)))))
      (testing "works with different ID"
        (let [serialized (revision/serialize-instance :model/Document 999 document)]
          (is (= "Test Document" (:name serialized)))
          (is (not (contains? serialized :id))))))))

(deftest serialize-instance-document-minimal-test
  (testing "Document revision serialization works with minimal document"
    (let [document {:id 1
                    :name "Minimal Doc"
                    :document {:type "doc"}
                    :creator_id 2
                    :created_at #t "2023-01-01T00:00:00Z"
                    :updated_at #t "2023-01-01T00:00:00Z"
                    :collection_id nil}
          serialized (revision/serialize-instance :model/Document 1 document)]
      (is (= "Minimal Doc" (:name serialized)))
      (is (= {:type "doc"} (:document serialized)))
      (is (nil? (:collection_id serialized)) "collection_id should be excluded even when nil")
      (is (not (contains? serialized :id)))
      (is (not (contains? serialized :creator_id))))))

(deftest revert-to-revision-document-test
  (testing "Document reversion uses default implementation"
    (mt/with-temp [:model/Document {doc-id :id, :as document} {:name "Original Document"
                                                               :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Original content"}]}]}
                                                               :creator_id (mt/user->id :crowberto)}]
      (let [original-serialized (revision/serialize-instance :model/Document doc-id document)
            _ (t2/update! :model/Document doc-id {:name "Updated Document"
                                                  :document {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Updated content"}]}]}})
            updated-document (t2/select-one :model/Document :id doc-id)]

        (testing "document was updated"
          (is (= "Updated Document" (:name updated-document)))
          (is (= {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Updated content"}]}]}
                 (:document updated-document))))

        (testing "reversion restores original state"
          (revision/revert-to-revision! :model/Document doc-id (mt/user->id :crowberto) original-serialized)
          (let [reverted-document (t2/select-one :model/Document :id doc-id)]
            (is (= "Original Document" (:name reverted-document)))
            (is (= {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "Original content"}]}]}
                   (:document reverted-document)))
            (testing "preserves metadata fields not in serialization"
              (is (= doc-id (:id reverted-document)))
              (is (= (mt/user->id :crowberto) (:creator_id reverted-document)))
              (is (:created_at reverted-document))
              (is (:updated_at reverted-document)))))))))

(deftest excluded-columns-test
  (testing "excluded columns constant contains expected fields"
    (let [excluded-columns @#'metabase.documents.revisions.impl/excluded-columns-for-document-revision]
      (is (contains? excluded-columns :id))
      (is (contains? excluded-columns :creator_id))
      (is (contains? excluded-columns :created_at))
      (is (contains? excluded-columns :updated_at))
      (is (contains? excluded-columns :collection_id))
      (is (contains? excluded-columns :collection_position))
      (is (= 8 (count excluded-columns)) "Should exclude exactly 5 metadata fields"))))
