(ns metabase.models.bookmark-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.bookmark :as bookmark]
   [metabase.test :as mt]))

(deftest ^:parallel bookmarks-for-user-test
  (testing "Sanity check: just make sure the bookmarks-for-user DB query actually works"
    (is (some? (bookmark/bookmarks-for-user (mt/user->id :rasta))))))

(deftest ^:parallel normalize-bookmark-result-test
  (testing "collection properties don't shadow other properties"
    (let [row {:report_card.archived         nil
               :report_dashboard.description "Dashboard description"
               :item_id                      853
               :report_dashboard.name        "Test Dashboard"
               :report_card.description      nil
               :report_card.display          nil
               :type                         "dashboard"
               :report_card.name             nil
               :report_dashboard.archived    false
               :collection.description       "Collection description"
               :collection.archived          true
               :report_card.card_type        nil
               :created_at                   #t "2022-09-14T17:45:13.444716Z"
               :collection.name              "Test Collection"}]
      (is (= {:item_id     853
              :name        "Test Dashboard"
              :type        "dashboard"
              :description "Dashboard description"
              :id          "dashboard-853"}
             (#'bookmark/normalize-bookmark-result row))))))
