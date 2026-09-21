(ns metabase.channel.settings-test
  "Additional tests are in [[metabase.channel.slack-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.settings :as channel.settings]
   [metabase.settings.core :as setting]
   [metabase.startup.core :as startup]
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

(deftest email-smtp-port-override
  (mt/with-temporary-setting-values [email-smtp-port-override nil]
    (mt/with-premium-features []
      (testing "requires cloud-custom-smtp feature to be enabled"
        (is (thrown-with-msg? Exception #"Setting email-smtp-port-override is not enabled because feature :cloud-custom-smtp is not available"
                              (channel.settings/email-smtp-port-override! 465)))))
    (mt/with-premium-features [:cloud-custom-smtp]
      (testing "invalid port is not allowed"
        (is (thrown-with-msg? AssertionError #"Invalid custom email-smtp-port"
                              (channel.settings/email-smtp-port-override! 25))))
      (testing "correctly sets the setting"
        (channel.settings/email-smtp-port-override! 465)
        (is (= 465 (channel.settings/email-smtp-port-override)))))))

(deftest email-smtp-security-override
  (mt/with-temporary-setting-values [email-smtp-security-override nil]
    (mt/with-premium-features []
      (testing "requires cloud-custom-smtp feat´ure to be enabled"
        (is (thrown-with-msg? Exception #"Setting email-smtp-security-override is not enabled because feature :cloud-custom-smtp is not available"
                              (channel.settings/email-smtp-security-override! "ssl")))))
    (mt/with-premium-features [:cloud-custom-smtp]
      (testing "'none' is not allowed"
        (is (thrown-with-msg? AssertionError #"Invalid email-smtp-security-override"
                              (channel.settings/email-smtp-security-override! "none"))))
      (testing "correctly sets the setting"
        (channel.settings/email-smtp-security-override! "ssl")
        (is (= :ssl (channel.settings/email-smtp-security-override)))))))

(deftest smtp-override-enabled
  (mt/with-premium-features [:cloud-custom-smtp]
    (testing "cannot enable cloud-smtp without hostname set"
      (mt/with-temporary-setting-values [smtp-override-enabled nil
                                         email-smtp-host-override nil]
        (is (thrown-with-msg? Exception #"Cannot enable smtp-override when it is not configured."
                              (channel.settings/smtp-override-enabled! true)))))
    (testing "can enable cloud-smtp with hostname set"
      (mt/with-temporary-setting-values [smtp-override-enabled nil
                                         email-smtp-host-override "localhost"]
        (is (= "true" (channel.settings/smtp-override-enabled! true)))))))

(deftest find-cached-slack-channel-or-username-test
  (let [channels [{:display-name "#general"   :name "general"   :id "C001"}
                  {:display-name "#data-team" :name "data-team" :id "C002"}
                  {:display-name "@alice"     :name "alice"     :id "U001"}]]
    (mt/with-dynamic-fn-redefs [channel.settings/slack-cached-channels-and-usernames (constantly {:channels channels})]
      (testing "finds by name"
        (is (= {:display-name "#general" :name "general" :id "C001"}
               (channel.settings/find-cached-slack-channel-or-username "general"))))
      (testing "finds by name with # prefix"
        (is (= {:display-name "#data-team" :name "data-team" :id "C002"}
               (channel.settings/find-cached-slack-channel-or-username "#data-team"))))
      (testing "finds a user by name with @ prefix"
        (is (= {:display-name "@alice" :name "alice" :id "U001"}
               (channel.settings/find-cached-slack-channel-or-username "@alice"))))
      (testing "finds by ID"
        (is (= {:display-name "@alice" :name "alice" :id "U001"}
               (channel.settings/find-cached-slack-channel-or-username "U001"))))
      (testing "returns nil when not found"
        (is (nil? (channel.settings/find-cached-slack-channel-or-username "no-such-channel")))))))

(deftest http-channel-host-strategy-is-environment-only-test
  (testing "the policy is read from the environment only: a value that reached the setting table -- an older
           version's admin API, a serialization import, a direct write -- is ignored, not trusted"
    (mt/with-temp-env-var-value! [mb-http-channel-host-strategy nil]
      (mt/with-temporary-raw-setting-values [http-channel-host-strategy "allow-all"]
        (is (= :external-only (channel.settings/http-channel-host-strategy))))))
  (testing "and the environment still wins over a stored value"
    (mt/with-temp-env-var-value! [mb-http-channel-host-strategy "allow-private"]
      (mt/with-temporary-raw-setting-values [http-channel-host-strategy "allow-all"]
        (is (= :allow-private (channel.settings/http-channel-host-strategy))))))
  (testing "an unrecognized policy is refused outright"
    (mt/with-temp-env-var-value! [mb-http-channel-host-strategy "allow-everything"]
      (is (thrown-with-msg? ExceptionInfo
                            #"Invalid MB_HTTP_CHANNEL_HOST_STRATEGY: \"allow-everything\"\. Expected one of external-only, allow-private, allow-all\."
                            (channel.settings/http-channel-host-strategy)))))
  (testing "nothing can write it: it is a read-only Setting"
    (is (thrown-with-msg? UnsupportedOperationException
                          #"read-only setting"
                          (setting/set! :http-channel-host-strategy :allow-all)))))

(deftest http-channel-host-strategy-startup-validation-test
  (testing "a policy the environment names but Metabase does not recognize stops the boot, rather than waiting
           for the first webhook to discover it"
    (mt/with-temp-env-var-value! [mb-http-channel-host-strategy "allow-everything"]
      (is (thrown-with-msg? ExceptionInfo
                            #"Invalid MB_HTTP_CHANNEL_HOST_STRATEGY"
                            (startup/def-startup-validation! ::channel.settings/http-channel-host-strategy)))))
  (testing "a policy it does recognize lets the boot continue"
    (mt/with-temp-env-var-value! [mb-http-channel-host-strategy "allow-private"]
      (is (= :allow-private
             (startup/def-startup-validation! ::channel.settings/http-channel-host-strategy))))))
