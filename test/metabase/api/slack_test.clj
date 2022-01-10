(ns metabase.api.slack-test
  (:require [clojure.test :refer :all]
            [metabase.integrations.slack :as slack]
            [metabase.test :as mt]
            [clojure.string :as str]))

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
      (with-redefs [slack/valid-token? (constantly false)]
        (mt/user-http-request :crowberto :put 400 "slack/settings"
                              {:slack-app-token "fake-token"})))

    (testing "The Slack app token setting is cleared if no value is sent in the request"
      (mt/with-temporary-setting-values [slack-app-token "fake-token"]
        (mt/user-http-request :crowberto :put 200 "slack/settings" {})
        (is (= nil (slack/slack-app-token)))))

    (testing "A non-admin cannot modify the Slack app token setting"
      (mt/user-http-request :rasta :put 403 "slack/settings"
                            {:slack-app-token "fake-token"}))))

(deftest manifest-test
  (testing "GET /api/slack/manifest"
    (testing "The Slack manifest can be fetched via an API call"
      (is (str/starts-with?
           (mt/user-http-request :crowberto :get 200 "slack/manifest")
           "_metadata:\n")))

    (testing "A non-admin cannot fetch the Slack manifest"
      (mt/user-http-request :rasta :get 403 "slack/manifest"))))
