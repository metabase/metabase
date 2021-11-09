(ns metabase.util.analytics-test
  (:require [clojure.test :refer :all]
            [metabase.util.analytics :as analytics]
            [metabase.test.util :as mt]))

(deftest track-event-test
  (testing "All track-event methods return nil and do not throw exceptions, even if event-data doesn't
           match expected schema"
    (is (= nil (analytics/track-event :new_instance_created)))
    (is (= nil (analytics/track-event :new_user_created 0)))
    (is (= nil (analytics/track-event :invite_sent 0 {:invited_user_id 1})))
    (is (= nil (analytics/track-event :invite_sent nil {:fake_field nil})))
    (is (= nil (analytics/track-event :dashboard_created 0 {:dashboard_id 2})))
    (is (= nil (analytics/track-event :dashboard_created nil {:fake_field nil})))
    (is (= nil (analytics/track-event :question_added_to_dashboard 0 {:dashboard_id 2, :question_id 3})))
    (is (= nil (analytics/track-event :question_added_to_dashboard nil {:fake_field nil})))
    (is (= nil (analytics/track-event :database_connection_successful 0 {:database :h2, :source :admin})))
    (is (= nil (analytics/track-event :database_connection_successful nil {:fake_field nil})))
    (is (= nil (analytics/track-event :database_connection_failed 0 {:database :h2, :source :admin})))
    (is (= nil (analytics/track-event :database_connection_failed nil {:fake_field nil})))))

(deftest snowplow-url-test
  (testing "Tracking calls do not throw exceptions even if the Snowplow URL cannot be connected to"
    (mt/with-temporary-setting-values [snowplow-url "not-a-url"]
      (is (= nil (analytics/track-event :new_instance_created))))
    (mt/with-temporary-setting-values [snowplow-url "http://not-a-url"]
      (is (= nil (analytics/track-event :new_instance_created))))
    (mt/with-temporary-setting-values [snowplow-url "http://example.com"]
      (is (= nil (analytics/track-event :new_instance_created))))))
