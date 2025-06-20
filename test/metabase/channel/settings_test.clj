(ns metabase.channel.settings-test
  "Additional tests are in [[metabase.channel.slack-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.settings :as channel.settings]
   [metabase.test :as mt])
  (:import (clojure.lang ExceptionInfo)))

(deftest slack-app-token-truncation-test
  (testing "slack-app-token is truncated when fetched by the setting's custom getter"
    (mt/with-temporary-setting-values [slack-app-token "xoxb-781236542736-2364535789652-GkwFDQoHqzXDVsC6GzqYUypD"]
      (is (= "xoxb-7812...UypD"
             (channel.settings/slack-app-token))))))

(deftest slack-cache-updated-at-nil
  (mt/with-temporary-setting-values [slack-channels-and-usernames-last-updated nil]
    (is (= channel.settings/zoned-time-epoch
           (channel.settings/slack-channels-and-usernames-last-updated)))))

(deftest email-from-name-validation
  (mt/with-temporary-setting-values [email-from-name nil]
    (testing "valid names"
      (doseq [valid-name [nil
                          "Test Name"
                          "Test-Name"
                          "Test 123 !#$%&'*+-=?^`~"
                          "\uD83D\uDC7E"
                          "بسمة"]]
        (testing valid-name
          (channel.settings/email-from-name! valid-name)
          (is (= (channel.settings/email-from-name) valid-name)))))
    (testing "invalid names"
      (doseq [invalid-name ["Bad :"
                            ":"
                            "Bad \""
                            "Bad ("
                            "Bad )"
                            "Bad ("
                            "Bad @"]]
        (testing invalid-name
          (is (thrown-with-msg? ExceptionInfo #"Invalid special character included."
                                (channel.settings/email-from-name! invalid-name))))))))
