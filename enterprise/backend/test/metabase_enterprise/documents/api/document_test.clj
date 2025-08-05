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

(deftest put-document-basic-update-test
  (testing "PUT /api/ee/document/id - basic document update"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document "Initial Doc"}]
      (let [result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/document/%s" document-id) {:name "Document 2" :document "Doc 2"})]
        (is (partial= {:name "Document 2"
                       :document "Doc 2"} result))))))

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

(deftest post-document-with-cards-to-create-test
  (testing "POST /api/ee/document/ - create document with new cards via cards"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {col-id :id} {}]
        (let [cards-to-create {-1 {:name "Generated Card 1"
                                   :type :question
                                   :dataset_query (mt/mbql-query venues)
                                   :display :table
                                   :visualization_settings {}}
                               -2 {:name "Generated Card 2"
                                   :type :question
                                   :dataset_query (mt/mbql-query users)
                                   :display :scalar
                                   :visualization_settings {}}}
              result (mt/user-http-request :crowberto
                                           :post 200 "ee/document/"
                                           {:name "Document with Generated Cards"
                                            :document {:type "doc"
                                                       :content [{:type "cardEmbed"
                                                                  :attrs {:id -1
                                                                          :name nil}},
                                                                 {:type "cardEmbed"
                                                                  :attrs {:id -2
                                                                          :name nil}}
                                                                 {:type "paragraph"}]}
                                            :collection_id col-id
                                            :cards cards-to-create})]

          (testing "should create document successfully"
            (is (pos? (:id result)))
            (is (= "Document with Generated Cards" (:name result))))

          (testing "should create cards with correct properties"
            (let [created-cards (t2/select :model/Card :document_id (:id result))
                  card1 (first (filter #(= "Generated Card 1" (:name %)) created-cards))
                  card2 (first (filter #(= "Generated Card 2" (:name %)) created-cards))]

              (testing "should have created exactly 2 cards"
                (is (= 2 (count created-cards))))

              (testing "card1 inherits document's collection_id"
                (is (some? card1))
                (is (= "Generated Card 1" (:name card1)))
                (is (= :question (:type card1)))
                (is (= (:id result) (:document_id card1)))
                (is (= col-id (:collection_id card1))))

              (testing "card2 uses explicit collection_id"
                (is (some? card2))
                (is (= "Generated Card 2" (:name card2)))
                (is (= :question (:type card2)))
                (is (= (:id result) (:document_id card2)))
                (is (= col-id (:collection_id card2))))

              (testing "should update the doc with the substituted card ids"
                (let [[card1-embed card2-embed] (get-in result [:document :content])]
                  (is (= (:id card1)
                         (get-in card1-embed [:attrs :id])))
                  (is (= (:id card2)
                         (get-in card2-embed [:attrs :id])))))))

          (testing "document should have correct properties"
            (let [document (t2/select-one :model/Document :id (:id result))]
              (is (= "Document with Generated Cards" (:name document)))
              (is (= col-id (:collection_id document))))))))))

(deftest post-document-with-empty-cards-to-create-test
  (testing "POST /api/ee/document/ - handle empty cards gracefully"
    (mt/with-model-cleanup [:model/Document]
      (let [result (mt/user-http-request :crowberto
                                         :post 200 "ee/document/"
                                         {:name "Document with Empty Cards To Create"
                                          :document "Doc with empty cards"
                                          :cards {}})]
        (is (pos? (:id result)))))))

(deftest post-document-with-nil-cards-to-create-test
  (testing "POST /api/ee/document/ - handle nil cards gracefully"
    (mt/with-model-cleanup [:model/Document]
      (let [result (mt/user-http-request :crowberto
                                         :post 200 "ee/document/"
                                         {:name "Document with Nil Cards To Create"
                                          :document "Doc with nil cards"
                                          :cards nil})]
        (is (pos? (:id result)))))))

(deftest put-document-with-cards-to-create-test
  (testing "PUT /api/ee/document/:id - update document with new cards via cards"
    (mt/with-temp [:model/Collection {col-id :id} {}
                   :model/Document {document-id :id} {:name "Test Document"
                                                      :document "Initial Doc"
                                                      :collection_id col-id}]
      (let [cards-to-create {-10 {:name "Updated Generated Card 1"
                                  :type :question
                                  :dataset_query (mt/mbql-query venues)
                                  :display :table
                                  :visualization_settings {}}
                             -20 {:name "Updated Generated Card 2"
                                  :type :question
                                  :dataset_query (mt/mbql-query users)
                                  :display :bar
                                  :visualization_settings {}}}
            result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/document/%s" document-id)
                                         {:name "Updated Document with Generated Cards"
                                          :document {:type "doc"
                                                     :content [{:type "cardEmbed"
                                                                :attrs {:id -10
                                                                        :name nil}},
                                                               {:type "cardEmbed"
                                                                :attrs {:id -20
                                                                        :name nil}}
                                                               {:type "paragraph"}]}
                                          :collection_id col-id
                                          :cards cards-to-create})]

        (testing "should update document successfully"
          (is (= document-id (:id result)))
          (is (= "Updated Document with Generated Cards" (:name result)))
          (is (= col-id (:collection_id result))))

        (testing "should create cards with correct properties"
          (let [created-cards (t2/select :model/Card :document_id document-id)
                card1 (first (filter #(= "Updated Generated Card 1" (:name %)) created-cards))
                card2 (first (filter #(= "Updated Generated Card 2" (:name %)) created-cards))]

            (testing "should have created exactly 2 cards"
              (is (= 2 (count created-cards))))

            (testing "card1 inherits document's updated collection_id"
              (is (some? card1))
              (is (= "Updated Generated Card 1" (:name card1)))
              (is (= :question (:type card1)))
              (is (= document-id (:document_id card1)))
              (is (= col-id (:collection_id card1))))

            (testing "card2 uses explicit collection_id"
              (is (some? card2))
              (is (= "Updated Generated Card 2" (:name card2)))
              (is (= :question (:type card2)))
              (is (= document-id (:document_id card2)))
              (is (= col-id (:collection_id card2))))

            (testing "should update the doc with the substituted card ids"
              (let [[card1-embed card2-embed] (get-in result [:document :content])]
                (is (= (:id card1)
                       (get-in card1-embed [:attrs :id])))
                (is (= (:id card2)
                       (get-in card2-embed [:attrs :id])))))))

        (testing "document should have updated properties"
          (let [document (t2/select-one :model/Document :id document-id)]
            (is (= "Updated Document with Generated Cards" (:name document)))
            (is (= col-id (:collection_id document)))))))))

(deftest cards-to-create-schema-validation-test
  (testing "POST /api/ee/document/ - cards schema validation"
    (mt/with-model-cleanup [:model/Document]
      (testing "should reject non-negative integer keys"
        (mt/user-http-request :crowberto
                              :post 400 "ee/document/"
                              {:name "Document with Invalid Keys"
                               :document "Doc"
                               :cards {1 {:name "Invalid Key Card"
                                          :type :question
                                          :dataset_query (mt/mbql-query venues)
                                          :display :table
                                          :visualization_settings {}}}}))

      (testing "should reject missing required card fields"
        (mt/user-http-request :crowberto
                              :post 400 "ee/document/"
                              {:name "Document with Invalid Card"
                               :document "Doc"
                               :cards {-1 {:name "Incomplete Card"}}})) ; missing required fields

      (testing "should reject non-map card data"
        (mt/user-http-request :crowberto
                              :post 400 "ee/document/"
                              {:name "Document with Invalid Card Data"
                               :document "Doc"
                               :cards {-1 "not a map"}})))))

(deftest cards-to-create-transaction-rollback-test
  (testing "POST /api/ee/document/ - transaction rollback on card creation failure"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (let [invalid-cards {-1 {:name "Card with Invalid Query"
                               :type :question
                               :dataset_query {:type :invalid-type} ; invalid query
                               :display :table
                               :visualization_settings {}}}]
        (mt/user-http-request :crowberto
                              :post 500 "ee/document/"
                              {:name "Document That Should Rollback"
                               :document "Doc that should rollback"
                               :cards invalid-cards})

        ;; Verify no document was created
        (is (zero? (t2/count :model/Document :name "Document That Should Rollback")))))))

(deftest put-document-cards-to-create-transaction-rollback-test
  (testing "PUT /api/ee/document/:id - transaction rollback on card creation failure"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document "Initial Doc"}]
      (let [initial-document (t2/select-one :model/Document :id document-id)
            invalid-cards {-1 {:name "Card with Invalid Query"
                               :type :question
                               :dataset_query {:type :invalid-type} ; invalid query
                               :display :table
                               :visualization_settings {}}}]

        (mt/user-http-request :crowberto
                              :put 500 (format "ee/document/%s" document-id)
                              {:name "Document That Should Rollback"
                               :document "Doc that should rollback"
                               :cards invalid-cards})

        ;; Verify document wasn't updated
        (let [unchanged-document (t2/select-one :model/Document :id document-id)]
          (is (= (:name initial-document) (:name unchanged-document)))
          (is (= (:document initial-document) (:document unchanged-document))))))))

(deftest cards-to-create-collection-inheritance-edge-cases-test
  (testing "Collection inheritance edge cases for cards"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (testing "cards inherit from document when document has nil collection_id"
        (let [cards-to-create {-1 {:name "Root Collection Card"
                                   :type :question
                                   :dataset_query (mt/mbql-query venues)
                                   :display :table
                                   :visualization_settings {}}}
              result (mt/user-http-request :crowberto
                                           :post 200 "ee/document/"
                                           {:name "Root Collection Document"
                                            :document "Doc in root collection"
                                            :collection_id nil
                                            :cards cards-to-create})]

          (let [created-cards (t2/select :model/Card :document_id (:id result))
                card (first created-cards)]
            (is (= 1 (count created-cards)))
            (is (nil? (:collection_id card))) ; should inherit nil from document
            (is (= (:id result) (:document_id card)))))))))
