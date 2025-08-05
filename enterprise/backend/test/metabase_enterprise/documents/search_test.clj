(ns metabase-enterprise.documents.search-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]))

(defn- text->prose-mirror-ast
  "Convert plain text to a ProseMirror AST structure."
  [text]
  (if (empty? text)
    {:type "doc" :content []}
    {:type "doc"
     :content [{:type "paragraph"
                :content [{:type "text"
                           :text text}]}]}))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn card-with-name-and-query
  ([]
   (card-with-name-and-query (mt/random-name)))
  ([card-name]
   {:name card-name
    :display "scalar"
    :dataset_query (mt/mbql-query venues)
    :visualization_settings {:global {:title nil}}}))

(deftest card-search-exclusion-test
  (testing "Cards with document_id are excluded from search indexing"
    (let [card-name (mt/random-name)
          regular-card-name (str card-name "-regular")]
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Document document {:name "Test Document"
                                                 :document (text->prose-mirror-ast "")}
                       :model/Card document-card (-> (card-with-name-and-query card-name)
                                                     (assoc :document_id (u/the-id document)))
                       :model/Card regular-card (card-with-name-and-query regular-card-name)]

          (testing "Search API excludes document cards"
            (let [results (mt/user-http-request :crowberto :get 200 "search" {:q card-name :models "question"})]
              (is (not (some #(= (:id %) (u/the-id document-card)) (:data results)))
                  "Document card should not appear in search results"))
            (let [regular-results (mt/user-http-request :crowberto :get 200 "search" {:q regular-card-name :models "question"})]
              (is (some #(= (:id %) (u/the-id regular-card)) (:data regular-results))
                  "Regular card should appear in search results"))))))))
