(ns metabase.channel.settings-test
  "Additional tests are in [[metabase.channel.slack-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.settings :as channel.settings]
   [metabase.test :as mt]))

(deftest slack-app-token-truncation-test
  (testing "slack-app-token is truncated when fetched by the setting's custom getter"
    (mt/with-temporary-setting-values [slack-app-token "xoxb-781236542736-2364535789652-GkwFDQoHqzXDVsC6GzqYUypD"]
      (is (= "xoxb-7812...UypD"
             (channel.settings/slack-app-token))))))

(deftest slack-cache-updated-at-nil
  (mt/with-temporary-setting-values [slack-channels-and-usernames-last-updated nil]
    (is (= channel.settings/zoned-time-epoch
           (channel.settings/slack-channels-and-usernames-last-updated)))))
