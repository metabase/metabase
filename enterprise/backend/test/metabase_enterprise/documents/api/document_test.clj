(ns metabase-enterprise.documents.api.document-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.documents.api.document :as document-api]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest post-document-basic-creation-test
  (testing "POST /api/ee/document/ - basic document creation"
    (mt/with-model-cleanup [:model/Document]
      (let [result (mt/user-http-request :crowberto
                                         :post 200 "ee/document/" {:name "Document 1"
                                                                   :document "Doc 1"})
            document-row (t2/select-one :model/Document :id (:id result))
            document-doc-row (t2/select-one :model/DocumentVersion :document_id (:id document-row))]
        (is (partial= {:name "Document 1" :document "Doc 1"} result))
        (is (pos? (:id result)))

        (is (partial= {:name "Document 1"} document-row))
        (is (partial=
             {:document "Doc 1"
              :version_identifier 1}
             document-doc-row))))))

(deftest post-document-invalid-card-ids-test
  (testing "POST /api/ee/document/ - should reject invalid card-ids"
    (mt/with-model-cleanup [:model/Document]
      (testing "non-integer values"
        (mt/user-http-request :crowberto
                              :post 400 "ee/document/"
                              {:name "Document"
                               :document "Doc"
                               :card_ids ["invalid"]}))

      (testing "negative integers"
        (mt/user-http-request :crowberto
                              :post 400 "ee/document/"
                              {:name "Document"
                               :document "Doc"
                               :card_ids [-1 2]}))

      (testing "zero values"
        (mt/user-http-request :crowberto
                              :post 400 "ee/document/"
                              {:name "Document"
                               :document "Doc"
                               :card_ids [0 1]})))))

(deftest post-document-valid-card-association-test
  (testing "POST /api/ee/document/ - should associate valid :in_document cards with new document"
    (mt/with-model-cleanup [:model/Document]
      (mt/with-temp [:model/Card card1 {:name "Card 1"
                                        :type :in_document
                                        :dataset_query (mt/mbql-query venues)}
                     :model/Card card2 {:name "Card 2"
                                        :type :in_document
                                        :dataset_query (mt/mbql-query venues)}]
        (let [result (mt/user-http-request :crowberto
                                           :post 200 "ee/document/"
                                           {:name "Document with Valid Cards"
                                            :document "Doc with valid cards"
                                            :card_ids [(:id card1) (:id card2)]})
              updated-card1 (t2/select-one :model/Card :id (:id card1))
              updated-card2 (t2/select-one :model/Card :id (:id card2))]
          (is (pos? (:id result)))
          (is (= (:id result) (:document_id updated-card1)))
          (is (= (:id result) (:document_id updated-card2))))))))

(deftest post-document-nonexistent-card-ids-test
  (testing "POST /api/ee/document/ - should reject non-existent card-ids"
    (mt/with-model-cleanup [:model/Document]
      (let [non-existent-id 999999]
        (mt/user-http-request :crowberto
                              :post 404 "ee/document/"
                              {:name "Document with Missing Cards"
                               :document "Doc"
                               :card_ids [non-existent-id]})))))

(deftest post-document-wrong-card-type-test
  (testing "POST /api/ee/document/ - should reject cards with wrong type"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Card wrong-type-card {:name "Wrong Type Card"
                                                  :type :question
                                                  :dataset_query (mt/mbql-query venues)}]
        (is (=? {:message #"The following cards cannot be used in documents because they have the wrong type:.*"}
                (mt/user-http-request :crowberto
                                      :post 400 "ee/document/"
                                      {:name "Document with Wrong Type Cards"
                                       :document "Doc"
                                       :card_ids [(:id wrong-type-card)]})))))))

(deftest post-document-nil-card-ids-test
  (testing "POST /api/ee/document/ - should error on nil card-ids"
    (mt/with-model-cleanup [:model/Document]
      (mt/user-http-request :crowberto
                            :post 400 "ee/document/"
                            {:name "Document with Nil Cards"
                             :document "Doc with nil cards"
                             :card_ids nil}))))

