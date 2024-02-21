(ns metabase.api.bookmark-test
  "Tests for /api/bookmark endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.models.bookmark
    :refer [BookmarkOrdering CardBookmark CollectionBookmark DashboardBookmark]]
   [metabase.models.card :refer [Card]]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest bookmarks-test
  (mt/initialize-if-needed! :db)
  (testing "POST /api/bookmark/:model/:model-id"
    (mt/with-temp [Collection {coll-id :id :as collection} {:name "Test Collection"}
                   Card       card {:name "Test Card", :display "area", :collection_id coll-id}
                   Dashboard  dashboard {:name "Test Dashboard", :collection_id coll-id}]
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
      (mi/instance-of? Collection model)
      (t2/insert! CollectionBookmark
                  {:user_id user-id
                   :collection_id (u/the-id model)})

      (mi/instance-of? Card model)
      (t2/insert! CardBookmark
                  {:user_id user-id
                   :card_id (u/the-id model)})

      (mi/instance-of? Dashboard model)
      (t2/insert! DashboardBookmark
                  {:user_id user-id
                   :dashboard_id (u/the-id model)})

      :else
      (throw (ex-info "Unknown type" {:user-id user-id :model model})))))

(deftest bookmarks-on-archived-items-test
  (testing "POST /api/bookmark/:model/:model-id"
    (mt/with-temp [Collection archived-collection {:name "Test Collection" :archived true}
                   Card       archived-card {:name "Test Card" :archived true}
                   Dashboard  archived-dashboard {:name "Test Dashboard" :archived true}]
      (bookmark-models (mt/user->id :rasta) archived-collection archived-card archived-dashboard)
      (testing "check that we don't receive bookmarks of archived items"
        (is (= #{}
               (->> (mt/user-http-request :rasta :get 200 "bookmark")
                    (map :type)
                    set)))))))

(deftest bookmarks-ordering-test
  (testing "PUT /api/bookmark/ordering"
    (mt/with-temp [Collection collection {:name "Test Collection"}
                   Card       card {:name "Test Card"}
                   Dashboard  dashboard {:name "Test Dashboard"}]
      (mt/with-model-cleanup [BookmarkOrdering]
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
