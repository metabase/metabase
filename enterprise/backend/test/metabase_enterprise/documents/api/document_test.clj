(ns metabase-enterprise.documents.api.document-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f] (mt/with-premium-features #{:documents} (f))))

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

(deftest post-document-creation-non-blank-name-test
  (testing "POST /api/ee/document/ - basic document creation"
    (mt/with-model-cleanup [:model/Document]
      (is (=? {:errors {:name "value must be a non-blank string between 1 and 254 characters."}}
              (mt/user-http-request :crowberto
                                    :post 400 "ee/document/" {:name ""
                                                              :document (text->prose-mirror-ast "Doc 1")}))))))

(deftest post-document-creation-long-name-test
  (testing "POST /api/ee/document/id - basic document update"
    (is (=? {:errors {:name "value must be a non-blank string between 1 and 254 characters."}}
            (mt/user-http-request :crowberto
                                  :post 400 "ee/document"
                                  {:name (apply str (repeat 255 "c"))
                                   :document (text->prose-mirror-ast "Doc 1")})))))

(deftest put-document-basic-update-test
  (testing "PUT /api/ee/document/id - basic document update"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document (text->prose-mirror-ast "Initial Doc")}]
      (let [result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/document/%s" document-id) {:name "Document 2" :document (text->prose-mirror-ast "Doc 2")})]
        (is (partial= {:name "Document 2"
                       :document (text->prose-mirror-ast "Doc 2")} result))))))

(deftest put-document-update-non-blank-name-test
  (testing "PUT /api/ee/document/id - basic document update"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document (text->prose-mirror-ast "Initial Doc")}]
      (is (=? {:errors {:name "value must be a non-blank string between 1 and 254 characters."}}
              (mt/user-http-request :crowberto
                                    :put 400 (format "ee/document/%s" document-id)
                                    {:name ""
                                     :document (text->prose-mirror-ast "Doc 1")}))))))

(deftest put-document-update-long-name-test
  (testing "PUT /api/ee/document/id - basic document update"
    (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                      :document (text->prose-mirror-ast "Initial Doc")}]
      (is (=? {:errors {:name "value must be a non-blank string between 1 and 254 characters."}}
              (mt/user-http-request :crowberto
                                    :put 400 (format "ee/document/%s" document-id)
                                    {:name (apply str (repeat 255 "c"))
                                     :document (text->prose-mirror-ast "Doc 1")}))))))

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

(deftest get-document-test-requires-documents-feature
  (testing "GET /api/ee/document/id"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Document {document-id :id} {:name "Test Document"
                                                        :document (text->prose-mirror-ast "Doc 1")}]
        (testing "should not get the document"
          (mt/user-http-request :crowberto
                                :get 402 (format "ee/document/%s" document-id)))))))

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
        (let [result (:items (mt/user-http-request :crowberto
                                                   :get 200 "ee/document/"))]
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

(deftest post-document-cards-type-normalization-test
  (testing "POST /api/ee/document/ - normalizes card type from :model to :question and removes dashboard_id"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {col-id :id} {}
                     :model/Dashboard {dash-id :id} {:name "Test Dashboard"}]
        (let [cards-to-create {-1 {:name "Model Card"
                                   :type :model
                                   :dataset_query (mt/mbql-query venues)
                                   :display :table
                                   :visualization_settings {}
                                   :dashboard_id dash-id}}
              result (mt/user-http-request :crowberto
                                           :post 200 "ee/document/"
                                           {:name "Document with Model Card"
                                            :document {:type "doc"
                                                       :content [{:type "cardEmbed"
                                                                  :attrs {:id -1
                                                                          :name nil}}]}
                                            :collection_id col-id
                                            :cards cards-to-create})
              created-cards (t2/select :model/Card :document_id (:id result))
              card (first created-cards)]

          (testing "should create document successfully"
            (is (pos? (:id result)))
            (is (= "Document with Model Card" (:name result))))

          (testing "should normalize card type from :model to :question"
            (is (= 1 (count created-cards)))
            (is (= "Model Card" (:name card)))
            (is (= :question (:type card)))
            (is (not= :model (:type card))))

          (testing "should remove dashboard_id"
            (is (nil? (:dashboard_id card))))

          (testing "should preserve other card properties"
            (is (= (:id result) (:document_id card)))
            (is (= col-id (:collection_id card)))
            (is (= :table (:display card)))))))))

