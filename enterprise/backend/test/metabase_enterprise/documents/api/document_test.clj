(ns metabase-enterprise.documents.api.document-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- text->prose-mirror-ast
  "Convert plain text to a ProseMirror AST structure."
  [text]
  {:type "doc"
   :content [{:type "paragraph"
              :content [{:type "text"
                         :text text}]}]})

(deftest post-document-basic-creation-test
  (testing "POST /api/ee/document/ - basic document creation"
    (mt/with-model-cleanup [:model/Document]
      (let [result (mt/user-http-request :crowberto
                                         :post 200 "ee/document/" {:name "Document 1"
                                                                   :document (text->prose-mirror-ast "Doc 1")})
            document-row (t2/select-one :model/Document :id (:id result))]
        (is (partial= {:name "Document 1" :document (text->prose-mirror-ast "Doc 1")} result))
        (is (pos? (:id result)))
        (is (partial= {:name "Document 1" :document (text->prose-mirror-ast "Doc 1")} document-row))))))

(deftest put-document-basic-update-test
  (testing "PUT /api/ee/document/id - basic document update"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document (text->prose-mirror-ast "Initial Doc")}]
      (let [result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/document/%s" document-id) {:name "Document 2" :document (text->prose-mirror-ast "Doc 2")})]
        (is (partial= {:name "Document 2"
                       :document (text->prose-mirror-ast "Doc 2")} result))))))

(deftest put-document-nonexistent-document-test
  (testing "PUT /api/ee/document/id - should return 404 for non-existent document"
    (mt/user-http-request :crowberto
                          :put 404 "ee/document/99999" {:name "Non-existent Document" :document (text->prose-mirror-ast "Doc")})))

(deftest put-document-with-no-perms-test
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Document {document-id :id} {:collection_id coll-id
                                                    :name "Test Document"
                                                    :document (text->prose-mirror-ast "Doc 1")}]
    (mt/with-non-admin-groups-no-collection-perms coll-id
      (mt/user-http-request :rasta :put 403 (str "ee/document/" document-id)
                            {:name "Meow"}))))

(deftest post-document-with-no-perms-test
  (mt/with-temp [:model/Collection {coll-id :id} {}]
    (mt/with-non-admin-groups-no-collection-perms coll-id
      (mt/user-http-request :rasta :post 403 "ee/document/"
                            {:name "Foo"
                             :document (text->prose-mirror-ast "Bar")
                             :collection_id coll-id}))))

(deftest get-document-test
  (testing "GET /api/ee/document/id"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document (text->prose-mirror-ast "Doc 1")}]
      (testing "should get the document"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 (format "ee/document/%s" document-id))]
          (is (partial= {:name "Test Document"
                         :document (text->prose-mirror-ast "Doc 1")} result))
          result))
      (testing "should return 404 for non-existent document"
        (mt/user-http-request :crowberto
                              :get 404 "ee/document/99999")))))

(deftest get-documents-test
  (testing "GET /api/ee/document"
    (mt/with-temp [:model/Document _ {:name "Document 1"
                                      :document (text->prose-mirror-ast "Initial Doc 1")}
                   :model/Document _ {:name "Document 2"
                                      :document (text->prose-mirror-ast "Initial Doc 2")}]
      (testing "should get existing documents"
        (let [result (mt/user-http-request :crowberto
                                           :get 200 "ee/document/")]
          (is (set/subset? #{"Document 1" "Document 2"} (set (map :name result))))
          (is (set/subset? #{(text->prose-mirror-ast "Initial Doc 1") (text->prose-mirror-ast "Initial Doc 2")} (set (map :document result))))
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
                                                      :document (text->prose-mirror-ast "Integration test doc")}]
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
                                                      :document (text->prose-mirror-ast "Permission test doc")}]
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
                                          :document (text->prose-mirror-ast "Doc with empty cards")
                                          :cards {}})]
        (is (pos? (:id result)))))))

(deftest post-document-with-nil-cards-to-create-test
  (testing "POST /api/ee/document/ - handle nil cards gracefully"
    (mt/with-model-cleanup [:model/Document]
      (let [result (mt/user-http-request :crowberto
                                         :post 200 "ee/document/"
                                         {:name "Document with Nil Cards To Create"
                                          :document (text->prose-mirror-ast "Doc with nil cards")
                                          :cards nil})]
        (is (pos? (:id result)))))))

