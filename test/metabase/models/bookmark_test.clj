(ns metabase.models.bookmark-test
  (:require [clojure.test :refer :all]
            [metabase.models.bookmark :as bookmark]))

(deftest normalize-bookmark-result-test
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
               :report_dashboard.is_app_page true
               :collection.app_id            178
               :collection.archived          true
               :report_card.dataset          nil
               :created_at                   #t "2022-09-14T17:45:13.444716Z"
               :collection.name              "Test Collection"}]
      (is (= {:item_id     853
              :name        "Test Dashboard"
              :type        "dashboard"
              :description "Dashboard description"
              :is_app_page true
              :app_id      178,
              :id          "dashboard-853"}
             (#'bookmark/normalize-bookmark-result row))))))