(deftest put-document-cards-type-normalization-test
  (testing "PUT /api/ee/document/:id - normalizes card type from :model to :question and removes dashboard_id"
    (mt/with-temp [:model/Collection {col-id :id} {}
                   :model/Document {document-id :id} {:name "Test Document"
                                                      :document (text->prose-mirror-ast "Initial Doc")
                                                      :collection_id col-id}
                   :model/Dashboard {dash-id :id} {:name "Test Dashboard"}]
      (let [cards-to-create {-10 {:name "Updated Model Card"
                                  :type :model
                                  :dataset_query (mt/mbql-query venues)
                                  :display :bar
                                  :visualization_settings {}
                                  :dashboard_id dash-id}}
            result (mt/user-http-request :crowberto
                                         :put 200 (format "ee/document/%s" document-id)
                                         {:name "Updated Document with Model Card"
                                          :document {:type "doc"
                                                     :content [{:type "cardEmbed"
                                                                :attrs {:id -10
                                                                        :name nil}}]}
                                          :collection_id col-id
                                          :cards cards-to-create})
            created-cards (t2/select :model/Card :document_id document-id)
            card (first created-cards)]

        (testing "should update document successfully"
          (is (= document-id (:id result)))
          (is (= "Updated Document with Model Card" (:name result))))

        (testing "should normalize card type from :model to :question"
          (is (= 1 (count created-cards)))
          (is (= "Updated Model Card" (:name card)))
          (is (= :question (:type card)))
          (is (not= :model (:type card))))

        (testing "should remove dashboard_id"
          (is (nil? (:dashboard_id card))))

        (testing "should preserve other card properties"
          (is (= document-id (:document_id card)))
          (is (= col-id (:collection_id card)))
          (is (= :bar (:display card))))))))

(deftest cards-type-normalization-mixed-types-test
  (testing "POST /api/ee/document/ - handles mixed card types correctly"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {col-id :id} {}
                     :model/Dashboard {dash-id :id} {:name "Test Dashboard"}]
        (let [cards-to-create {-1 {:name "Model Card"
                                   :type :model
                                   :dataset_query (mt/mbql-query venues)
                                   :display :table
                                   :visualization_settings {}
                                   :dashboard_id dash-id}
                               -2 {:name "Question Card"
                                   :type :question
                                   :dataset_query (mt/mbql-query users)
                                   :display :scalar
                                   :visualization_settings {}}}
              result (mt/user-http-request :crowberto
                                           :post 200 "ee/document/"
                                           {:name "Document with Mixed Card Types"
                                            :document {:type "doc"
                                                       :content [{:type "cardEmbed"
                                                                  :attrs {:id -1
                                                                          :name nil}}
                                                                 {:type "cardEmbed"
                                                                  :attrs {:id -2
                                                                          :name nil}}]}
                                            :collection_id col-id
                                            :cards cards-to-create})
              created-cards (t2/select :model/Card :document_id (:id result))
              model-card (first (filter #(= "Model Card" (:name %)) created-cards))
              question-card (first (filter #(= "Question Card" (:name %)) created-cards))]

          (testing "should create both cards"
            (is (= 2 (count created-cards)))
            (is (some? model-card))
            (is (some? question-card)))

          (testing "model card should be normalized to question type"
            (is (= :question (:type model-card)))
            (is (nil? (:dashboard_id model-card))))

          (testing "question card should remain unchanged"
            (is (= :question (:type question-card)))
            (is (nil? (:dashboard_id question-card)))))))))

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
                (let [associated-ids (set (keep #(get-in % [:attrs :id]) (get-in result [:document :content])))]
                  (is (= #{(:id (first cloned-cards))
                           (:id (second cloned-cards))}
                         associated-ids))))))

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
              (let [associated-ids (set (keep #(get-in % [:attrs :id]) (get-in result [:document :content])))]
                (is (= #{existing-card-in-doc
                         (:id cloned-card)}
                       associated-ids))))))))))

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
                    doc-names (set (map :name (:items result)))]
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

