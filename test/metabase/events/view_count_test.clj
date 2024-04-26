(ns metabase.events.view-count-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest card-read-view-count-test
  (mt/with-temp [:model/User user {}
                 :model/Card card {:creator_id (u/id user)}]
    (testing "A card read events are recorded by a card's view_count"
      (is (= 0 (:view_count card))
          "view_count should be 0 before the event is published")
      (events/publish-event! :event/card-read {:object card :user-id (u/the-id user)})
      (is (= 1 (t2/select-one-fn :view_count :model/Card (:id card)))
          "view_count should be incremented")
      (events/publish-event! :event/card-read {:object card :user-id (u/the-id user)})
      (is (= 2 (t2/select-one-fn :view_count :model/Card (:id card)))
          "view_count should be incremented"))))

(deftest dashboard-read-view-count-test
  (mt/with-temp [:model/User user {}
                 :model/Dashboard dashboard {:creator_id (u/id user)}]
    (testing "A dashboard read events are recorded by a dashboard's view_count"
      (is (= 0 (:view_count dashboard))
          "view_count should be 0 before the event is published")
      (events/publish-event! :event/dashboard-read {:object dashboard :user-id (u/the-id user)})
      (is (= 1 (t2/select-one-fn :view_count :model/Dashboard (:id dashboard)))
          "view_count should be incremented")
      (events/publish-event! :event/dashboard-read {:object dashboard :user-id (u/the-id user)})
      (is (= 2 (t2/select-one-fn :view_count :model/Dashboard (:id dashboard)))
          "view_count should be incremented"))))
