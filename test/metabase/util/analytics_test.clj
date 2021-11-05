(ns metabase.util.analytics-test
  (:require [clojure.test :refer :all]
            [metabase.util.analytics :as analytics]
            [clojure.core.async :as a]))

(deftest track-event-test
  (testing "all track-event methods return nil and do not throw exceptions, even if event-data doesn't
           match expected schema"
    (is (= nil (analytics/track-event :new_instance_created)))
    (is (= nil (analytics/track-event :new_user_created 0)))
    (is (= nil (analytics/track-event :invite_sent 0 {:invited_user_id 1})))
    (is (= nil (analytics/track-event :invite_sent 0 {:fake_field nil})))
    (is (= nil (analytics/track-event :dashboard_created 0 {:dashboard_id 2})))
    (is (= nil (analytics/track-event :dashboard_created 0 {:fake_field nil})))
    (is (= nil (analytics/track-event :question_added_to_dashboard 0 {:dashboard_id 2, :question_id 3})))
    (is (= nil (analytics/track-event :question_added_to_dashboard 0 {:fake_field nil})))))