(deftest document-archive-basic-test
  (testing "PUT /api/ee/document/:id - basic document archiving"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Document {doc-id :id} {:name "Test Document"
                                                 :document (text->prose-mirror-ast "Test content")
                                                 :collection_id coll-id}]
      (testing "can archive document with archived=true"
        (let [result (mt/user-http-request :crowberto
                                           :put 200 (format "ee/document/%s" doc-id)
                                           {:archived true})]
          (is (true? (:archived result)))

            ;; Verify document is actually archived in database
          (is (true? (:archived (t2/select-one :model/Document :id doc-id))))))

      (testing "archived document doesn't appear in normal listings"
        (let [documents (mt/user-http-request :crowberto :get 200 "ee/document/")]
          (is (not (some #(= doc-id (:id %)) (:items documents))))))

      (testing "can unarchive document with archived=false"
        (let [result (mt/user-http-request :crowberto
                                           :put 200 (format "ee/document/%s" doc-id)
                                           {:archived false})]
          (is (false? (:archived result)))

            ;; Verify document is actually unarchived in database
          (is (false? (:archived (t2/select-one :model/Document :id doc-id)))))))))

(deftest document-archive-with-cards-test
  (testing "Document archiving includes associated cards"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Document {doc-id :id} {:name "Document with Cards"
                                                 :document (text->prose-mirror-ast "Doc with cards")
                                                 :collection_id coll-id}
                   :model/Card {card1-id :id} {:name "Associated Card 1"
                                               :document_id doc-id
                                               :collection_id coll-id
                                               :dataset_query (mt/mbql-query venues)}
                   :model/Card {card2-id :id} {:name "Associated Card 2"
                                               :document_id doc-id
                                               :collection_id coll-id
                                               :dataset_query (mt/mbql-query users)}
                   :model/Card {other-card-id :id} {:name "Other Card"
                                                    :collection_id coll-id
                                                    :dataset_query (mt/mbql-query venues)}]

      (testing "archiving document archives associated cards"
        (mt/user-http-request :crowberto
                              :put 200 (format "ee/document/%s" doc-id)
                              {:archived true})

          ;; Verify document is archived
        (is (true? (:archived (t2/select-one :model/Document :id doc-id))))

          ;; Verify associated cards are archived
        (is (true? (:archived (t2/select-one :model/Card :id card1-id))))
        (is (true? (:archived (t2/select-one :model/Card :id card2-id))))

          ;; Verify non-associated card is NOT archived
        (is (false? (:archived (t2/select-one :model/Card :id other-card-id)))))

      (testing "unarchiving document unarchives associated cards"
        (mt/user-http-request :crowberto
                              :put 200 (format "ee/document/%s" doc-id)
                              {:archived false})

          ;; Verify document is unarchived
        (is (false? (:archived (t2/select-one :model/Document :id doc-id))))

          ;; Verify associated cards are unarchived
        (is (false? (:archived (t2/select-one :model/Card :id card1-id))))
        (is (false? (:archived (t2/select-one :model/Card :id card2-id))))

          ;; Verify other card remains unchanged
        (is (false? (:archived (t2/select-one :model/Card :id other-card-id))))))))

(deftest document-archive-permissions-test
  (testing "Document archiving permission requirements"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {read-only-col :id} {}
                     :model/Collection {write-col :id} {}
                     :model/Document {read-only-doc-id :id} {:name "Read Only Document"
                                                             :document (text->prose-mirror-ast "Read only")
                                                             :collection_id read-only-col}
                     :model/Document {write-doc-id :id} {:name "Write Document"
                                                         :document (text->prose-mirror-ast "Writable")
                                                         :collection_id write-col}]

        (mt/with-group-for-user [group :rasta]
            ;; Grant read-only access to read-only collection
          (perms/grant-collection-read-permissions! group read-only-col)
            ;; Grant write access to write collection
          (perms/grant-collection-readwrite-permissions! group write-col)

          (testing "user with write permissions can archive document"
            (let [result (mt/user-http-request :rasta
                                               :put 200 (format "ee/document/%s" write-doc-id)
                                               {:archived true})]
              (is (true? (:archived result)))))

          (testing "user without write permissions cannot archive document"
            (mt/user-http-request :rasta
                                  :put 403 (format "ee/document/%s" read-only-doc-id)
                                  {:archived true})

              ;; Verify document wasn't archived
            (is (false? (:archived (t2/select-one :model/Document :id read-only-doc-id)))))

          (testing "user with write permissions can unarchive document"
            (let [result (mt/user-http-request :rasta
                                               :put 200 (format "ee/document/%s" write-doc-id)
                                               {:archived false})]
              (is (false? (:archived result))))))))))