(deftest put-document-with-cards-to-create-test
  (testing "PUT /api/ee/document/:id - update document with new cards via cards"
    (mt/with-temp [:model/Collection {col-id :id} {}
                   :model/Document {document-id :id} {:name "Test Document"
                                                      :document (text->prose-mirror-ast "Initial Doc")
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
                               :document (text->prose-mirror-ast "Doc")
                               :cards {1 {:name "Invalid Key Card"
                                          :type :question
                                          :dataset_query (mt/mbql-query venues)
                                          :display :table
                                          :visualization_settings {}}}}))

      (testing "should reject missing required card fields"
        (mt/user-http-request :crowberto
                              :post 400 "ee/document/"
                              {:name "Document with Invalid Card"
                               :document (text->prose-mirror-ast "Doc")
                               :cards {-1 {:name "Incomplete Card"}}})) ; missing required fields

      (testing "should reject non-map card data"
        (mt/user-http-request :crowberto
                              :post 400 "ee/document/"
                              {:name "Document with Invalid Card Data"
                               :document (text->prose-mirror-ast "Doc")
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
                              :post 403 "ee/document/"
                              {:name "Document That Should Rollback"
                               :document (text->prose-mirror-ast "Doc that should rollback")
                               :cards invalid-cards})

        ;; Verify no document was created
        (is (zero? (t2/count :model/Document :name "Document That Should Rollback")))))))

(deftest put-document-cards-to-create-transaction-rollback-test
  (testing "PUT /api/ee/document/:id - transaction rollback on card creation failure"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document (text->prose-mirror-ast "Initial Doc")}]
      (let [initial-document (t2/select-one :model/Document :id document-id)
            invalid-cards {-1 {:name "Card with Invalid Query"
                               :type :question
                               :dataset_query {:type :invalid-type} ; invalid query
                               :display :table
                               :visualization_settings {}}}]

        (mt/user-http-request :crowberto
                              :put 403 (format "ee/document/%s" document-id)
                              {:name "Document That Should Rollback"
                               :document (text->prose-mirror-ast "Doc that should rollback")
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
                                            :document (text->prose-mirror-ast "Doc in root collection")
                                            :collection_id nil
                                            :cards cards-to-create})
              created-cards (t2/select :model/Card :document_id (:id result))
              card (first created-cards)]

          (is (= 1 (count created-cards)))
          (is (nil? (:collection_id card))) ; should inherit nil from document
          (is (= (:id result) (:document_id card))))))))