(deftest post-document-empty-card-ids-test
  (testing "POST /api/ee/document/ - should handle empty card-ids gracefully"
    (mt/with-model-cleanup [:model/Document]
      (let [result (mt/user-http-request :crowberto
                                         :post 200 "ee/document/"
                                         {:name "Document with Empty Cards"
                                          :document "Doc with empty cards"
                                          :card_ids []})]
        (is (pos? (:id result)))))))

(deftest post-document-transaction-rollback-test
  (testing "POST /api/ee/document/ - transaction rollback when card update fails"
    (mt/with-model-cleanup [:model/Document :model/Card]
            ;; This test ensures that if card updates fail, the entire transaction is rolled back
      (mt/with-temp [:model/Card card {:name "Test Card"
                                       :type :in_document
                                       :dataset_query (mt/mbql-query venues)}]
              ;; Create a scenario where card update might fail by using a mixed set of valid and invalid cards
        (let [invalid-card-id 999999
              initial-documents-count (t2/count :model/Document)]
          (mt/user-http-request :crowberto
                                :post 404 "ee/document/"
                                {:name "Document That Should Rollback"
                                 :document "Doc"
                                 :card_ids [(:id card) invalid-card-id]})
                ;; Verify no new document was created due to rollback
          (is (= initial-documents-count (t2/count :model/Document)))
                ;; Verify the valid card wasn't updated
          (let [unchanged-card (t2/select-one :model/Card :id (:id card))]
            (is (nil? (:document_id unchanged-card)))))))))

(deftest put-document-basic-update-test
  (testing "PUT /api/ee/document/id - basic document update"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/DocumentVersion {version-id :id}
                   {:document_id document-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Document document-id {:current_version_id version-id})

      (let [result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/document/%s" document-id) {:name "Document 2" :document "Doc 2"})]
        (is (partial= {:name "Document 2"
                       :document "Doc 2"
                       :version 2} result))))))

(deftest put-document-associate-valid-cards-test
  (testing "PUT /api/ee/document/id - should associate valid :in_document cards with existing document"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/DocumentVersion {version-id :id}
                   {:document_id document-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Document document-id {:current_version_id version-id})

      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Card card1 {:name "Card 1"
                                          :type :in_document
                                          :dataset_query (mt/mbql-query venues)}
                       :model/Card card2 {:name "Card 2"
                                          :type :in_document
                                          :dataset_query (mt/mbql-query venues)}]
          (let [result (mt/user-http-request :crowberto
                                             :put 200 (format "ee/document/%s" document-id)
                                             {:name "Updated Document with Cards"
                                              :document "Updated doc with cards"
                                              :card_ids [(:id card1) (:id card2)]})
                updated-card1 (t2/select-one :model/Card :id (:id card1))
                updated-card2 (t2/select-one :model/Card :id (:id card2))]
            (is (= document-id (:id result)))
            (is (= document-id (:document_id updated-card1)))
            (is (= document-id (:document_id updated-card2)))))))))

(deftest put-document-clear-existing-card-associations-test
  (testing "PUT /api/ee/document/id - should clear existing card associations when updating with new cards"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/DocumentVersion {version-id :id}
                   {:document_id document-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Document document-id {:current_version_id version-id})

      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Card old-card {:name "Old Card"
                                             :type :in_document
                                             :document_id document-id
                                             :dataset_query (mt/mbql-query venues)}
                       :model/Card new-card {:name "New Card"
                                             :type :in_document
                                             :dataset_query (mt/mbql-query venues)}]
          (mt/user-http-request :crowberto
                                :put 200 (format "ee/document/%s" document-id)
                                {:card_ids [(:id new-card)]})
          (let [updated-old-card (t2/select-one :model/Card :id (:id old-card))
                updated-new-card (t2/select-one :model/Card :id (:id new-card))]
            (is (= document-id (:document_id updated-old-card)))
            (is (= document-id (:document_id updated-new-card)))))))))