(deftest collection-archive-includes-documents-test
  (testing "Collection archiving includes documents and associated cards"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Collection to Archive"}
                   :model/Document {doc1-id :id} {:name "Document 1"
                                                  :document (text->prose-mirror-ast "Doc 1")
                                                  :collection_id coll-id}
                   :model/Document {doc2-id :id} {:name "Document 2"
                                                  :document (text->prose-mirror-ast "Doc 2")
                                                  :collection_id coll-id}
                   :model/Card {card1-id :id} {:name "Associated Card 1"
                                               :document_id doc1-id
                                               :collection_id coll-id
                                               :dataset_query (mt/mbql-query venues)}
                   :model/Card {card2-id :id} {:name "Associated Card 2"
                                               :document_id doc2-id
                                               :collection_id coll-id
                                               :dataset_query (mt/mbql-query users)}
                   :model/Card {standalone-card-id :id} {:name "Standalone Card"
                                                         :collection_id coll-id
                                                         :dataset_query (mt/mbql-query venues)}]

      (testing "archiving collection archives documents and all cards"
        (mt/user-http-request :crowberto
                              :put 200 (format "collection/%s" coll-id)
                              {:archived true})

          ;; Verify collection is archived
        (is (true? (:archived (t2/select-one :model/Collection :id coll-id))))

          ;; Verify documents are archived (not directly)
        (is (true? (:archived (t2/select-one :model/Document :id doc1-id))))
        (is (false? (:archived_directly (t2/select-one :model/Document :id doc1-id))))
        (is (true? (:archived (t2/select-one :model/Document :id doc2-id))))
        (is (false? (:archived_directly (t2/select-one :model/Document :id doc2-id))))

          ;; Verify all cards are archived (not directly)
        (is (true? (:archived (t2/select-one :model/Card :id card1-id))))
        (is (false? (:archived_directly (t2/select-one :model/Card :id card1-id))))
        (is (true? (:archived (t2/select-one :model/Card :id card2-id))))
        (is (false? (:archived_directly (t2/select-one :model/Card :id card2-id))))
        (is (true? (:archived (t2/select-one :model/Card :id standalone-card-id))))
        (is (false? (:archived_directly (t2/select-one :model/Card :id standalone-card-id)))))

      (testing "unarchiving collection restores documents and cards"
        (mt/user-http-request :crowberto
                              :put 200 (format "collection/%s" coll-id)
                              {:archived false})

          ;; Verify collection is unarchived
        (is (false? (:archived (t2/select-one :model/Collection :id coll-id))))

          ;; Verify documents are unarchived
        (is (false? (:archived (t2/select-one :model/Document :id doc1-id))))
        (is (false? (:archived (t2/select-one :model/Document :id doc2-id))))

          ;; Verify cards are unarchived
        (is (false? (:archived (t2/select-one :model/Card :id card1-id))))
        (is (false? (:archived (t2/select-one :model/Card :id card2-id))))
        (is (false? (:archived (t2/select-one :model/Card :id standalone-card-id))))))))

(deftest document-archived-directly-flag-test
  (testing "Document archived_directly flag behavior"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Document {doc-id :id} {:name "Test Document"
                                                 :document (text->prose-mirror-ast "Test")
                                                 :collection_id coll-id}
                   :model/Card {card-id :id} {:name "Associated Card"
                                              :document_id doc-id
                                              :collection_id coll-id
                                              :dataset_query (mt/mbql-query venues)}]

      (testing "directly archiving document sets archived_directly=true"
        (mt/user-http-request :crowberto
                              :put 200 (format "ee/document/%s" doc-id)
                              {:archived true})

        (let [doc (t2/select-one :model/Document :id doc-id)
              card (t2/select-one :model/Card :id card-id)]
          (is (true? (:archived doc)))
          (is (true? (:archived_directly doc)))
          (is (true? (:archived card)))
          (is (true? (:archived_directly card)))))

      (testing "unarchiving directly archived document works"
        (mt/user-http-request :crowberto
                              :put 200 (format "ee/document/%s" doc-id)
                              {:archived false})

        (let [doc (t2/select-one :model/Document :id doc-id)
              card (t2/select-one :model/Card :id card-id)]
          (is (false? (:archived doc)))
          (is (false? (:archived_directly doc)))
          (is (false? (:archived card)))
          (is (false? (:archived_directly card)))))

        ;; Archive via collection to test indirect archiving
      (testing "indirectly archiving via collection sets archived_directly=false"
        (mt/user-http-request :crowberto
                              :put 200 (format "collection/%s" coll-id)
                              {:archived true})

        (let [doc (t2/select-one :model/Document :id doc-id)
              card (t2/select-one :model/Card :id card-id)]
          (is (true? (:archived doc)))
          (is (false? (:archived_directly doc)))
          (is (true? (:archived card)))
          (is (false? (:archived_directly card)))))

      (testing "directly archived documents stay archived when collection is unarchived"
          ;; First, directly archive the document
        (mt/user-http-request :crowberto
                              :put 200 (format "ee/document/%s" doc-id)
                              {:archived false})
        (mt/user-http-request :crowberto
                              :put 200 (format "ee/document/%s" doc-id)
                              {:archived true})

          ;; Then unarchive the collection
        (mt/user-http-request :crowberto
                              :put 200 (format "collection/%s" coll-id)
                              {:archived false})

          ;; Document should remain archived because it was archived directly
        (let [doc (t2/select-one :model/Document :id doc-id)
              card (t2/select-one :model/Card :id card-id)]
          (is (true? (:archived doc)))
          (is (true? (:archived_directly doc)))
          (is (true? (:archived card)))
          (is (true? (:archived_directly card))))))))

