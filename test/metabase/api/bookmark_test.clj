(ns metabase.api.bookmark-test
  "Tests for /api/bookmark endpoints."
  (:require [clojure.test :refer :all]
            [metabase.models.bookmark :refer [CardBookmark CollectionBookmark DashboardBookmark]]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest bookmarks-test
  (testing "POST /api/bookmark/:model/:model-id"
    (mt/with-temp* [Collection [collection {:name "Test Collection"}]
                    Card       [card {:name "Test Card" :display "area"}]
                    Dashboard  [dashboard {:name "Test Dashboard"}]]
      (testing "check that we can bookmark a Collection"
        (is (= (u/the-id collection)
               (->> (mt/user-http-request :rasta :post 200 (str "bookmark/collection/" (u/the-id collection)))
                    :collection_id))))
      (testing "check that we can bookmark a Card"
        (is (= (u/the-id card)
               (->> (mt/user-http-request :rasta :post 200 (str "bookmark/card/" (u/the-id card)))
                    :card_id))))
      (testing "check a card bookmark has `:display` key"
        (is (= "area"
               (->> (mt/user-http-request :rasta :get 200 "bookmark")
                    (filter #(= (:type % ) "card"))
                    first
                    :display))))
      (testing "check that we can bookmark a Dashboard"
        (is (= (u/the-id dashboard)
               (->> (mt/user-http-request :rasta :post 200 (str "bookmark/dashboard/" (u/the-id dashboard)))
                    :dashboard_id))))
      (testing "check that we can retreive the user's bookmarks"
        (is (= #{"card" "collection" "dashboard"}
               (->> (mt/user-http-request :rasta :get 200 "bookmark")
                    (map :type)
                    set))))
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

(deftest bookmarks-on-archived-items-test
  (testing "POST /api/bookmark/:model/:model-id"
    (mt/with-temp* [Collection [archived-collection {:name "Test Collection" :archived true}]
                    Card       [archived-card {:name "Test Card" :archived true}]
                    Dashboard  [archived-dashboard {:name "Test Dashboard" :archived true}]
                    CardBookmark [card-bookmark {:user_id (mt/user->id :rasta)
                                                 :card_id (u/the-id archived-card)}]
                    CollectionBookmark [collection-bookmark {:user_id       (mt/user->id :rasta)
                                                             :collection_id (u/the-id archived-collection)}]
                    DashboardBookmark [dashboard-bookmark {:user_id      (mt/user->id :rasta)
                                                           :dashboard_id (u/the-id archived-dashboard)}]]
      (testing "check that we don't receive bookmarks of archived items"
        (is (= #{}
               (->> (mt/user-http-request :rasta :get 200 "bookmark")
                    (map :type)
                    set)))))))