(deftest post-document-clone-existing-cards-test
  (testing "POST /api/ee/document/ - clones existing cards and substitutes IDs in AST"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {col-id :id} {}
                     :model/Card {existing-card-1 :id} {:name "Existing Card 1"
                                                        :type :question
                                                        :dataset_query (mt/mbql-query venues)
                                                        :display :table
                                                        :visualization_settings {}}
                     :model/Card {existing-card-2 :id} {:name "Existing Card 2"
                                                        :type :question
                                                        :dataset_query (mt/mbql-query users)
                                                        :display :bar
                                                        :visualization_settings {}}]
        (let [result (mt/user-http-request :crowberto
                                           :post 200 "ee/document/"
                                           {:name "Document with Cloned Cards"
                                            :document {:type "doc"
                                                       :content [{:type "cardEmbed"
                                                                  :attrs {:id existing-card-1
                                                                          :name nil}}
                                                                 {:type "cardEmbed"
                                                                  :attrs {:id existing-card-2
                                                                          :name nil}}
                                                                 {:type "paragraph"}]}
                                            :collection_id col-id})]

          (testing "should create document successfully"
            (is (pos? (:id result)))
            (is (= "Document with Cloned Cards" (:name result))))

          (testing "should clone cards with correct properties"
            (let [cloned-cards (t2/select :model/Card :document_id (:id result))
                  cloned-card-1 (first (filter #(= "Existing Card 1" (:name %)) cloned-cards))
                  cloned-card-2 (first (filter #(= "Existing Card 2" (:name %)) cloned-cards))]

              (testing "should have created exactly 2 cloned cards"
                (is (= 2 (count cloned-cards))))

              (testing "cloned cards should not be the same as originals"
                (is (not= existing-card-1 (:id cloned-card-1)))
                (is (not= existing-card-2 (:id cloned-card-2))))

              (testing "cloned cards should have document_id set"
                (is (= (:id result) (:document_id cloned-card-1)))
                (is (= (:id result) (:document_id cloned-card-2))))

              (testing "cloned cards should inherit document's collection_id"
                (is (= col-id (:collection_id cloned-card-1)))
                (is (= col-id (:collection_id cloned-card-2))))

              (testing "should update the AST with cloned card IDs"
                (let [[card1-embed card2-embed] (get-in result [:document :content])]
                  (is (= (:id cloned-card-1)
                         (get-in card1-embed [:attrs :id])))
                  (is (= (:id cloned-card-2)
                         (get-in card2-embed [:attrs :id])))))))

          (testing "original cards should remain unchanged"
            (let [original-1 (t2/select-one :model/Card :id existing-card-1)
                  original-2 (t2/select-one :model/Card :id existing-card-2)]
              (is (nil? (:document_id original-1)))
              (is (nil? (:document_id original-2))))))))))

(deftest post-document-mixed-cloned-and-new-cards-test
  (testing "POST /api/ee/document/ - handles both cloned existing cards and new cards"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {col-id :id} {}
                     :model/Card {existing-card :id} {:name "Existing Card"
                                                      :type :question
                                                      :dataset_query (mt/mbql-query venues)
                                                      :display :table
                                                      :visualization_settings {}}]
        (let [result (mt/user-http-request :crowberto
                                           :post 200 "ee/document/"
                                           {:name "Document with Mixed Cards"
                                            :document {:type "doc"
                                                       :content [{:type "cardEmbed"
                                                                  :attrs {:id existing-card
                                                                          :name nil}}
                                                                 {:type "cardEmbed"
                                                                  :attrs {:id -1
                                                                          :name nil}}
                                                                 {:type "paragraph"}]}
                                            :collection_id col-id
                                            :cards {-1 {:name "New Card"
                                                        :type :question
                                                        :dataset_query (mt/mbql-query users)
                                                        :display :scalar
                                                        :visualization_settings {}}}})]

          (testing "should create document successfully"
            (is (pos? (:id result)))
            (is (= "Document with Mixed Cards" (:name result))))

          (testing "should handle both cloned and new cards"
            (let [all-cards (t2/select :model/Card :document_id (:id result))
                  cloned-card (first (filter #(= "Existing Card" (:name %)) all-cards))
                  new-card (first (filter #(= "New Card" (:name %)) all-cards))]

              (testing "should have created exactly 2 cards total"
                (is (= 2 (count all-cards))))

              (testing "cloned card should be different from original"
                (is (not= existing-card (:id cloned-card)))
                (is (= (:id result) (:document_id cloned-card))))

              (testing "new card should be created properly"
                (is (some? new-card))
                (is (= "New Card" (:name new-card)))
                (is (= (:id result) (:document_id new-card))))

              (testing "should update the AST with both cloned and new card IDs"
                (let [[cloned-embed new-embed] (get-in result [:document :content])]
                  (is (= (:id cloned-card)
                         (get-in cloned-embed [:attrs :id])))
                  (is (= (:id new-card)
                         (get-in new-embed [:attrs :id]))))))))))))

(deftest post-document-no-skip-already-associated-cards-test
  (testing "POST /api/ee/document/ - does not skip cloning cards already associated with a document"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {col-id :id} {}
                     :model/Document {other-doc-id :id} {:name "Other Document"
                                                         :document (text->prose-mirror-ast "Other Doc")
                                                         :collection_id col-id}
                     :model/Card {associated-card :id} {:name "Already Associated Card"
                                                        :type :question
                                                        :document_id other-doc-id
                                                        :dataset_query (mt/mbql-query venues)
                                                        :display :table
                                                        :visualization_settings {}}
                     :model/Card {unassociated-card :id} {:name "Unassociated Card"
                                                          :type :question
                                                          :dataset_query (mt/mbql-query users)
                                                          :display :bar
                                                          :visualization_settings {}}]
        (let [result (mt/user-http-request :crowberto
                                           :post 200 "ee/document/"
                                           {:name "Document with Mixed Association Cards"
                                            :document {:type "doc"
                                                       :content [{:type "cardEmbed"
                                                                  :attrs {:id associated-card
                                                                          :name nil}}
                                                                 {:type "cardEmbed"
                                                                  :attrs {:id unassociated-card
                                                                          :name nil}}
                                                                 {:type "paragraph"}]}
                                            :collection_id col-id})]

          (testing "should create document successfully"
            (is (pos? (:id result)))
            (is (= "Document with Mixed Association Cards" (:name result))))

          (testing "should clone cards"
            (let [cloned-cards (t2/select :model/Card :document_id (:id result))]

              (testing "should have cloned only 1 card"
                (is (= 2 (count cloned-cards))))

              (testing "should update AST correctly"
                (let [[associated-embed unassociated-embed] (get-in result [:document :content])]
                  (is (= (:id (first cloned-cards))
                         (get-in associated-embed [:attrs :id])))
                  (is (= (:id (second cloned-cards))
                         (get-in unassociated-embed [:attrs :id])))))))

          (testing "original associated card should remain with its document"
            (let [original-associated (t2/select-one :model/Card :id associated-card)]
              (is (= other-doc-id (:document_id original-associated))))))))))

(deftest document-clone-only-cards-not-already-in-document-test
  (testing "Cards already belonging to the current document are not cloned"
    (mt/with-temp [:model/Collection {col-id :id} {}
                   :model/Document {document-id :id} {:name "Test Document"
                                                      :document (text->prose-mirror-ast "Initial Doc")
                                                      :collection_id col-id}
                   :model/Card {existing-card-in-doc :id} {:name "Card Already in Document"
                                                           :type :question
                                                           :document_id document-id
                                                           :dataset_query (mt/mbql-query venues)
                                                           :display :table
                                                           :visualization_settings {}}
                   :model/Card {card-without-doc :id} {:name "Card Without Document"
                                                       :type :question
                                                       :dataset_query (mt/mbql-query users)
                                                       :display :bar
                                                       :visualization_settings {}}]
      ;; Update the document with both cards
      (let [result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/document/%s" document-id)
                                         {:document {:type "doc"
                                                     :content [{:type "cardEmbed"
                                                                :attrs {:id existing-card-in-doc
                                                                        :name nil}}
                                                               {:type "cardEmbed"
                                                                :attrs {:id card-without-doc
                                                                        :name nil}}
                                                               {:type "paragraph"}]}})]

        (testing "should update document successfully"
          (is (= document-id (:id result))))

        (testing "should only clone card not already in document"
          (let [cards-in-doc (t2/select :model/Card :document_id document-id)
                card-already-in-doc (first (filter #(= "Card Already in Document" (:name %)) cards-in-doc))
                cloned-card (first (filter #(= "Card Without Document" (:name %)) cards-in-doc))]

            (testing "should have exactly 2 cards - 1 original and 1 cloned"
              (is (= 2 (count cards-in-doc))))

            (testing "card already in document should not be cloned"
              (is (= existing-card-in-doc (:id card-already-in-doc))))

            (testing "card without document should be cloned"
              (is (not= card-without-doc (:id cloned-card)))
              (is (= "Card Without Document" (:name cloned-card))))

            (testing "should update AST correctly"
              (let [[existing-embed cloned-embed] (get-in result [:document :content])]
                ;; Card already in document should keep same ID
                (is (= existing-card-in-doc
                       (get-in existing-embed [:attrs :id])))
                ;; Card without document should have cloned ID
                (is (= (:id cloned-card)
                       (get-in cloned-embed [:attrs :id])))))))))))

(deftest put-document-clone-existing-cards-test
  (testing "PUT /api/ee/document/:id - clones existing cards and substitutes IDs in AST"
    (mt/with-temp [:model/Collection {col-id :id} {}
                   :model/Document {document-id :id} {:name "Test Document"
                                                      :document (text->prose-mirror-ast "Initial Doc")
                                                      :collection_id col-id}
                   :model/Card {existing-card-1 :id} {:name "Existing Card 1"
                                                      :type :question
                                                      :dataset_query (mt/mbql-query venues)
                                                      :display :table
                                                      :visualization_settings {}}
                   :model/Card {existing-card-2 :id} {:name "Existing Card 2"
                                                      :type :question
                                                      :dataset_query (mt/mbql-query users)
                                                      :display :bar
                                                      :visualization_settings {}}]
      (let [result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/document/%s" document-id)
                                         {:name "Updated Document with Cloned Cards"
                                          :document {:type "doc"
                                                     :content [{:type "cardEmbed"
                                                                :attrs {:id existing-card-1
                                                                        :name nil}}
                                                               {:type "cardEmbed"
                                                                :attrs {:id existing-card-2
                                                                        :name nil}}
                                                               {:type "paragraph"}]}})]

        (testing "should update document successfully"
          (is (= document-id (:id result)))
          (is (= "Updated Document with Cloned Cards" (:name result))))

        (testing "should clone cards with correct properties"
          (let [cloned-cards (t2/select :model/Card :document_id document-id)
                cloned-card-1 (first (filter #(= "Existing Card 1" (:name %)) cloned-cards))
                cloned-card-2 (first (filter #(= "Existing Card 2" (:name %)) cloned-cards))]

            (testing "should have created exactly 2 cloned cards"
              (is (= 2 (count cloned-cards))))

            (testing "cloned cards should not be the same as originals"
              (is (not= existing-card-1 (:id cloned-card-1)))
              (is (not= existing-card-2 (:id cloned-card-2))))

            (testing "cloned cards should have document_id set"
              (is (= document-id (:document_id cloned-card-1)))
              (is (= document-id (:document_id cloned-card-2))))

            (testing "should update the AST with cloned card IDs"
              (let [[card1-embed card2-embed] (get-in result [:document :content])]
                (is (= (:id cloned-card-1)
                       (get-in card1-embed [:attrs :id])))
                (is (= (:id cloned-card-2)
                       (get-in card2-embed [:attrs :id])))))))

        (testing "original cards should remain unchanged"
          (let [original-1 (t2/select-one :model/Card :id existing-card-1)
                original-2 (t2/select-one :model/Card :id existing-card-2)]
            (is (nil? (:document_id original-1)))
            (is (nil? (:document_id original-2)))))))))

(deftest put-document-mixed-cloned-and-new-cards-test
  (testing "PUT /api/ee/document/:id - handles both cloned existing cards and new cards"
    (mt/with-temp [:model/Collection {col-id :id} {}
                   :model/Document {document-id :id} {:name "Test Document"
                                                      :document (text->prose-mirror-ast "Initial Doc")
                                                      :collection_id col-id}
                   :model/Card {existing-card :id} {:name "Existing Card"
                                                    :type :question
                                                    :dataset_query (mt/mbql-query venues)
                                                    :display :table
                                                    :visualization_settings {}}]
      (let [result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/document/%s" document-id)
                                         {:name "Updated Document with Mixed Cards"
                                          :document {:type "doc"
                                                     :content [{:type "cardEmbed"
                                                                :attrs {:id existing-card
                                                                        :name nil}}
                                                               {:type "cardEmbed"
                                                                :attrs {:id -1
                                                                        :name nil}}
                                                               {:type "paragraph"}]}
                                          :cards {-1 {:name "New Card"
                                                      :type :question
                                                      :dataset_query (mt/mbql-query users)
                                                      :display :scalar
                                                      :visualization_settings {}}}})]

        (testing "should update document successfully"
          (is (= document-id (:id result)))
          (is (= "Updated Document with Mixed Cards" (:name result))))

        (testing "should handle both cloned and new cards"
          (let [all-cards (t2/select :model/Card :document_id document-id)
                cloned-card (first (filter #(= "Existing Card" (:name %)) all-cards))
                new-card (first (filter #(= "New Card" (:name %)) all-cards))]

            (testing "should have created exactly 2 cards total"
              (is (= 2 (count all-cards))))

            (testing "cloned card should be different from original"
              (is (not= existing-card (:id cloned-card)))
              (is (= document-id (:document_id cloned-card))))

            (testing "new card should be created properly"
              (is (some? new-card))
              (is (= "New Card" (:name new-card)))
              (is (= document-id (:document_id new-card))))

            (testing "should update the AST with both cloned and new card IDs"
              (let [[cloned-embed new-embed] (get-in result [:document :content])]
                (is (= (:id cloned-card)
                       (get-in cloned-embed [:attrs :id])))
                (is (= (:id new-card)
                       (get-in new-embed [:attrs :id])))))))))))

(deftest document-cloning-permissions-test
  (testing "Card cloning respects read permissions"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {restricted-col :id} {}
                     :model/Collection {allowed-col :id} {}
                     :model/Card {restricted-card :id} {:name "Restricted Card"
                                                        :type :question
                                                        :collection_id restricted-col
                                                        :dataset_query (mt/mbql-query venues)
                                                        :display :table
                                                        :visualization_settings {}}]
        (mt/with-non-admin-groups-no-collection-perms restricted-col
          (testing "user without read permissions cannot clone card"
            (mt/user-http-request :rasta
                                  :post 403 "ee/document/"
                                  {:name "Document with Restricted Card"
                                   :document {:type "doc"
                                              :content [{:type "cardEmbed"
                                                         :attrs {:id restricted-card
                                                                 :name nil}}]}
                                   :collection_id allowed-col})))))))

(deftest document-cloning-nested-ast-test
  (testing "POST /api/ee/document/ - handles card IDs in nested AST structures"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {col-id :id} {}
                     :model/Card {card-1 :id} {:name "Card 1"
                                               :type :question
                                               :dataset_query (mt/mbql-query venues)
                                               :display :table
                                               :visualization_settings {}}
                     :model/Card {card-2 :id} {:name "Card 2"
                                               :type :question
                                               :dataset_query (mt/mbql-query users)
                                               :display :bar
                                               :visualization_settings {}}]
        (let [result (mt/user-http-request :crowberto
                                           :post 200 "ee/document/"
                                           {:name "Document with Nested Cards"
                                            :document {:type "doc"
                                                       :content [{:type "bulletList"
                                                                  :content [{:type "listItem"
                                                                             :content [{:type "paragraph"
                                                                                        :content [{:type "text"
                                                                                                   :text "First item with card:"}]}
                                                                                       {:type "cardEmbed"
                                                                                        :attrs {:id card-1
                                                                                                :name nil}}]}
                                                                            {:type "listItem"
                                                                             :content [{:type "cardEmbed"
                                                                                        :attrs {:id card-2
                                                                                                :name nil}}]}]}
                                                                 {:type "paragraph"}]}
                                            :collection_id col-id})]

          (testing "should create document successfully"
            (is (pos? (:id result)))
            (is (= "Document with Nested Cards" (:name result))))

          (testing "should clone cards in nested structures"
            (let [cloned-cards (t2/select :model/Card :document_id (:id result))
                  cloned-card-1 (first (filter #(= "Card 1" (:name %)) cloned-cards))
                  cloned-card-2 (first (filter #(= "Card 2" (:name %)) cloned-cards))]

              (testing "should have created exactly 2 cloned cards"
                (is (= 2 (count cloned-cards))))

              (testing "should update nested AST with cloned card IDs"
                (let [bullet-list (first (get-in result [:document :content]))
                      [list-item-1 list-item-2] (:content bullet-list)
                      card-1-embed (second (:content list-item-1))
                      card-2-embed (first (:content list-item-2))]
                  (is (= (:id cloned-card-1)
                         (get-in card-1-embed [:attrs :id])))
                  (is (= (:id cloned-card-2)
                         (get-in card-2-embed [:attrs :id]))))))))))))

(deftest document-clone-cards-preserve-metadata-test
  (testing "Cloned cards preserve all metadata from original cards"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {col-id :id} {}
                     :model/Card {original-card :id} {:name "Complex Card"
                                                      :type :question
                                                      :dataset_query (mt/mbql-query venues
                                                                       {:filter [:= $price 3]
                                                                        :aggregation [[:count]]
                                                                        :breakout [$category_id]})
                                                      :display :bar
                                                      :visualization_settings {:graph.dimensions ["category_id"]
                                                                               :graph.metrics ["count"]}
                                                      :description "A complex card with metadata"
                                                      :cache_ttl 100
                                                      :parameters [{:id "abc123"
                                                                    :type "category"
                                                                    :target [:dimension [:field 10 nil]]
                                                                    :name "Category"
                                                                    :slug "category"}]}]
        (let [result (mt/user-http-request :crowberto
                                           :post 200 "ee/document/"
                                           {:name "Document with Complex Card"
                                            :document {:type "doc"
                                                       :content [{:type "cardEmbed"
                                                                  :attrs {:id original-card
                                                                          :name nil}}]}
                                            :collection_id col-id})
              cloned-cards (t2/select :model/Card :document_id (:id result))
              cloned-card (first cloned-cards)]

          (testing "cloned card preserves all metadata"
            (is (= "Complex Card" (:name cloned-card)))
            (is (= (:dataset_query (t2/select-one :model/Card :id original-card))
                   (:dataset_query cloned-card)))
            (is (= :bar (:display cloned-card)))
            (is (= {:graph.dimensions ["category_id"]
                    :graph.metrics ["count"]}
                   (:visualization_settings cloned-card)))
            (is (= "A complex card with metadata" (:description cloned-card)))
            (is (= 100 (:cache_ttl cloned-card)))
            (is (= [{:id "abc123"
                     :type :category
                     :target [:dimension [:field 10 nil]]
                     :name "Category"
                     :slug "category"}]
                   (:parameters cloned-card))))

          (testing "cloned card has new ID and document association"
            (is (not= original-card (:id cloned-card)))
            (is (= (:id result) (:document_id cloned-card)))
            (is (= col-id (:collection_id cloned-card)))))))))

(deftest document-cloning-idempotent-test
  (testing "Multiple updates with same cards don't create duplicate clones"
    (mt/with-temp [:model/Collection {col-id :id} {}
                   :model/Document {document-id :id} {:name "Test Document"
                                                      :document (text->prose-mirror-ast "Initial Doc")
                                                      :collection_id col-id}
                   :model/Card {existing-card :id} {:name "Existing Card"
                                                    :type :question
                                                    :dataset_query (mt/mbql-query venues)
                                                    :display :table
                                                    :visualization_settings {}}]
      ;; First update - should clone the card
      (mt/user-http-request :crowberto
                            :put 200 (format "ee/document/%s" document-id)
                            {:document {:type "doc"
                                        :content [{:type "cardEmbed"
                                                   :attrs {:id existing-card
                                                           :name nil}}]}})
      (let [first-cloned-cards (t2/select :model/Card :document_id document-id)
            first-cloned-id (:id (first first-cloned-cards))]

        (testing "first update creates one clone"
          (is (= 1 (count first-cloned-cards))))

        ;; Second update with the already-cloned card ID - should NOT create another clone
        (let [second-result (mt/user-http-request :crowberto
                                                  :put 200 (format "ee/document/%s" document-id)
                                                  {:document {:type "doc"
                                                              :content [{:type "cardEmbed"
                                                                         :attrs {:id first-cloned-id
                                                                                 :name nil}}]}})
              second-cloned-cards (t2/select :model/Card :document_id document-id)]

          (testing "second update doesn't create additional clones"
            (is (= 1 (count second-cloned-cards)))
            (is (= first-cloned-id (:id (first second-cloned-cards))))

            (testing "document AST remains with the same card ID"
              (let [card-embed (first (get-in second-result [:document :content]))]
                (is (= first-cloned-id (get-in card-embed [:attrs :id])))))))))))

(deftest rasta-document-create-permissions-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (testing "Document creation permissions for non-admin user :rasta"
      (mt/with-temp [:model/Collection {read-only-col :id} {:name "Read Only Collection"}
                     :model/Collection {write-col :id} {:name "Write Collection"}
                     :model/Collection {no-access-col :id} {:name "No Access Collection"}]

        ;; Set up permissions for :rasta user
        (mt/with-group-for-user [group :rasta {:name "Rasta Group"}]
          ;; Grant read-only access to read-only-col
          (perms/grant-collection-read-permissions! group read-only-col)
          ;; Grant write access to write-col
          (perms/grant-collection-readwrite-permissions! group write-col)
          ;; No permissions for no-access-col (implicitly)

          (testing "POST /api/ee/document/ - :rasta can create documents in collections with write access"
            (mt/with-model-cleanup [:model/Document]
              (let [result (mt/user-http-request :rasta
                                                 :post 200 "ee/document/"
                                                 {:name "Rasta's Document"
                                                  :document (text->prose-mirror-ast "Created by Rasta")
                                                  :collection_id write-col})]
                (is (pos? (:id result)))
                (is (= "Rasta's Document" (:name result)))
                (is (= write-col (:collection_id result))))))

          (testing "POST /api/ee/document/ - :rasta cannot create documents in read-only collections"
            (mt/user-http-request :rasta
                                  :post 403 "ee/document/"
                                  {:name "Should Fail"
                                   :document (text->prose-mirror-ast "Should not be created")
                                   :collection_id read-only-col}))

          (testing "POST /api/ee/document/ - :rasta cannot create documents in no-access collections"
            (mt/user-http-request :rasta
                                  :post 403 "ee/document/"
                                  {:name "Should Fail"
                                   :document (text->prose-mirror-ast "Should not be created")
                                   :collection_id no-access-col})))))))

(deftest rasta-document-update-permissions-test
  (testing "Document update permissions for non-admin user :rasta"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {read-only-col :id} {:name "Read Only Collection"}
                     :model/Collection {write-col :id} {:name "Write Collection"}
                     :model/Collection {no-access-col :id} {:name "No Access Collection"}]

        ;; Set up permissions for :rasta user
        (mt/with-group-for-user [group :rasta {:name "Rasta Group"}]
          ;; Grant read-only access to read-only-col
          (perms/grant-collection-read-permissions! group read-only-col)
          ;; Grant write access to write-col
          (perms/grant-collection-readwrite-permissions! group write-col)
          ;; No permissions for no-access-col (implicitly)

          (testing "PUT /api/ee/document/:id - :rasta can update documents in collections with write access"
            (mt/with-temp [:model/Document {doc-id :id} {:name "Original Document"
                                                         :document (text->prose-mirror-ast "Original content")
                                                         :collection_id write-col}]
              (let [result (mt/user-http-request :rasta
                                                 :put 200 (format "ee/document/%s" doc-id)
                                                 {:name "Updated by Rasta"
                                                  :document (text->prose-mirror-ast "Updated content")})]
                (is (= doc-id (:id result)))
                (is (= "Updated by Rasta" (:name result)))
                (is (= (text->prose-mirror-ast "Updated content") (:document result))))))

          (testing "PUT /api/ee/document/:id - :rasta cannot update documents in read-only collections"
            (mt/with-temp [:model/Document {doc-id :id} {:name "Read Only Document"
                                                         :document (text->prose-mirror-ast "Read only content")
                                                         :collection_id read-only-col}]
              (mt/user-http-request :rasta
                                    :put 403 (format "ee/document/%s" doc-id)
                                    {:name "Should not update"})))

          (testing "PUT /api/ee/document/:id - :rasta cannot update documents in no-access collections"
            (mt/with-temp [:model/Document {doc-id :id} {:name "No Access Document"
                                                         :document (text->prose-mirror-ast "No access content")
                                                         :collection_id no-access-col}]
              (mt/user-http-request :rasta
                                    :put 403 (format "ee/document/%s" doc-id)
                                    {:name "Should not update"}))))))))

(deftest rasta-document-move-permissions-test
  (testing "Document move permissions for non-admin user :rasta"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {read-only-col :id} {:name "Read Only Collection"}
                     :model/Collection {write-col :id} {:name "Write Collection"}
                     :model/Collection {destination-col :id} {:name "Destination Collection"}]

        ;; Set up permissions for :rasta user
        (mt/with-group-for-user [group :rasta {:name "Rasta Group"}]
          ;; Grant read-only access to read-only-col
          (perms/grant-collection-read-permissions! group read-only-col)
          ;; Grant write access to write-col
          (perms/grant-collection-readwrite-permissions! group write-col)
          ;; Grant write access to destination-col
          (perms/grant-collection-readwrite-permissions! group destination-col)

          (testing "PUT /api/ee/document/:id - :rasta can move documents between collections with write access to both"
            (mt/with-temp [:model/Document {doc-id :id} {:name "Document to Move"
                                                         :document (text->prose-mirror-ast "Moving document")
                                                         :collection_id write-col}]
              (let [result (mt/user-http-request :rasta
                                                 :put 200 (format "ee/document/%s" doc-id)
                                                 {:collection_id destination-col})]
                (is (= doc-id (:id result)))
                (is (= destination-col (:collection_id result)))
                ;; Verify document was actually moved
                (is (= destination-col (:collection_id (t2/select-one :model/Document :id doc-id)))))))

          (testing "PUT /api/ee/document/:id - :rasta cannot move documents from collections without write access"
            (mt/with-temp [:model/Document {doc-id :id} {:name "Cannot Move From Here"
                                                         :document (text->prose-mirror-ast "No permission to move")
                                                         :collection_id read-only-col}]
              (mt/user-http-request :rasta
                                    :put 403 (format "ee/document/%s" doc-id)
                                    {:collection_id destination-col})
              ;; Verify document wasn't moved
              (is (= read-only-col (:collection_id (t2/select-one :model/Document :id doc-id))))))

          (testing "PUT /api/ee/document/:id - :rasta cannot move documents to collections without write access"
            (mt/with-temp [:model/Document {doc-id :id} {:name "Cannot Move To There"
                                                         :document (text->prose-mirror-ast "No permission for destination")
                                                         :collection_id write-col}]
              (mt/user-http-request :rasta
                                    :put 403 (format "ee/document/%s" doc-id)
                                    {:collection_id read-only-col})
              ;; Verify document wasn't moved
              (is (= write-col (:collection_id (t2/select-one :model/Document :id doc-id)))))))))))

(deftest rasta-document-read-permissions-test
  (testing "Document read permissions for non-admin user :rasta"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {read-only-col :id} {:name "Read Only Collection"}
                     :model/Collection {write-col :id} {:name "Write Collection"}
                     :model/Collection {no-access-col :id} {:name "No Access Collection"}]

        ;; Set up permissions for :rasta user
        (mt/with-group-for-user [group :rasta {:name "Rasta Group"}]
          ;; Grant read-only access to read-only-col
          (perms/grant-collection-read-permissions! group read-only-col)
          ;; Grant write access to write-col
          (perms/grant-collection-readwrite-permissions! group write-col)
          ;; No permissions for no-access-col (implicitly)

          (testing "GET /api/ee/document/:id - :rasta can read documents from collections with write access"
            (mt/with-temp [:model/Document {doc-id :id} {:name "Write Access Document"
                                                         :document (text->prose-mirror-ast "Can read with write access")
                                                         :collection_id write-col}]
              (let [result (mt/user-http-request :rasta
                                                 :get 200 (format "ee/document/%s" doc-id))]
                (is (= "Write Access Document" (:name result)))
                (is (= (text->prose-mirror-ast "Can read with write access") (:document result)))
                (testing "includes can_write=true for collections with write access"
                  (is (true? (get result :can_write)))))))

          (testing "GET /api/ee/document/:id - :rasta can read documents from collections with read access"
            (mt/with-temp [:model/Document {doc-id :id} {:name "Read Access Document"
                                                         :document (text->prose-mirror-ast "Can read with read access")
                                                         :collection_id read-only-col}]
              (let [result (mt/user-http-request :rasta
                                                 :get 200 (format "ee/document/%s" doc-id))]
                (is (= "Read Access Document" (:name result)))
                (is (= (text->prose-mirror-ast "Can read with read access") (:document result)))
                (testing "includes can_write=false for collections with only read access"
                  (is (false? (get result :can_write)))))))

          (testing "GET /api/ee/document/:id - :rasta cannot read documents from collections without access"
            (mt/with-temp [:model/Document {doc-id :id} {:name "No Access Document"
                                                         :document (text->prose-mirror-ast "Cannot read this")
                                                         :collection_id no-access-col}]
              (mt/user-http-request :rasta
                                    :get 403 (format "ee/document/%s" doc-id)))))))))