(deftest archived-documents-filtering-test
  (testing "Archived documents are properly filtered from various endpoints"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Document {active-doc-id :id} {:name "Active Document"
                                                        :document (text->prose-mirror-ast "Active")
                                                        :collection_id coll-id}
                   :model/Document {archived-doc-id :id} {:name "Archived Document"
                                                          :document (text->prose-mirror-ast "Archived")
                                                          :collection_id coll-id
                                                          :archived true}]

      (testing "GET /api/ee/document/ excludes archived documents"
        (let [documents (mt/user-http-request :crowberto :get 200 "ee/document/")
              document-names (set (map :name (:items documents)))]
          (is (contains? document-names "Active Document"))
          (is (not (contains? document-names "Archived Document")))))

      (testing "GET /api/ee/document/:id returns 200 for archived documents"
          ;; Active document should be accessible
        (mt/user-http-request :crowberto :get 200 (format "ee/document/%s" active-doc-id))

          ;; Archived document should return 404
        (mt/user-http-request :crowberto :get 200 (format "ee/document/%s" archived-doc-id)))

      (testing "Collection items endpoint excludes archived documents"
        (let [items (mt/user-http-request :crowberto :get 200 (format "collection/%s/items" coll-id))
              item-names (set (map :name (:data items)))]
          (is (contains? item-names "Active Document"))
          (is (not (contains? item-names "Archived Document"))))))))

