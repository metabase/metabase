(ns metabase-enterprise.documents.api.document-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest post-document-basic-creation-test
  (testing "POST /api/ee/document/ - basic document creation"
    (mt/with-model-cleanup [:model/Document]
      (let [result (mt/user-http-request :crowberto
                                         :post 200 "ee/document/" {:name "Document 1"
                                                                   :document "Doc 1"})
            document-row (t2/select-one :model/Document :id (:id result))]
        (is (partial= {:name "Document 1" :document "Doc 1"} result))
        (is (pos? (:id result)))
        (is (partial= {:name "Document 1" :document "Doc 1"} document-row))))))

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

(deftest put-document-basic-update-test
  (testing "PUT /api/ee/document/id - basic document update"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document "Initial Doc"}]
      (let [result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/document/%s" document-id) {:name "Document 2" :document "Doc 2"})]
        (is (partial= {:name "Document 2"
                       :document "Doc 2"} result))))))

(deftest put-document-reject-nonexistent-card-ids-test
  (testing "PUT /api/ee/document/id - should reject non-existent card-ids"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document "Initial Doc"}]
      (let [non-existent-id 999999]
        (is (=? {:message #"The following card IDs do not exist.*"}
                (mt/user-http-request :crowberto
                                      :put 404 (format "ee/document/%s" document-id)
                                      {:name "Document with Missing Cards"
                                       :document "Doc"
                                       :card_ids [non-existent-id]})))))))

(deftest put-document-reject-wrong-card-type-test
  (testing "PUT /api/ee/document/id - should reject cards with wrong type"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document "Initial Doc"}]
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
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document "Initial Doc"}]
      (let [result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/document/%s" document-id)
                                         {:name "Document with Empty Cards"
                                          :document "Doc with empty cards"
                                          :card_ids []})]
        (is (= document-id (:id result)))))))

(deftest put-document-transaction-rollback-test
  (testing "PUT /api/ee/document/id - transaction rollback when card update fails"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document "Initial Doc"}]
      (let [initial-document (t2/select-one :model/Document :id document-id)
            invalid-card-id 999999]
        (mt/user-http-request :crowberto
                              :put 404 (format "ee/document/%s" document-id)
                              {:name "Document That Should Rollback"
                               :document "Doc that should rollback"
                               :card_ids [invalid-card-id]})
              ;; Verify the document name wasn't updated
        (let [unchanged-document (t2/select-one :model/Document :id document-id)]
          (is (= (:name initial-document) (:name unchanged-document))))))))

(deftest put-document-nonexistent-document-test
  (testing "PUT /api/ee/document/id - should return 404 for non-existent document"
    (mt/user-http-request :crowberto
                          :put 404 "ee/document/99999" {:name "Non-existent Document" :document "Doc"})))

(deftest put-document-with-no-perms-test
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Document {document-id :id} {:collection_id coll-id
                                                    :name "Test Document"
                                                    :document "Doc 1"}]
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
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document "Doc 1"}]
      (testing "should get the document"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 (format "ee/document/%s" document-id))]
          (is (partial= {:name "Test Document"
                         :document "Doc 1"} result))
          result))
      (testing "should return 404 for non-existent document"
        (mt/user-http-request :crowberto
                              :get 404 "ee/document/99999")))))

(deftest get-documents-test
  (testing "GET /api/ee/document"
    (mt/with-temp [:model/Document {document1-id :id} {:name "Document 1"
                                                       :document "Initial Doc 1"}
                   :model/Document {document2-id :id} {:name "Document 2"
                                                       :document "Initial Doc 2"}]
      (testing "should get existing documents"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 "ee/document/")]
          (is (set/subset? #{"Document 1" "Document 2"} (set (map :name result))))
          (is (set/subset? #{"Initial Doc 1" "Initial Doc 2"} (set (map :document result))))
          result))))
  (testing "should return 404 for non-existent document"
    (mt/user-http-request :crowberto
                          :get 404 "ee/document/99999")))

(deftest document-collection-sync-integration-test
  (testing "End-to-end collection synchronization through API"
    (mt/with-temp [:model/Collection {old-collection-id :id} {:name "Old Collection"}
                   :model/Collection {new-collection-id :id} {:name "New Collection"}
                   :model/Document {document-id :id} {:collection_id old-collection-id
                                                      :name "Integration Test Document"
                                                      :document "Integration test doc"}]
      ;; Create cards associated with the document
      (mt/with-temp [:model/Card {card1-id :id} {:name "Integration Card 1"
                                                 :document_id document-id
                                                 :collection_id old-collection-id
                                                 :dataset_query (mt/mbql-query venues)}
                     :model/Card {card2-id :id} {:name "Integration Card 2"
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
                   :model/Document {document-id :id} {:collection_id collection1-id
                                                      :name "Permission Test Document"
                                                      :document "Permission test doc"}]
      ;; Create cards in the original collection
      (mt/with-temp [:model/Card {card-id :id} {:name "Permission Test Card"
                                                :document_id document-id
                                                :collection_id collection1-id
                                                :dataset_query (mt/mbql-query venues)}]

        (testing "regular user without permissions cannot move document"
          ;; Should fail with 403
          (mt/with-non-admin-groups-no-collection-perms collection1-id
            (mt/with-non-admin-groups-no-collection-perms collection2-id
              (mt/user-http-request user-id
                                    :put 403 (format "ee/document/%s" document-id)
                                    {:collection_id collection2-id})

                                                          ;; Verify nothing changed
              (is (= collection1-id (:collection_id (t2/select-one :model/Document :id document-id))))
              (is (= collection1-id (:collection_id (t2/select-one :model/Card :id card-id)))))))

        (testing "regular user without source permissions cannot move document"
          ;; Should fail with 403
          (mt/with-non-admin-groups-no-collection-perms collection1-id
            (mt/user-http-request user-id
                                  :put 403 (format "ee/document/%s" document-id)
                                  {:collection_id collection2-id})

            ;; Verify nothing changed
            (is (= collection1-id (:collection_id (t2/select-one :model/Document :id document-id))))
            (is (= collection1-id (:collection_id (t2/select-one :model/Card :id card-id))))))

        (testing "regular user without destination permissions cannot move document"
          ;; Should fail with 403
          (mt/with-non-admin-groups-no-collection-perms collection2-id
            (mt/user-http-request user-id
                                  :put 403 (format "ee/document/%s" document-id)
                                  {:collection_id collection2-id})

            ;; Verify nothing changed
            (is (= collection1-id (:collection_id (t2/select-one :model/Document :id document-id))))
            (is (= collection1-id (:collection_id (t2/select-one :model/Card :id card-id))))))

        (testing "moving to non-existent collection fails gracefully"
          (mt/user-http-request :crowberto
                                :put 400 (format "ee/document/%s" document-id)
                                {:collection_id 99999})

          ;; Verify nothing changed
          (is (= collection1-id (:collection_id (t2/select-one :model/Document :id document-id))))
          (is (= collection1-id (:collection_id (t2/select-one :model/Card :id card-id)))))))))
