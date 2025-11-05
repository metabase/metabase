(ns metabase-enterprise.metabot-v3.dummy-tools-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.dummy-tools :as dummy-tools]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest get-document-details-invalid-document-id-test
  (testing "returns error for invalid document-id"
    (is (= {:output "invalid document_id"} (dummy-tools/get-document-details {:document-id "invalid"})))
    (is (= {:output "invalid document_id"} (dummy-tools/get-document-details {:document-id nil})))
    (is (= {:output "invalid document_id"} (dummy-tools/get-document-details {:document-id 1.5})))))

(deftest get-document-details-valid-document-test
  (testing "returns document details for valid document-id"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Document {doc-id :id} {:name "Test Document"
                                                 :document "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Hello World\"}]}]}"
                                                 :collection_id coll-id
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (dummy-tools/get-document-details {:document-id doc-id})]
          (is (contains? result :structured-output))
          (let [doc-info (:structured-output result)]
            (is (= doc-id (:id doc-info)))
            (is (= "Test Document" (:name doc-info)))
            (is (= {:content [{:content [{:text "Hello World", :type "text"}], :type "paragraph"}], :type "doc"}
                   (:document doc-info)))))))))

(deftest get-document-details-nonexistent-document-test
  (testing "returns 'document not found' for non-existent document"
    (let [result (dummy-tools/get-document-details {:document-id 99999})]
      (is (= {:output "error fetching document: Not found."} result)))))

(deftest get-document-details-archived-document-test
  (testing "returns document details for archived document"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Document {doc-id :id} {:name "Archived Document"
                                                 :document "{\"type\":\"doc\",\"content\":[]}"
                                                 :collection_id coll-id
                                                 :creator_id (mt/user->id :crowberto)
                                                 :archived true}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (dummy-tools/get-document-details {:document-id doc-id})]
          (is (contains? result :structured-output))
          (let [doc-info (:structured-output result)]
            (is (= doc-id (:id doc-info)))
            (is (= "Archived Document" (:name doc-info)))
            (is (= {:content [], :type "doc"} (:document doc-info)))))))))

(deftest get-document-details-minimal-document-test
  (testing "returns document details for document with minimal fields"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Minimal Document"
                                                 :document "{\"type\":\"doc\"}"
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (dummy-tools/get-document-details {:document-id doc-id})]
          (is (contains? result :structured-output))
          (let [doc-info (:structured-output result)]
            (is (= doc-id (:id doc-info)))
            (is (= "Minimal Document" (:name doc-info)))
            (is (= {:type "doc"} (:document doc-info)))))))))

(deftest get-document-details-empty-document-content-test
  (testing "returns document details for document with empty content"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Empty Document"
                                                 :document ""
                                                 :creator_id (mt/user->id :crowberto)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (dummy-tools/get-document-details {:document-id doc-id})]
          (is (contains? result :structured-output))
          (let [doc-info (:structured-output result)]
            (is (= doc-id (:id doc-info)))
            (is (= "Empty Document" (:name doc-info)))
            (is (= nil (:document doc-info)))))))))

(deftest get-document-no-user-access
  (testing "does not return details if the user can't access the document"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Document {doc-id :id} {:name "Empty Document"
                                                   :document ""
                                                   :creator_id (mt/user->id :crowberto)}]
        (mt/with-current-user (mt/user->id :rasta)
          (is (= {:output "error fetching document: You don't have permissions to do that."}
                 (dummy-tools/get-document-details {:document-id doc-id}))))))))
