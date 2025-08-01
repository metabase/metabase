(ns metabase-enterprise.documents.api.card-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn card-with-name-and-query
  ([]
   (card-with-name-and-query (mt/random-name)))

  ([card-name]
   {:name card-name
    :display "scalar"
    :dataset_query (mt/mbql-query venues)
    :visualization_settings {:global {:title nil}}}))

(deftest document-id-create-card-test
  (testing "Can create card with valid document_id"
    (mt/with-premium-features #{:documents}
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Document report {:name "Test Report"}
                       :model/DocumentVersion _ {:document_id (u/the-id report)
                                                 :version_identifier 1
                                                 :document ""}]
          (let [card-data (-> (card-with-name-and-query)
                              (assoc :type :in_document
                                     :document_id (u/the-id report)))]
            (is (=? {:type "in_document"
                     :document_id (u/the-id report)}
                    (mt/user-http-request :crowberto :post 200 "card" card-data)))))))))

(deftest document-id-get-card-test
  (testing "API response includes document_id when present"
    (mt/with-premium-features #{:documents}
      (mt/with-temp [:model/Document report {:name "Test Report"}
                     :model/DocumentVersion _ {:document_id (u/the-id report)
                                               :version_identifier 1
                                               :document ""}
                     :model/Card card {:name "Test Card"
                                       :dataset_query (mt/mbql-query venues)
                                       :display :table
                                       :visualization_settings {}
                                       :type :in_document
                                       :document_id (u/the-id report)}]
        (let [response (mt/user-http-request :crowberto :get 200 (str "card/" (u/the-id card)))]
          (is (= (u/the-id report) (:document_id response))
              "GET response should include correct document_id value"))))))

(deftest document-id-change-to-question-test
  (testing "Changing from :in_document to :question returns 400 error and card remains unchanged"
    (mt/with-premium-features #{:documents}
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Document report {:name "Test Report"}
                       :model/DocumentVersion _ {:document_id (u/the-id report)
                                                 :version_identifier 1
                                                 :document ""}
                       :model/Card card {:name "Test Card"
                                         :dataset_query (mt/mbql-query venues)
                                         :display :table
                                         :visualization_settings {}
                                         :type :in_document
                                         :document_id (u/the-id report)}]
          (mt/user-http-request :crowberto :put 400 (str "card/" (u/the-id card))
                                {:type :question})
          (let [unchanged-card (mt/user-http-request :crowberto :get 200 (str "card/" (u/the-id card)))]
            (is (= "in_document" (:type unchanged-card))
                "Card type should remain :in_document")
            (is (= (u/the-id report) (:document_id unchanged-card))
                "document_id should remain unchanged")))))))

(deftest document-id-change-to-model-test
  (testing "Changing from :in_document to :model returns 400 error and card remains unchanged"
    (mt/with-premium-features #{:documents}
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Document report {:name "Test Report"}
                       :model/DocumentVersion _ {:document_id (u/the-id report)
                                                 :version_identifier 1
                                                 :document ""}
                       :model/Card card {:name "Test Card"
                                         :dataset_query (mt/mbql-query venues)
                                         :display :table
                                         :visualization_settings {}
                                         :type :in_document
                                         :document_id (u/the-id report)}]
          (mt/user-http-request :crowberto :put 400 (str "card/" (u/the-id card))
                                {:type :model})
          (let [unchanged-card (mt/user-http-request :crowberto :get 200 (str "card/" (u/the-id card)))]
            (is (= "in_document" (:type unchanged-card))
                "Card type should remain :in_document")
            (is (= (u/the-id report) (:document_id unchanged-card))
                "document_id should remain unchanged")))))))

(deftest document-id-change-to-metric-test
  (testing "Changing from :in_document to :metric returns 400 error and card remains unchanged"
    (mt/with-premium-features #{:documents}
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Document report {:name "Test Report"}
                       :model/DocumentVersion _ {:document_id (u/the-id report)
                                                 :version_identifier 1
                                                 :document ""}
                       :model/Card card {:name "Test Card"
                                         :dataset_query (card-with-name-and-query (mt/random-name))
                                         :display :table
                                         :visualization_settings {}
                                         :type :in_document
                                         :document_id (u/the-id report)}]
          (mt/user-http-request :crowberto :put 400 (str "card/" (u/the-id card))
                                {:type :metric})
          (let [unchanged-card (mt/user-http-request :crowberto :get 200 (str "card/" (u/the-id card)))]
            (is (= "in_document" (:type unchanged-card))
                "Card type should remain :in_document")
            (is (= (u/the-id report) (:document_id unchanged-card))
                "document_id should remain unchanged")))))))
