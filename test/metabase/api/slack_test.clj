(ns metabase.api.slack-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.config :as config]
            [metabase.integrations.slack :as slack]
            [metabase.test :as mt]))

(deftest update-slack-settings-test
  (testing "PUT /api/slack/settings"
    (testing "An admin can set a valid Slack app token to the slack-app-token setting, and any value in the
             `slack-token` setting is cleared"
      (with-redefs [slack/valid-token? (constantly true)]
        (mt/with-temporary-setting-values [slack-app-token nil
                                           slack-token     "fake-token"]
          (mt/user-http-request :crowberto :put 200 "slack/settings"
                                {:slack-app-token "fake-token"})
          (is (= "fake-token" (slack/slack-app-token)))
          (is (= nil (slack/slack-token))))))

    (testing "A 400 error is returned if the Slack app token is invalid"
      (with-redefs [slack/valid-token? (constantly false)
                    ;; Token validation is skipped by default in test environments; overriding `is-test?` ensures
                    ;; that validation occurs
                    config/is-test?    false]
        (mt/user-http-request :crowberto :put 400 "slack/settings"
                              {:slack-app-token "fake-token"})))

    (testing "The Slack files channel setting can be set by an admin, and the leading # is stripped if it is present"
      (mt/with-temporary-setting-values [slack-files-channel nil]
        (mt/user-http-request :crowberto :put 200 "slack/settings"
                              {:slack-files-channel "fake-channel"})
        (is (= "fake-channel" (slack/slack-files-channel)))

        (mt/user-http-request :crowberto :put 200 "slack/settings"
                              {:slack-files-channel "#fake-channel"})
        (is (= "fake-channel" (slack/slack-files-channel)))))

    (testing "The Slack app token or files channel settings are cleared if no value is sent in the request"
      (mt/with-temporary-setting-values [slack-app-token "fake-token"
                                         slack-files-channel "fake-channel"]
        (mt/user-http-request :crowberto :put 200 "slack/settings" {})
        (is (= nil (slack/slack-app-token)))
        ;; The files channel is reset to its default value
        (is (= "metabase_files" (slack/slack-files-channel)))))

    (testing "A non-admin cannot modify the Slack app token or files channel settings"
      (mt/user-http-request :rasta :put 403 "slack/settings"
                            {:slack-app-token "fake-token"})
      (mt/user-http-request :rasta :put 403 "slack/settings"
                            {:slack-files-channel "fake-channel"}))))

(deftest manifest-test
  (testing "GET /api/slack/manifest"
    (testing "The Slack manifest can be fetched via an API call"
      (is (str/starts-with?
           (mt/user-http-request :crowberto :get 200 "slack/manifest")
           "_metadata:\n")))

    (testing "A non-admin cannot fetch the Slack manifest"
      (mt/user-http-request :rasta :get 403 "slack/manifest"))))
