(ns metabase.api.slack-test
  (:require [clojure.test :refer :all]
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
          (is (= nil (slack/slack-token))))))))
