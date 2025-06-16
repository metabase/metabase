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

(deftest cloud-email-reply-to
  (mt/with-temporary-setting-values [cloud-email-reply-to nil]
    (testing "requires cloud-custom-smtp feature to be enabled"
      (is (thrown-with-msg? Exception #"Setting cloud-email-reply-to is not enabled because feature :cloud-custom-smtp is not available"
                            (channel.settings/cloud-email-reply-to! "test@example.com"))))
    (mt/with-premium-features [:cloud-custom-smtp]
      (testing "invalid email is not allowed"
        (is (thrown-with-msg? Exception #"Invalid reply-to address"
                              (channel.settings/cloud-email-reply-to! "invalid"))))
      (testing "correctly sets the setting"
        (channel.settings/cloud-email-reply-to! ["test@example.com"])
        (is (= '("test@example.com") (channel.settings/cloud-email-reply-to)))))))

(deftest cloud-email-smtp-port
  (mt/with-temporary-setting-values [cloud-email-smtp-port nil]
    (testing "requires cloud-custom-smtp feature to be enabled"
      (is (thrown-with-msg? Exception #"Setting cloud-email-smtp-port is not enabled because feature :cloud-custom-smtp is not available"
                            (channel.settings/cloud-email-smtp-port! 465))))
    (mt/with-premium-features [:cloud-custom-smtp]
      (testing "invalid port is not allowed"
        (is (thrown-with-msg? AssertionError #"Invalid custom email-smtp-port"
                              (channel.settings/cloud-email-smtp-port! 25))))
      (testing "correctly sets the setting"
        (channel.settings/cloud-email-smtp-port! 465)
        (is (= 465 (channel.settings/cloud-email-smtp-port)))))))

(deftest cloud-email-smtp-security
  (mt/with-temporary-setting-values [cloud-email-smtp-security nil]
    (testing "requires cloud-custom-smtp feature to be enabled"
      (is (thrown-with-msg? Exception #"Setting cloud-email-smtp-security is not enabled because feature :cloud-custom-smtp is not available"
                            (channel.settings/cloud-email-smtp-security! "ssl"))))
    (mt/with-premium-features [:cloud-custom-smtp]
      (testing "'none' is not allowed"
        (is (thrown-with-msg? AssertionError #"Invalid cloud-email-smtp-security"
                              (channel.settings/cloud-email-smtp-security! "none"))))
      (testing "correctly sets the setting"
        (channel.settings/cloud-email-smtp-security! "ssl")
        (is (= :ssl (channel.settings/cloud-email-smtp-security)))))))
