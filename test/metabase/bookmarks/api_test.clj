(ns metabase.bookmarks.api-test
  "Tests for /api/bookmark endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest bookmarks-test
  (mt/initialize-if-needed! :db)
  (testing "POST /api/bookmark/:model/:model-id"
    (mt/with-temp [:model/Collection {coll-id :id :as collection} {:name "Test Collection"}
                   :model/Card       card {:name "Test Card", :display "area", :collection_id coll-id}
                   :model/Dashboard  dashboard {:name "Test Dashboard", :collection_id coll-id}]
      (testing "check that we can bookmark a Collection"
        (is (= (u/the-id collection)
               (->> (mt/user-http-request :rasta :post 200 (str "bookmark/collection/" (u/the-id collection)))
                    :collection_id))))
      (testing "check that we can bookmark a Card"
        (is (= (u/the-id card)
               (->> (mt/user-http-request :rasta :post 200 (str "bookmark/card/" (u/the-id card)))
                    :card_id))))
      (let [card-result (->> (mt/user-http-request :rasta :get 200 "bookmark")
                             (filter #(= (:type %) "card"))
                             first)]
        (testing "check a card bookmark has `:display` key"
          (is (contains? card-result :display)))
        (testing "check a card bookmark has `:type` key"
          (is (contains? card-result :type))))
      (testing "check that we can bookmark a Dashboard"
        (is (= (u/the-id dashboard)
               (->> (mt/user-http-request :rasta :post 200 (str "bookmark/dashboard/" (u/the-id dashboard)))
                    :dashboard_id))))
      (testing "check that we can retreive the user's bookmarks"
        (let [result (mt/user-http-request :rasta :get 200 "bookmark")]
          (is (= #{"card" "collection" "dashboard"}
                 (into #{} (map :type) result)))))
      (testing "check that we can delete bookmarks"
        (mt/user-http-request :rasta :delete 204 (str "bookmark/card/" (u/the-id card)))
        (is (= #{"collection" "dashboard"}
               (->> (mt/user-http-request :rasta :get 200 "bookmark")
                    (map :type)
                    set)))
        (mt/user-http-request :rasta :delete 204 (str "bookmark/collection/" (u/the-id collection)))
        (mt/user-http-request :rasta :delete 204 (str "bookmark/dashboard/" (u/the-id dashboard)))
        (is (= #{}
               (->> (mt/user-http-request :rasta :get 200 "bookmark")
                    (map :type)
                    set)))))))

(defn bookmark-models [user-id & models]
  (doseq [model models]
    (cond
      (mi/instance-of? :model/Collection model)
      (t2/insert! :model/CollectionBookmark
                  {:user_id user-id
                   :collection_id (u/the-id model)})

      (mi/instance-of? :model/Card model)
      (t2/insert! :model/CardBookmark
                  {:user_id user-id
                   :card_id (u/the-id model)})

      (mi/instance-of? :model/Dashboard model)
      (t2/insert! :model/DashboardBookmark
                  {:user_id user-id
                   :dashboard_id (u/the-id model)})

      (mi/instance-of? :model/Document model)
      (t2/insert! :model/DocumentBookmark
                  {:user_id user-id
                   :document_id (u/the-id model)})

      :else
      (throw (ex-info "Unknown type" {:user-id user-id :model model})))))

(deftest bookmarks-on-archived-items-test
  (testing "POST /api/bookmark/:model/:model-id"
    (mt/with-temp [:model/Collection archived-collection {:name "Test Collection"
                                                          :archived true}
                   :model/Card       archived-card {:name "Test Card" :archived true}
                   :model/Dashboard  archived-dashboard {:name "Test Dashboard" :archived true}]
      (bookmark-models (mt/user->id :rasta) archived-collection archived-card archived-dashboard)
      (testing "check that we don't receive bookmarks of archived items"
        (is (= #{}
               (->> (mt/user-http-request :rasta :get 200 "bookmark")
                    (map :type)
                    set)))))))

(deftest bookmarks-ordering-test
  (testing "PUT /api/bookmark/ordering"
    (mt/with-temp [:model/Collection collection {:name "Test Collection"}
                   :model/Card       card {:name "Test Card"}
                   :model/Dashboard  dashboard {:name "Test Dashboard"}]
      (mt/with-model-cleanup [:model/BookmarkOrdering]
        (bookmark-models (mt/user->id :rasta) collection card dashboard)
        (testing "Check that ordering works"
          (is (= nil
                 (mt/user-http-request :rasta :put 204 "bookmark/ordering"
                                       {:orderings [{:type "dashboard" :item_id (u/the-id dashboard)}
                                                    {:type "card" :item_id (u/the-id card)}
                                                    {:type "collection" :item_id (u/the-id collection)}]})))
          (is (= ["dashboard" "card" "collection"]
                 (map :type
                      (mt/user-http-request :rasta :get 200 "bookmark")))))
        (testing "Check that re-ordering works"
          (is (= nil
                 (mt/user-http-request :rasta :put 204 "bookmark/ordering"
                                       {:orderings [{:type "card" :item_id (u/the-id card)}
                                                    {:type "collection" :item_id (u/the-id collection)}
                                                    {:type "dashboard" :item_id (u/the-id dashboard)}]})))
          (is (= ["card" "collection" "dashboard"]
                 (map :type
                      (mt/user-http-request :rasta :get 200 "bookmark")))))))))

(deftest document-bookmarks-test
  (testing "Document bookmarks"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Document document {:name "Test Document" :collection_id coll-id}]
      (testing "can bookmark a document"
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

(deftest document-bookmarks-archived-test
  (testing "Document bookmarks on archived documents"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                   :model/Document archived-document {:name "Archived Document"
                                                      :collection_id coll-id
                                                      :archived true}]
      (bookmark-models (mt/user->id :rasta) archived-document)
      (testing "archived documents don't appear in bookmark list"
        (is (empty? (filter #(= (:type %) "document")
                            (mt/user-http-request :rasta :get 200 "bookmark"))))))))
