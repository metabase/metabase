(ns metabase-enterprise.bookmarks.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn bookmark-models [user-id & models]
  (doseq [model models]
    (cond
      (mi/instance-of? :model/Card model)
      (t2/insert! :model/CardBookmark
                  {:user_id user-id
                   :card_id (u/the-id model)})

      (mi/instance-of? :model/Document model)
      (t2/insert! :model/DocumentBookmark
                  {:user_id user-id
                   :document_id (u/the-id model)})

      :else
      (throw (ex-info "Unknown type" {:user-id user-id :model model})))))

(deftest document-bookmarks-test
  (testing "Document bookmarks with enterprise features"
    (mt/with-premium-features #{:documents}
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                     :model/Document document {:name "Test Document" :collection_id coll-id}]
        (testing "can bookmark a document when enterprise enabled"
          (is (= (u/the-id document)
                 (->> (mt/user-http-request :rasta :post 200 (str "bookmark/document/" (u/the-id document)))
                      :document_id))))

        (testing "document appears in bookmark list"
          (let [result (mt/user-http-request :rasta :get 200 "bookmark")
                document-bookmark (first (filter #(= (:type %) "document") result))]
            (is (some? document-bookmark))
            (is (= "Test Document" (:name document-bookmark)))
            (is (= (u/the-id document) (:item_id document-bookmark)))))

        (testing "can delete document bookmark"
          (mt/user-http-request :rasta :delete 204 (str "bookmark/document/" (u/the-id document)))
          (is (empty? (filter #(= (:type %) "document")
                              (mt/user-http-request :rasta :get 200 "bookmark")))))

        (testing "document bookmarks are included in ordering"
          (mt/with-temp [:model/Card card {:name "Test Card"}]
            (mt/with-model-cleanup [:model/BookmarkOrdering]
              (bookmark-models (mt/user->id :rasta) document card)
              (mt/user-http-request :rasta :put 204 "bookmark/ordering"
                                    {:orderings [{:type "document" :item_id (u/the-id document)}
                                                 {:type "card" :item_id (u/the-id card)}]})
              (is (= ["document" "card"]
                     (map :type (mt/user-http-request :rasta :get 200 "bookmark"))))))))))

  (testing "Document bookmarks without enterprise features"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                     :model/Document document {:name "Test Document" :collection_id coll-id}]
        (testing "cannot bookmark documents when enterprise disabled"
          (mt/user-http-request :rasta :post 402 (str "bookmark/document/" (u/the-id document))))

        (testing "document model not included in allowed models"
          (let [response (mt/user-http-request :rasta :post 402 (str "bookmark/document/" (u/the-id document)))]
            (is (=? {:message #"Documents is a paid feature.*"}
                    response))))))))

(deftest document-bookmarks-archived-test
  (testing "Document bookmarks on archived documents"
    (mt/with-premium-features #{:documents}
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                     :model/Document archived-document {:name "Archived Document"
                                                        :collection_id coll-id
                                                        :archived true}]
        (bookmark-models (mt/user->id :rasta) archived-document)
        (testing "archived documents don't appear in bookmark list"
          (is (empty? (filter #(= (:type %) "document")
                              (mt/user-http-request :rasta :get 200 "bookmark")))))))))
