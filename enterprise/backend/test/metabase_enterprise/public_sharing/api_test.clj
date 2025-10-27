(ns metabase-enterprise.public-sharing.api-test
  "Tests for public sharing endpoints for EE-only entities (Documents).

  These tests verify that public document endpoints work correctly when routed through the EE module."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.documents.test-util :as documents.test-util]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f] (mt/with-premium-features #{:documents} (f))))

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
  (testing "EE public document endpoints should work without authentication when feature is enabled"
    (mt/with-premium-features #{:documents}
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp [:model/Document document (document-with-public-link {:name "Unauthenticated Test Document"
                                                                            :document (documents.test-util/text->prose-mirror-ast "Public content")})]
          (testing "Can access public document without authentication at /api/ee/public/document"
            (let [response (mt/client-full-response :get (str "ee/public/document/" (:public_uuid document)))]
              (is (= 200 (:status response))
                  "Should return 200 OK for public document without auth")
              (is (contains? (:body response) :name)
                  "Should return document data in response body"))))))))

;;; ---------------------------------------- Premium Feature Requirement -------------------------------------------------

(deftest public-document-requires-documents-feature-test
  (testing "Public document endpoints should require :documents premium feature"
    (mt/with-premium-features #{}
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp [:model/Document document (document-with-public-link {:name "Feature Test Document"
                                                                            :document (documents.test-util/text->prose-mirror-ast "Test content")})]
          (testing "Should return error when :documents feature is not enabled"
            (let [response (mt/client-full-response :get (str "ee/public/document/" (:public_uuid document)))]
              (is (contains? #{402 403} (:status response))
                  "Should return 402 or 403 when feature is not enabled")
              (is (or (re-find #"[Dd]ocuments" (get-in response [:body :message] ""))
                      (re-find #"premium feature" (get-in response [:body :message] "")))
                  "Error message should mention documents or premium feature"))))))))

;;; ---------------------------------------- GET /api/ee/public/document/:uuid ----------------------------------------------

(deftest public-document-card-requires-documents-feature-test
  (testing "Card query and export endpoints should require :documents premium feature"
    (mt/with-premium-features #{}
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp [:model/Document document (document-with-public-link {})
                       :model/Card card {:name "Feature Test Card"
                                         :dataset_query (mt/mbql-query venues {:limit 5})
                                         :document_id (:id document)}]
          (testing "Card query endpoint returns error without feature"
            (let [response (mt/client-full-response :get (format "ee/public/document/%s/card/%d"
                                                                 (:public_uuid document)
                                                                 (:id card)))]
              (is (contains? #{402 403} (:status response))
                  "Should return 402 or 403 when feature is not enabled")))
          (testing "Card export endpoint returns error without feature"
            (let [response (mt/client-full-response :post (format "ee/public/document/%s/card/%d/csv"
                                                                  (:public_uuid document)
                                                                  (:id card))
                                                    {})]
              (is (contains? #{402 403} (:status response))
                  "Should return 402 or 403 when feature is not enabled"))))))))

(deftest fetch-public-document-test
  (testing "GET /api/ee/public/document/:uuid"
    (testing "Can fetch a public Document via EE public sharing routes"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp [:model/Document document (document-with-public-link {:name "Public Test Document"
                                                                            :document (documents.test-util/text->prose-mirror-ast "Public test content")})]
          (is (partial= {:name "Public Test Document"
                         :document (documents.test-util/text->prose-mirror-ast "Public test content")
                         :id (:id document)}
                        (mt/client :get 200 (str "ee/public/document/" (:public_uuid document))))))))))

(deftest public-document-returns-only-safe-fields-test
  (testing "GET /api/ee/public/document/:uuid should only return safe fields"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Document document (document-with-public-link {:name "Public Test Document"
                                                                          :document (documents.test-util/text->prose-mirror-ast "Public test content")})]
        (let [result (mt/client :get 200 (str "ee/public/document/" (:public_uuid document)))]
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

(deftest get-public-document-errors-test
  (testing "GET /api/ee/public/document/:uuid"
    (testing "Cannot fetch a public Document if public sharing is disabled"
      (mt/with-temporary-setting-values [enable-public-sharing false]
        (mt/with-temp [:model/Document document (document-with-public-link {})]
          (is (= "API endpoint does not exist."
                 (mt/client :get 404 (str "ee/public/document/" (:public_uuid document))))))))

    (testing "Returns 404 if the Document doesn't exist"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (is (= "Not found."
               (mt/client :get 404 (str "ee/public/document/" (random-uuid)))))))))

(deftest public-document-not-accessible-when-archived-test
  (testing "GET /api/ee/public/document/:uuid should not work for archived documents"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-temp [:model/Document document (document-with-public-link {})]
        (let [uuid (:public_uuid document)]
          (testing "Document is accessible when not archived"
            (is (= 200
                   (:status (mt/client-full-response :get (str "ee/public/document/" uuid))))))
          (testing "Document is not accessible after archiving"
            (t2/update! :model/Document (:id document) {:archived true})
            (is (= "Not found."
                   (mt/client :get 404 (str "ee/public/document/" uuid))))))))))

;;; ------------------------------ GET /api/ee/public/document/:uuid/card/:card-id ---------------------------------------

(deftest fetch-public-document-card-test
  (testing "GET /api/ee/public/document/:uuid/card/:card-id"
    (testing "Can run query for card embedded in public document"
      (mt/with-premium-features #{:documents}
        (mt/with-temporary-setting-values [enable-public-sharing true]
          (mt/with-temp [:model/Document document (document-with-public-link {})
                         :model/Card card {:name "Test Card"
                                           :dataset_query (mt/mbql-query venues {:limit 5})
                                           :document_id (:id document)}]
            (let [result (mt/client :get 200 (format "ee/public/document/%s/card/%d" (:public_uuid document) (:id card)))]
              (is (some? result))
              (is (= :completed (:status result))))))))))

(deftest public-document-card-validates-association-test
  (testing "GET /api/ee/public/document/:uuid/card/:card-id validates card is associated with document"
    (mt/with-premium-features #{:documents}
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp [:model/Document document (document-with-public-link {})
                       :model/Card card {:name "Unassociated Card"
                                         :dataset_query (mt/mbql-query venues {:limit 5})}]
          (is (= "Not found."
                 (mt/client :get 404 (format "ee/public/document/%s/card/%d" (:public_uuid document) (:id card))))))))))

;;; ----------------------- POST /api/ee/public/document/:uuid/card/:card-id/:export-format -------------------------------

(deftest export-public-document-card-test
  (testing "POST /api/ee/public/document/:uuid/card/:card-id/:export-format"
    (mt/with-premium-features #{:documents}
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (mt/with-temp [:model/Document document (document-with-public-link {})
                       :model/Card card {:name "Export Test Card"
                                         :dataset_query (mt/mbql-query venues {:limit 5})
                                         :document_id (:id document)}]
          (testing "Can export card results as CSV"
            (let [response (mt/client-full-response :post (format "ee/public/document/%s/card/%d/csv"
                                                                  (:public_uuid document)
                                                                  (:id card))
                                                    {})]
              (is (= 200 (:status response)))
              (is (= "text/csv" (get-in response [:headers "Content-Type"])))))

          (testing "Can export card results as JSON"
            (let [response (mt/client-full-response :post (format "ee/public/document/%s/card/%d/json"
                                                                  (:public_uuid document)
                                                                  (:id card))
                                                    {})]
              (is (= 200 (:status response))))))))))