(deftest rasta-document-list-permissions-test
  (testing "Document list permissions for non-admin user :rasta"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {read-only-col :id} {:name "Read Only Collection"}
                     :model/Collection {write-col :id} {:name "Write Collection"}
                     :model/Collection {no-access-col :id} {:name "No Access Collection"}]

        ;; Set up permissions for :rasta user
        (mt/with-group-for-user [group :rasta {:name "Rasta Group"}]
          ;; Grant read-only access to read-only-col
          (perms/grant-collection-read-permissions! group read-only-col)
          ;; Grant write access to write-col
          (perms/grant-collection-readwrite-permissions! group write-col)
          ;; No permissions for no-access-col (implicitly)

          (testing "GET /api/ee/document - :rasta only sees documents from accessible collections"
            (mt/with-temp [:model/Document _ {:name "Doc in Write Collection"
                                              :document (text->prose-mirror-ast "In write collection")
                                              :collection_id write-col}
                           :model/Document _ {:name "Doc in Read Collection"
                                              :document (text->prose-mirror-ast "In read collection")
                                              :collection_id read-only-col}
                           :model/Document _ {:name "Doc in No Access Collection"
                                              :document (text->prose-mirror-ast "In no access collection")
                                              :collection_id no-access-col}]
              (let [result (mt/user-http-request :rasta :get 200 "ee/document/")
                    doc-names (set (map :name result))]
                (testing "includes documents from write-access collections"
                  (is (contains? doc-names "Doc in Write Collection")))
                (testing "includes documents from read-access collections"
                  (is (contains? doc-names "Doc in Read Collection")))
                (testing "excludes documents from no-access collections"
                  (is (not (contains? doc-names "Doc in No Access Collection"))))
                (testing "each document includes can_write attribute"
                  (doseq [doc result]
                    (when (= "Doc in Write Collection" (:name doc))
                      (is (true? (get doc :can_write))))
                    (when (= "Doc in Read Collection" (:name doc))
                      (is (false? (get doc :can_write))))))))))))))