(deftest put-document-reject-nonexistent-card-ids-test
  (testing "PUT /api/ee/document/id - should reject non-existent card-ids"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/DocumentVersion {version-id :id}
                   {:document_id document-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Document document-id {:current_version_id version-id})

      (let [non-existent-id 999999]
        (is (=? {:message #"The following card IDs do not exist.*"}
                (mt/user-http-request :crowberto
                                      :put 404 (format "ee/document/%s" document-id)
                                      {:name "Document with Missing Cards"
                                       :document "Doc"
                                       :card_ids [non-existent-id]})))))))

(deftest put-document-reject-wrong-card-type-test
  (testing "PUT /api/ee/document/id - should reject cards with wrong type"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/DocumentVersion {version-id :id}
                   {:document_id document-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Document document-id {:current_version_id version-id})

      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Card wrong-type-card {:name "Wrong Type Card"
                                                    :type :question
                                                    :dataset_query (mt/mbql-query venues)}]
          (is (=? {:message #"The following cards cannot be used in documents.*"}
                  (mt/user-http-request :crowberto
                                        :put 400 (format "ee/document/%s" document-id)
                                        {:name "Document with Wrong Type Cards"
                                         :document "Doc"
                                         :card_ids [(:id wrong-type-card)]}))))))))

(deftest put-document-handle-empty-card-ids-test
  (testing "PUT /api/ee/document/id - should handle empty card-ids gracefully"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/DocumentVersion {version-id :id}
                   {:document_id document-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Document document-id {:current_version_id version-id})

      (let [result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/document/%s" document-id)
                                         {:name "Document with Empty Cards"
                                          :document "Doc with empty cards"
                                          :card_ids []})]
        (is (= document-id (:id result)))))))

(deftest put-document-transaction-rollback-test
  (testing "PUT /api/ee/document/id - transaction rollback when card update fails"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/DocumentVersion {version-id :id}
                   {:document_id document-id
                    :document "Initial Doc"
                    :version_identifier 1}]
      (t2/update! :model/Document document-id {:current_version_id version-id})

      (let [initial-document (t2/select-one :model/Document :id document-id)
            invalid-card-id 999999
            initial-versions-count (t2/count :model/DocumentVersion :document_id document-id)]
        (mt/user-http-request :crowberto
                              :put 404 (format "ee/document/%s" document-id)
                              {:name "Document That Should Rollback"
                               :document "Doc that should rollback"
                               :card_ids [invalid-card-id]})
              ;; Verify no new document version was created due to rollback
        (is (= initial-versions-count (t2/count :model/DocumentVersion :document_id document-id)))
              ;; Verify the document name wasn't updated
        (let [unchanged-document (t2/select-one :model/Document :id document-id)]
          (is (= (:name initial-document) (:name unchanged-document))))))))

(deftest put-document-nonexistent-document-test
  (testing "PUT /api/ee/document/id - should return 404 for non-existent document"
    (mt/user-http-request :crowberto
                          :put 404 "ee/document/99999" {:name "Non-existent Document" :document "Doc"})))

(deftest put-document-with-no-perms-test
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Document {document-id :id} {:collection_id coll-id}
                 :model/DocumentVersion {version-id :id} {:document_id document-id
                                                          :document "Doc 1"
                                                          :version_identifier 1}]
    (t2/update! :model/Document document-id {:current_version_id version-id})
    (mt/with-non-admin-groups-no-collection-perms coll-id
      (mt/user-http-request :rasta :put 403 (str "ee/document/" document-id)
                            {:name "Meow"}))))

(deftest post-document-with-no-perms-test
  (mt/with-temp [:model/Collection {coll-id :id} {}]
    (mt/with-non-admin-groups-no-collection-perms coll-id
      (mt/user-http-request :rasta :post 403 "ee/document/"
                            {:name "Foo"
                             :document "Bar"
                             :collection_id coll-id}))))