(deftest document-archive-events-test
  (testing "Document archiving publishes appropriate events"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Event Test Document"
                                                 :document (text->prose-mirror-ast "Event test")}]

      (testing "archiving document publishes archive event"
        (mt/with-model-cleanup [:model/Document]
          (let [events (atom [])]
            (with-redefs [events/publish-event! (fn [topic event]
                                                  (swap! events conj {:topic topic :event event}))]
              (mt/user-http-request :crowberto
                                    :put 200 (format "ee/document/%s" doc-id)
                                    {:archived true})

                ;; Should have published document-archive event
              (is (some #(= :event/document-delete (:topic %)) @events))))))

      (testing "unarchiving document publishes update event"
        (mt/with-model-cleanup [:model/Document]
          (let [events (atom [])]
            (with-redefs [events/publish-event! (fn [topic event]
                                                  (swap! events conj {:topic topic :event event}))]
              (mt/user-http-request :crowberto
                                    :put 200 (format "ee/document/%s" doc-id)
                                    {:archived false})

                ;; Should have published document-update event (not archive event)
              (is (some #(= :event/document-update (:topic %)) @events))
              (is (not (some #(= :event/document-delete (:topic %)) @events))))))))))

(deftest document-archive-transaction-rollback-test
  (testing "Document archiving transaction rollback on failure"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Transaction Test Document"
                                                 :document (text->prose-mirror-ast "Transaction test")}
                   :model/Card {card-id :id} {:name "Associated Card"
                                              :document_id doc-id
                                              :dataset_query (mt/mbql-query venues)}]

        ;; Simulate a failure during card archiving
      (testing "failure during card archiving rolls back document archiving"
        (with-redefs [t2/update! (fn [model id updates]
                                   (if (and (= model :model/Card) (:archived updates))
                                     (throw (ex-info "Simulated card archive failure" {}))
                                     (t2/update! model id updates)))]
          (mt/user-http-request :crowberto
                                :put 500 (format "ee/document/%s" doc-id)
                                {:archived true})

            ;; Verify document wasn't archived due to rollback
          (is (false? (:archived (t2/select-one :model/Document :id doc-id))))
          (is (false? (:archived (t2/select-one :model/Card :id card-id)))))))))

(deftest document-archive-mixed-scenarios-test
  (testing "Mixed archiving scenarios - documents with different archival states"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Document {directly-archived-doc :id} {:name "Directly Archived Document"
                                                                :document (text->prose-mirror-ast "Direct")
                                                                :collection_id coll-id
                                                                :archived true
                                                                :archived_directly true}
                   :model/Document {collection-archived-doc :id} {:name "Collection Archived Document"
                                                                  :document (text->prose-mirror-ast "Collection")
                                                                  :collection_id coll-id
                                                                  :archived false
                                                                  :archived_directly false}
                   :model/Document {active-doc :id} {:name "Active Document"
                                                     :document (text->prose-mirror-ast "Active")
                                                     :collection_id coll-id}]

      (testing "unarchiving collection only restores collection-archived documents"
        (mt/user-http-request :crowberto
                              :put 200 (format "collection/%s" coll-id)
                              {:archived true})
        (mt/user-http-request :crowberto
                              :put 200 (format "collection/%s" coll-id)
                              {:archived false})

          ;; Directly archived document should remain archived
        (is (true? (:archived (t2/select-one :model/Document :id directly-archived-doc))))
        (is (true? (:archived_directly (t2/select-one :model/Document :id directly-archived-doc))))

          ;; Collection archived document should be unarchived
        (is (false? (:archived (t2/select-one :model/Document :id collection-archived-doc))))
        (is (false? (:archived_directly (t2/select-one :model/Document :id collection-archived-doc))))

          ;; Active document should remain active
        (is (false? (:archived (t2/select-one :model/Document :id active-doc))))))))

(deftest document-archive-edge-cases-test
  (testing "Document archiving edge cases"

    (testing "archiving already archived document is idempotent"
      (mt/with-temp [:model/Document {doc-id :id} {:name "Already Archived"
                                                   :document (text->prose-mirror-ast "Already archived")
                                                   :archived true
                                                   :archived_directly true}]
        (let [result (mt/user-http-request :crowberto
                                           :put 200 (format "ee/document/%s" doc-id)
                                           {:archived true})]
          (is (true? (:archived result)))
          (is (true? (:archived_directly (t2/select-one :model/Document :id doc-id)))))))

    (testing "unarchiving already active document is idempotent"
      (mt/with-temp [:model/Document {doc-id :id} {:name "Already Active"
                                                   :document (text->prose-mirror-ast "Already active")}]
        (let [result (mt/user-http-request :crowberto
                                           :put 200 (format "ee/document/%s" doc-id)
                                           {:archived false})]
          (is (false? (:archived result))))))

    (testing "archiving document in trash collection"
      (let [trash-collection-id (collection/trash-collection-id)]
        (mt/with-temp [:model/Document {doc-id :id} {:name "Document in Trash"
                                                     :document (text->prose-mirror-ast "In trash")
                                                     :collection_id trash-collection-id}]
            ;; Should be able to archive document in trash
          (let [result (mt/user-http-request :crowberto
                                             :put 200 (format "ee/document/%s" doc-id)
                                             {:archived true})]
            (is (true? (:archived result)))))))

    (testing "document with no associated cards"
      (mt/with-temp [:model/Document {doc-id :id} {:name "No Cards Document"
                                                   :document (text->prose-mirror-ast "No cards")}]
        (let [result (mt/user-http-request :crowberto
                                           :put 200 (format "ee/document/%s" doc-id)
                                           {:archived true})]
          (is (true? (:archived result)))
            ;; Should not fail even with no associated cards
          (is (zero? (t2/count :model/Card :document_id doc-id))))))

    (testing "archiving and updating other fields simultaneously"
      (mt/with-temp [:model/Document {doc-id :id} {:name "Original Name"
                                                   :document (text->prose-mirror-ast "Original")}]
        (let [result (mt/user-http-request :crowberto
                                           :put 200 (format "ee/document/%s" doc-id)
                                           {:archived true
                                            :name "Updated Name"
                                            :document (text->prose-mirror-ast "Updated content")})]
          (is (true? (:archived result)))
          (is (= "Updated Name" (:name result)))
          (is (= (text->prose-mirror-ast "Updated content") (:document result))))))))

(deftest delete-document-basic-test
  (testing "DELETE /api/ee/document/:id - basic document deletion"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Test Document"
                                                 :document (text->prose-mirror-ast "Test content")
                                                 :archived true}]
      (testing "can delete archived document"
        (mt/user-http-request :crowberto :delete (format "ee/document/%s" doc-id))

          ;; Verify document is actually deleted from database
        (is (nil? (t2/select-one :model/Document :id doc-id))))

      (testing "cannot delete same document twice"
        (mt/user-http-request :crowberto :delete 404 (format "ee/document/%s" doc-id))))))

(deftest delete-document-not-archived-test
  (testing "DELETE /api/ee/document/:id - cannot delete non-archived document"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Active Document"
                                                 :document (text->prose-mirror-ast "Active content")
                                                 :archived false}]
      (testing "returns 400 error when trying to delete non-archived document"
        (mt/user-http-request :crowberto :delete 400 (format "ee/document/%s" doc-id))

          ;; Verify document still exists
        (is (some? (t2/select-one :model/Document :id doc-id)))))))

(deftest delete-document-permissions-test
  (testing "DELETE /api/ee/document/:id - permission requirements"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {read-only-col :id} {}
                     :model/Collection {write-col :id} {}
                     :model/Document {read-only-doc-id :id} {:name "Read Only Document"
                                                             :document (text->prose-mirror-ast "Read only")
                                                             :collection_id read-only-col
                                                             :archived true}
                     :model/Document {write-doc-id :id} {:name "Write Document"
                                                         :document (text->prose-mirror-ast "Writable")
                                                         :collection_id write-col
                                                         :archived true}]

        (mt/with-group-for-user [group :rasta]
            ;; Grant read-only access to read-only collection
          (perms/grant-collection-read-permissions! group read-only-col)
            ;; Grant write access to write collection
          (perms/grant-collection-readwrite-permissions! group write-col)

          (testing "user with write permissions can delete archived document"
            (mt/user-http-request :rasta :delete (format "ee/document/%s" write-doc-id))

              ;; Verify document is deleted
            (is (nil? (t2/select-one :model/Document :id write-doc-id))))

          (testing "user without write permissions cannot delete archived document"
            (mt/user-http-request :rasta :delete 403 (format "ee/document/%s" read-only-doc-id))

              ;; Verify document still exists
            (is (some? (t2/select-one :model/Document :id read-only-doc-id)))))))))

(deftest delete-document-with-cards-test
  (testing "DELETE /api/ee/document/:id - deletes document with associated cards"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Document {doc-id :id} {:name "Document with Cards"
                                                 :document (text->prose-mirror-ast "Doc with cards")
                                                 :collection_id coll-id
                                                 :archived true}
                   :model/Card {card1-id :id} {:name "Associated Card 1"
                                               :document_id doc-id
                                               :collection_id coll-id
                                               :dataset_query (mt/mbql-query venues)
                                               :archived true}
                   :model/Card {card2-id :id} {:name "Associated Card 2"
                                               :document_id doc-id
                                               :collection_id coll-id
                                               :dataset_query (mt/mbql-query users)
                                               :archived true}
                   :model/Card {other-card-id :id} {:name "Other Card"
                                                    :collection_id coll-id
                                                    :dataset_query (mt/mbql-query venues)}]

      (testing "deleting document also deletes associated cards via cascade"
        (mt/user-http-request :crowberto :delete (format "ee/document/%s" doc-id))

          ;; Verify document is deleted
        (is (nil? (t2/select-one :model/Document :id doc-id)))

          ;; Verify associated cards are deleted (assuming CASCADE DELETE in schema)
        (is (nil? (t2/select-one :model/Card :id card1-id)))
        (is (nil? (t2/select-one :model/Card :id card2-id)))

          ;; Verify non-associated card still exists
        (is (some? (t2/select-one :model/Card :id other-card-id)))))))

