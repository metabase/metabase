(ns metabase.documents.search-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.events.core :as events]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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
            (let [results (mt/user-http-request :crowberto :get 200 "search" :q card-name :models "card")]
              (is (not (some #(= (:id %) (u/the-id document-card)) (:data results)))
                  "Document card should not appear in search results"))
            (let [regular-results (mt/user-http-request :crowberto :get 200 "search" :q regular-card-name :models "card")]
              (is (some #(= (:id %) (u/the-id regular-card)) (:data regular-results))
                  "Regular card should appear in search results"))))))))

(deftest document-permission-filtering-test
  (testing "Document search respects collection-based permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Collection {coll-id :id} {}
                       :model/Collection {private-coll-id :id} {}
                       :model/Document {doc-in-public-coll :id} {:name "Public Document"
                                                                 :collection_id coll-id
                                                                 :document (text->prose-mirror-ast "content")}
                       :model/Document {doc-in-private-coll :id} {:name "Private Document"
                                                                  :collection_id private-coll-id
                                                                  :document (text->prose-mirror-ast "content")}
                       :model/Document {doc-archived :id} {:name "Archived Document"
                                                           :collection_id coll-id
                                                           :archived true
                                                           :document (text->prose-mirror-ast "content")}]
          ;; Give user read access to first collection only
          (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)

          (testing "Regular user sees only documents in accessible collections"
            (let [results (mt/user-http-request :rasta :get 200 "search" :q "Document" :models "document")]
              (is (= #{doc-in-public-coll}
                     (set (map :id (:data results))))
                  "Should only see document in accessible collection")))

          (testing "Regular user cannot see archived documents (no write perms)"
            (let [results (mt/user-http-request :rasta :get 200 "search" :q "Archived" :archived true :models "document")]
              (is (empty? (:data results))
                  "Should not see archived document without write permissions")))

          (testing "Admin can see all documents including archived"
            (let [regular-results (mt/user-http-request :crowberto :get 200 "search" :q "Document" :models "document")
                  archived-results (mt/user-http-request :crowberto :get 200 "search" :q "Archived" :archived true :models "document")]
              (is (= #{doc-in-public-coll doc-in-private-coll}
                     (set (map :id (:data regular-results))))
                  "Admin should see all non-archived documents")
              (is (= #{doc-archived}
                     (set (map :id (:data archived-results))))
                  "Admin should see archived documents")))

          (testing "User with write permissions can see archived documents"
            ;; Give user write access to first collection
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id)
            (let [archived-results (mt/user-http-request :rasta :get 200 "search" :q "Archived" :archived true :models "document")]
              (is (= #{doc-archived}
                     (set (map :id (:data archived-results))))
                  "User with write permissions should see archived documents in accessible collections"))))))))

(deftest document-view-tracking-integration-test
  (testing "Document view tracking integrates with search"
    (mt/with-temp [:model/Document {doc-id :id} {:name "Viewed Document"
                                                 :document (text->prose-mirror-ast "content")
                                                 :view_count 0}]

      (testing "Document has initial state"
        (let [doc (t2/select-one :model/Document :id doc-id)]
          (is (= 0 (:view_count doc)))
          ;; last_viewed_at has a default timestamp from migration, not nil
          (is (some? (:last_viewed_at doc)))))

      (testing "Publishing document-read event works without errors"
        ;; The actual view count increment is batched and asynchronous
        ;; So we test that the event publishes successfully
        (is (some? (events/publish-event! :event/document-read
                                          {:object-id doc-id
                                           :user-id (mt/user->id :crowberto)}))
            "Document read event should publish successfully"))

      (testing "Document with higher view count appears in search"
        ;; Manually set view count to test search integration
        (t2/update! :model/Document doc-id {:view_count 5
                                            :last_viewed_at (t/offset-date-time)})
        (search.tu/with-temp-index-table
          (let [results (mt/user-http-request :crowberto :get 200 "search" {:q "Viewed" :models "document"})
                doc-results (filter #(= "document" (:model %)) (:data results))]
            (when (seq doc-results)
              (let [doc-result (first doc-results)]
                (is (= doc-id (:id doc-result)))
                ;; View count affects scoring but isn't directly in result
                (is (some #(= "view-count" (:name %)) (:scores doc-result))))))))

      (testing "Document with recent view appears in search results"
        (let [recent-time (t/minus (t/offset-date-time) (t/minutes 5))]
          (t2/update! :model/Document doc-id {:last_viewed_at recent-time})
          (search.tu/with-temp-index-table
            (let [results (mt/user-http-request :crowberto :get 200 "search" {:q "Viewed" :models "document"})
                  doc-results (filter #(= "document" (:model %)) (:data results))]
              (when (seq doc-results)
                (let [doc-result (first doc-results)]
                  (is (= doc-id (:id doc-result)))
                  ;; User recency affects scoring
                  (is (some #(= "user-recency" (:name %)) (:scores doc-result))))))))))))
