(ns metabase.public-sharing-rest.api-documents-test
  "Tests for public sharing endpoints for Documents.

  These tests verify that public document endpoints work correctly."
  (:require
   [clojure.test :refer :all]
   [metabase.documents.test-util :as documents.test-util]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- document-with-public-link
  "Create test Document data including a public UUID and made_public_by_id."
  [overrides]
  (merge {:name "Test Document"
          :document (documents.test-util/text->prose-mirror-ast "Test content")
          :public_uuid (str (random-uuid))
          :made_public_by_id (mt/user->id :crowberto)}
         overrides))

;;; ---------------------------------------- Unauthenticated Access -------------------------------------------------------

(deftest unauthenticated-public-document-access-test
  (testing "Public document endpoints should work without authentication"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Document document (document-with-public-link {:name "Unauthenticated Test Document"
                                                                          :document (documents.test-util/text->prose-mirror-ast "Public content")})]
        (testing "Can access public document without authentication at /api/public/document"
          (let [response (mt/client-full-response :get (str "public/document/" (:public_uuid document)))]
            (is (= 200 (:status response))
                "Should return 200 OK for public document without auth")
            (is (contains? (:body response) :name)
                "Should return document data in response body")))))))

;;; ---------------------------------------- GET /api/public/document/:uuid ----------------------------------------------

(deftest fetch-public-document-test
  (testing "GET /api/public/document/:uuid"
    (testing "Can fetch a public Document via EE public sharing routes"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp [:model/Document document (document-with-public-link {:name "Public Test Document"
                                                                            :document (documents.test-util/text->prose-mirror-ast "Public test content")})]
          (is (partial= {:name "Public Test Document"
                         :document (documents.test-util/text->prose-mirror-ast "Public test content")
                         :id (:id document)}
                        (mt/client :get 200 (str "public/document/" (:public_uuid document))))))))))

(deftest public-document-returns-only-safe-fields-test
  (testing "GET /api/public/document/:uuid should only return safe fields"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Document document (document-with-public-link {:name "Public Test Document"
                                                                          :document (documents.test-util/text->prose-mirror-ast "Public test content")})]
        (let [result (mt/client :get 200 (str "public/document/" (:public_uuid document)))]
          (testing "Should include safe fields"
            (is (contains? result :id))
            (is (contains? result :name))
            (is (contains? result :document))
            (is (contains? result :created_at))
            (is (contains? result :updated_at)))
          (testing "Should not include sensitive fields"
            (is (not (contains? result :public_uuid)))
            (is (not (contains? result :made_public_by_id)))
            (is (not (contains? result :collection_id)))))))))

(deftest public-document-hydrates-cards-test
  (testing "GET /api/public/document/:uuid hydrates cards for public access"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Document document (document-with-public-link {:name "Document with Cards"})
                     :model/Card {card1-id :id} {:name "Card 1"
                                                 :dataset_query (mt/mbql-query venues {:limit 5})
                                                 :document_id (:id document)}
                     :model/Card {card2-id :id} {:name "Card 2"
                                                 :dataset_query (mt/mbql-query venues {:limit 10})
                                                 :document_id (:id document)}]
        (let [result (mt/client :get 200 (str "public/document/" (:public_uuid document)))]
          (testing "response includes cards field"
            (is (contains? result :cards)))

          (testing "cards are returned as a map keyed by card ID"
            (is (map? (:cards result)))
            (is (= 2 (count (:cards result))))
            (is (contains? (:cards result) card1-id))
            (is (contains? (:cards result) card2-id)))

          (testing "cards contain expected metadata"
            (is (= "Card 1" (get-in result [:cards card1-id :name])))
            (is (= "Card 2" (get-in result [:cards card2-id :name])))
            (is (= card1-id (get-in result [:cards card1-id :id])))
            (is (= card2-id (get-in result [:cards card2-id :id]))))

          (testing "cards do not include sensitive fields"
            (is (not (contains? (get-in result [:cards card1-id]) :collection_id)))
            (is (not (contains? (get-in result [:cards card1-id]) :creator_id)))))))))

(deftest get-public-document-errors-test
  (testing "GET /api/public/document/:uuid"
    (testing "Cannot fetch a public Document if public sharing is disabled"
      (mt/with-temporary-setting-values [enable-public-sharing false]
        (mt/with-temp [:model/Document document (document-with-public-link {})]
          (is (= "API endpoint does not exist."
                 (mt/client :get 404 (str "public/document/" (:public_uuid document)))))))))

  (testing "Returns 404 if the Document doesn't exist"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (is (= "Not found."
             (mt/client :get 404 (str "public/document/" (random-uuid))))))))

(deftest public-document-not-accessible-when-archived-test
  (testing "GET /api/public/document/:uuid should not work for archived documents"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Document document (document-with-public-link {})]
        (let [uuid (:public_uuid document)]
          (testing "Document is accessible when not archived"
            (is (= 200
                   (:status (mt/client-full-response :get (str "public/document/" uuid))))))
          (testing "Document is not accessible after archiving"
            (t2/update! :model/Document (:id document) {:archived true})
            (is (= "Not found."
                   (mt/client :get 404 (str "public/document/" uuid))))))))))

;;; ------------------------------ GET /api/public/document/:uuid/card/:card-id ---------------------------------------

(deftest fetch-public-document-card-test
  (testing "GET /api/public/document/:uuid/card/:card-id"
    (testing "Can run query for card embedded in public document"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp [:model/Document document (document-with-public-link {})
                       :model/Card card {:name "Test Card"
                                         :dataset_query (mt/mbql-query venues {:limit 5})
                                         :document_id (:id document)}]
          (let [result (mt/client :get 202 (format "public/document/%s/card/%d" (:public_uuid document) (:id card)))]
            (is (some? result))
            (is (= "completed" (:status result)))))))))

(deftest public-document-card-validates-association-test
  (testing "GET /api/public/document/:uuid/card/:card-id validates card is associated with document"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Document document (document-with-public-link {})
                     :model/Card card {:name "Unassociated Card"
                                       :dataset_query (mt/mbql-query venues {:limit 5})}]
        (is (= "Not found."
               (mt/client :get 404 (format "public/document/%s/card/%d" (:public_uuid document) (:id card)))))))))

;;; ----------------------- POST /api/public/document/:uuid/card/:card-id/:export-format -------------------------------

(deftest export-public-document-card-test
  (testing "POST /api/public/document/:uuid/card/:card-id/:export-format"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Document document (document-with-public-link {})
                     :model/Card card {:name "Export Test Card"
                                       :dataset_query (mt/mbql-query venues {:limit 5})
                                       :document_id (:id document)}]
        (testing "Can export card results as CSV"
          (let [response (mt/client-full-response :post (format "public/document/%s/card/%d/csv"
                                                                (:public_uuid document)
                                                                (:id card))
                                                  {})]
            (is (= 200 (:status response)))
            (is (= "text/csv" (get-in response [:headers "Content-Type"])))))

        (testing "Can export card results as JSON"
          (let [response (mt/client-full-response :post (format "public/document/%s/card/%d/json"
                                                                (:public_uuid document)
                                                                (:id card))
                                                  {})]
            (is (= 200 (:status response)))))))))