(deftest delete-document-nonexistent-test
  (testing "DELETE /api/ee/document/:id - returns 404 for nonexistent document"
    (mt/user-http-request :crowberto :delete 404 "ee/document/999999")))

(deftest delete-document-events-test
  (testing "DELETE /api/ee/document/:id - publishes delete event"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Event Test Document"
                                                 :document (text->prose-mirror-ast "Event test")
                                                 :archived true}]
      (let [events (atom [])]
        (with-redefs [events/publish-event! (fn [topic event]
                                              (swap! events conj {:topic topic :event event}))]
          (mt/user-http-request :crowberto :delete 204 (format "ee/document/%s" doc-id))

            ;; Should have published document-delete event
          (is (some #(= :event/document-delete (:topic %)) @events))
          (let [delete-event (first (filter #(= :event/document-delete (:topic %)) @events))]
            (is (= "Event Test Document" (get-in delete-event [:event :object :name])))
            (is (= (mt/user->id :crowberto) (get-in delete-event [:event :user-id])))))))))

(deftest document-position-reconciliation-on-create-test
  (testing "Position reconciliation works for new documents via API"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Collection"}]
      ;; Create existing document with position 3 via API
      (let [existing-doc-result (mt/user-http-request :crowberto
                                                      :post 200 "ee/document/"
                                                      {:name "Existing Document"
                                                       :document (text->prose-mirror-ast "Existing doc")
                                                       :collection_id collection-id
                                                       :collection_position 3})
            existing-doc-id (:id existing-doc-result)]

        (testing "inserting document at existing position shifts others"
          ;; Insert new document at position 3 via API - should shift existing document
          (let [new-doc-result (mt/user-http-request :crowberto
                                                     :post 200 "ee/document/"
                                                     {:name "New Document"
                                                      :document (text->prose-mirror-ast "New doc")
                                                      :collection_id collection-id
                                                      :collection_position 3})]
            ;; New document should have position 3
            (is (= 3 (:collection_position new-doc-result)))

            ;; Existing document should be shifted to position 4
            (let [shifted-document (t2/select-one :model/Document :id existing-doc-id)]
              (is (= 4 (:collection_position shifted-document))))))

        (testing "inserting document without position works"
          (let [no-position-result (mt/user-http-request :crowberto
                                                         :post 200 "ee/document/"
                                                         {:name "No Position Document"
                                                          :document (text->prose-mirror-ast "No position doc")
                                                          :collection_id collection-id})]
            (is (nil? (:collection_position no-position-result)))))))))

(deftest document-position-reconciliation-on-update-test
  (testing "Position reconciliation works for document updates via API"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Collection"}]
      ;; Create documents with positions via API
      (let [doc1-result (mt/user-http-request :crowberto
                                              :post 200 "ee/document/"
                                              {:name "Document 1"
                                               :document (text->prose-mirror-ast "Doc 1")
                                               :collection_id collection-id
                                               :collection_position 1})
            doc2-result (mt/user-http-request :crowberto
                                              :post 200 "ee/document/"
                                              {:name "Document 2"
                                               :document (text->prose-mirror-ast "Doc 2")
                                               :collection_id collection-id
                                               :collection_position 2})
            doc3-result (mt/user-http-request :crowberto
                                              :post 200 "ee/document/"
                                              {:name "Document 3"
                                               :document (text->prose-mirror-ast "Doc 3")
                                               :collection_id collection-id
                                               :collection_position 3})
            doc1-id (:id doc1-result)
            doc2-id (:id doc2-result)
            doc3-id (:id doc3-result)]

        (testing "moving document to different position reconciles others"
          ;; Move document 3 to position 1 via API - should shift others
          (let [updated-doc3 (mt/user-http-request :crowberto
                                                   :put 200 (format "ee/document/%s" doc3-id)
                                                   {:collection_position 1})]
            ;; Document 3 should now be at position 1
            (is (= 1 (:collection_position updated-doc3)))

            ;; Check that other documents were shifted
            (let [doc1 (t2/select-one :model/Document :id doc1-id)
                  doc2 (t2/select-one :model/Document :id doc2-id)]
              ;; Original documents should be shifted
              (is (= 2 (:collection_position doc1)))
              (is (= 3 (:collection_position doc2))))))

        (testing "moving document to different collection reconciles both"
          (mt/with-temp [:model/Collection {other-collection-id :id} {:name "Other Collection"}]
            ;; Move document 1 to other collection at position 1 via API
            (let [moved-doc (mt/user-http-request :crowberto
                                                  :put 200 (format "ee/document/%s" doc1-id)
                                                  {:collection_id other-collection-id
                                                   :collection_position 1})]
              ;; Moved document should be in new collection at position 1
              (is (= other-collection-id (:collection_id moved-doc)))
              (is (= 1 (:collection_position moved-doc)))

              ;; Document 2 should be shifted down in original collection
              (let [doc2 (t2/select-one :model/Document :id doc2-id)]
                (is (= 2 (:collection_position doc2)))))))))))