(deftest get-document-test
  (testing "GET /api/ee/document/id"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/DocumentVersion {} {:document_id document-id
                                              :document "Doc 1"
                                              :version_identifier 1}
                   :model/DocumentVersion {version-id :id} {:document_id document-id
                                                            :document "Doc 2"
                                                            :version_identifier 2}]
      (t2/update! :model/Document document-id {:current_version_id version-id})

      (testing "should get the latest version when no version specified"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 (format "ee/document/%s" document-id))]
          (is (partial= {:name "Test Document"
                         :document "Doc 2"
                         :version 2} result))
          result))
      (testing "should get the 1st version when specified"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 (format "ee/document/%s?version=1" document-id))]
          (is (partial= {:name "Test Document"
                         :document "Doc 1"
                         :version 1} result))
          result))
      (testing "should get the 2nd version when specified"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 (format "ee/document/%s?version=2" document-id))]
          (is (partial= {:name "Test Document"
                         :document "Doc 2"
                         :version 2} result))
          result))
      (testing "should return 404 for non-existent document"
        (mt/user-http-request :crowberto
                              :get 404 "ee/document/99999"))
      (testing "should return 404 for non-existent document versions"
        (mt/user-http-request :crowberto
                              :get 404 (format "ee/document/%s?version=3" document-id))))))

(deftest get-documents-test
  (testing "GET /api/ee/document"
    (mt/with-temp [:model/Document {document1-id :id} {:name "Document 1"}
                   :model/Document {document2-id :id} {:name "Document 2"}
                   :model/DocumentVersion {version1-id :id} {:document_id document1-id
                                                             :document "Initial Doc 1"
                                                             :version_identifier 1}
                   :model/DocumentVersion {version2-id :id} {:document_id document2-id
                                                             :document "Initial Doc 2"
                                                             :version_identifier 1}]
      (t2/update! :model/Document document1-id {:current_version_id version1-id})
      (t2/update! :model/Document document2-id {:current_version_id version2-id})

      (testing "should get existing documents"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 "ee/document/")]
          (is (set/subset? #{"Document 1" "Document 2"} (set (map :name result))))
          (is (set/subset? #{"Initial Doc 1" "Initial Doc 2"} (set (map :document result))))
          result))))
  (testing "should return 404 for non-existent document"
    (mt/user-http-request :crowberto
                          :get 404 "ee/document/99999")))

(deftest get-document-versions-test
  (testing "GET /api/ee/document/:id/versions"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"}
                   :model/DocumentVersion {v1 :id} {:document_id document-id
                                                    :document "Doc 1"
                                                    :version_identifier 1
                                                    :parent_version_id nil}
                   :model/DocumentVersion {v2 :id} {:document_id document-id
                                                    :document "Doc 2"
                                                    :version_identifier 2
                                                    :parent_version_id v1}
                   :model/DocumentVersion {latest-version-id :id} {:document_id document-id
                                                                   :document "Doc 3"
                                                                   :version_identifier 3
                                                                   :parent_version_id v2}]
      (t2/update! :model/Document document-id {:current_version_id latest-version-id})

      (testing "should get all versions of a document"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 (format "ee/document/%s/versions" document-id))]
          (is (partial= [{:document "Doc 1" :version 1 :content_type "text/markdown" :parent_version_id nil}
                         {:document "Doc 2" :version 2 :content_type "text/markdown" :parent_version_id v1}
                         {:document "Doc 3" :version 3 :content_type "text/markdown" :parent_version_id v2}] result))
          result))
      (testing "should return 404 for non-existent document"
        (mt/user-http-request :crowberto
                              :get 404 "ee/document/99999/versions")))))