(deftest document-collection-position-field-handling-test
  (testing "Document model supports collection_position field via API"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Collection"}]
      (testing "collection_position is stored and retrieved correctly"
        (let [document-result (mt/user-http-request :crowberto
                                                    :post 200 "ee/document/"
                                                    {:name "Positioned Document"
                                                     :document (text->prose-mirror-ast "Positioned doc")
                                                     :collection_id collection-id
                                                     :collection_position 5})]
          (is (= 5 (:collection_position document-result)))))

      (testing "collection_position can be updated"
        (let [document-result (mt/user-http-request :crowberto
                                                    :post 200 "ee/document/"
                                                    {:name "Update Position Document"
                                                     :document (text->prose-mirror-ast "Update position doc")
                                                     :collection_id collection-id
                                                     :collection_position 5})
              document-id (:id document-result)
              updated-result (mt/user-http-request :crowberto
                                                   :put 200 (format "ee/document/%s" document-id)
                                                   {:collection_position 10})]
          (is (= 10 (:collection_position updated-result)))))

      (testing "collection_position can be set to nil"
        (let [document-result (mt/user-http-request :crowberto
                                                    :post 200 "ee/document/"
                                                    {:name "Nil Position Document"
                                                     :document (text->prose-mirror-ast "Nil position doc")
                                                     :collection_id collection-id
                                                     :collection_position 5})
              document-id (:id document-result)
              updated-result (mt/user-http-request :crowberto
                                                   :put 200 (format "ee/document/%s" document-id)
                                                   {:collection_position nil})]
          (is (nil? (:collection_position updated-result))))))))