(deftest validate-cards-for-document-test
  (testing "validate-cards-for-document function"
    (let [validate-cards #'document-api/validate-cards-for-document]

      (testing "should pass with empty card list"
        (is (nil? (validate-cards []))))

      (testing "should pass with nil card list"
        (is (nil? (validate-cards nil))))

      (testing "should pass with valid :in_document cards"
        (mt/with-temp [:model/Card card1 {:name "Valid Card 1"
                                          :dataset_query (mt/mbql-query venues)
                                          :display :table
                                          :visualization_settings {}
                                          :type :in_document}
                       :model/Card card2 {:name "Valid Card 2"
                                          :dataset_query (mt/mbql-query venues)
                                          :display :table
                                          :visualization_settings {}
                                          :type :in_document}]
          (let [result (validate-cards [(:id card1) (:id card2)])]
            (is (= 2 (count result)))
            (is (every? #(= :in_document (:type %)) result))
            (is (= #{(:id card1) (:id card2)} (set (map :id result)))))))

      (testing "should fail with non-existent card ids"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"The following card IDs do not exist: \[999999\].*"
             (validate-cards [999999])))

        (let [ex (try (validate-cards [999999 888888])
                      (catch Exception e e))]
          (is (= 404 (:status-code (ex-data ex))))
          (is (= [999999 888888] (:missing-card-ids (ex-data ex))))))

      (testing "should fail with cards that don't have :in_document type"
        (mt/with-temp [:model/Card question-card {:name "Question Card"
                                                  :dataset_query (mt/mbql-query venues)
                                                  :display :table
                                                  :visualization_settings {}
                                                  :type :question}
                       :model/Card model-card {:name "Model Card"
                                               :dataset_query (mt/mbql-query venues)
                                               :display :table
                                               :visualization_settings {}
                                               :type :model}]
          (testing "single invalid card"
            (let [ex (try (validate-cards [(:id question-card)])
                          (catch Exception e e))]
              (is (= 400 (:status-code (ex-data ex))))
              (is (= [(:id question-card)] (mapv :id (:invalid-cards (ex-data ex)))))
              (is (= [:question] (mapv :type (:invalid-cards (ex-data ex)))))))

          (testing "multiple invalid cards"
            (let [ex (try (validate-cards [(:id question-card) (:id model-card)])
                          (catch Exception e e))]
              (is (= 400 (:status-code (ex-data ex))))
              (is (= #{(:id question-card) (:id model-card)}
                     (set (mapv :id (:invalid-cards (ex-data ex))))))))))

      (testing "should fail with mix of valid and invalid cards"
        (mt/with-temp [:model/Card valid-card {:name "Valid Card"
                                               :dataset_query (mt/mbql-query venues)
                                               :display :table
                                               :visualization_settings {}
                                               :type :in_document}
                       :model/Card invalid-card {:name "Invalid Card"
                                                 :dataset_query (mt/mbql-query venues)
                                                 :display :table
                                                 :visualization_settings {}
                                                 :type :question}]
          (let [ex (try (validate-cards [(:id valid-card) (:id invalid-card)])
                        (catch Exception e e))]
            (is (= 400 (:status-code (ex-data ex))))
            (is (= [(:id invalid-card)] (mapv :id (:invalid-cards (ex-data ex)))))))

        (testing "should handle partial missing cards"
          (mt/with-temp [:model/Card existing-card {:name "Existing Card"
                                                    :dataset_query (mt/mbql-query venues)
                                                    :display :table
                                                    :visualization_settings {}
                                                    :type :in_document}]
            (let [ex (try (validate-cards [(:id existing-card) 999999])
                          (catch Exception e e))]
              (is (= 404 (:status-code (ex-data ex))))
              (is (= [999999] (:missing-card-ids (ex-data ex)))))))))))

(deftest document-collection-sync-integration-test
  (testing "End-to-end collection synchronization through API"
    (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                   :model/Collection {new-collection-id :id} {:name "New Collection"}
                   :model/Document {document-id :id} {:collection_id old-collection-id :name "Integration Test Document"}
                   :model/DocumentVersion {version-id :id} {:document_id document-id
                                                            :document "Integration test doc"
                                                            :version_identifier 1}]
      (t2/update! :model/Document document-id {:current_version_id version-id})

      ;; Create cards associated with the document
      (mt/with-temp [:model/Card {card1-id :id} {:name "Integration Card 1"
                                                 :type :in_document
                                                 :document_id document-id
                                                 :collection_id old-collection-id
                                                 :dataset_query (mt/mbql-query venues)}
                     :model/Card {card2-id :id} {:name "Integration Card 2"
                                                 :type :in_document
                                                 :document_id document-id
                                                 :collection_id old-collection-id
                                                 :dataset_query (mt/mbql-query venues)}
                     ;; This card should NOT be affected (different type)
                     :model/Card {other-card-id :id} {:name "Other Card"
                                                      :type :question
                                                      :collection_id old-collection-id
                                                      :dataset_query (mt/mbql-query venues)}]

        (testing "PUT /api/ee/document/:id with collection change syncs cards"
          ;; Update document through API to move to new collection
          (let [response (mt/user-http-request :crowberto
                                               :put 200 (format "ee/document/%s" document-id)
                                               {:collection_id new-collection-id})]
            (is (= new-collection-id (:collection_id response)))

            ;; Verify document was moved
            (is (= new-collection-id (:collection_id (t2/select-one :model/Document :id document-id))))

            ;; Verify associated cards were moved
            (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id card1-id))))
            (is (= new-collection-id (:collection_id (t2/select-one :model/Card :id card2-id))))

            ;; Verify other card was NOT moved
            (is (= old-collection-id (:collection_id (t2/select-one :model/Card :id other-card-id))))))

        (testing "Moving to root collection (nil) works"
          (let [response (mt/user-http-request :crowberto
                                               :put 200 (format "ee/document/%s" document-id)
                                               {:collection_id nil})]
            (is (nil? (:collection_id response)))

            ;; Verify all associated cards moved to root
            (is (nil? (:collection_id (t2/select-one :model/Card :id card1-id))))
            (is (nil? (:collection_id (t2/select-one :model/Card :id card2-id))))

            ;; Other card should still be in old collection
            (is (= old-collection-id (:collection_id (t2/select-one :model/Card :id other-card-id))))))))))

(deftest api-permission-edge-cases-test
  (testing "API permission validation edge cases"
    (mt/with-temp [:model/User {user-id :id} {:first_name "Test" :last_name "User" :email "test@integration.com"}
                   :model/Collection {collection1-id :id} {:name "Permission Collection 1"}
                   :model/Collection {collection2-id :id} {:name "Permission Collection 2"}
                   :model/Document {document-id :id} {:collection_id collection1-id :name "Permission Test Document"}
                   :model/DocumentVersion {version-id :id} {:document_id document-id
                                                            :document "Permission test doc"
                                                            :version_identifier 1}]
      (t2/update! :model/Document document-id {:current_version_id version-id})

      ;; Create cards in the original collection
      (mt/with-temp [:model/Card {card-id :id} {:name "Permission Test Card"
                                                :type :in_document
                                                :document_id document-id
                                                :collection_id collection1-id
                                                :dataset_query (mt/mbql-query venues)}]

        (testing "regular user without permissions cannot move document"
          ;; Should fail with 403
          (mt/user-http-request user-id
                                :put 403 (format "ee/document/%s" document-id)
                                {:collection_id collection2-id})

          ;; Verify nothing changed
          (is (= collection1-id (:collection_id (t2/select-one :model/Document :id document-id))))
          (is (= collection1-id (:collection_id (t2/select-one :model/Card :id card-id)))))

        (testing "moving to non-existent collection fails gracefully"
          (mt/user-http-request :crowberto
                                :put 400 (format "ee/document/%s" document-id)
                                {:collection_id 99999})

          ;; Verify nothing changed
          (is (= collection1-id (:collection_id (t2/select-one :model/Document :id document-id))))
          (is (= collection1-id (:collection_id (t2/select-one :model/Card :id card-id)))))))))
