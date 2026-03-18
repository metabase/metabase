(ns metabase-enterprise.slackbot.config-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.slackbot.test-util :as tu]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.channel.settings :as channel.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.encryption :as encryption]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(deftest setup-complete-test
  (tu/with-slackbot-setup
    (let [request-body (assoc-in tu/base-dm-event [:event :text] "test")
          post-events  #(mt/client :post %1 "ee/metabot-v3/slack/events"
                                   (tu/slack-request-options request-body) request-body)]
      (testing "succeeds when all settings are configured"
        (is (= "ok" (post-events 200))))

      (testing "returns 503 when sso-slack feature disabled"
        (with-redefs [premium-features/enable-sso-slack? (constantly false)]
          (is (= "Slack integration is not fully configured." (post-events 503)))))

      (testing "returns 503 when client-id missing"
        (mt/with-temporary-setting-values [sso-settings/slack-connect-client-id nil]
          (is (= "Slack integration is not fully configured." (post-events 503)))))

      (testing "returns 503 when client-secret missing"
        (mt/with-temporary-setting-values [sso-settings/slack-connect-client-secret nil]
          (is (= "Slack integration is not fully configured." (post-events 503)))))

      (testing "returns 503 when bot-token missing"
        (mt/with-temporary-setting-values [channel.settings/slack-app-token nil]
          (is (= "Slack integration is not fully configured." (post-events 503)))))

      (testing "returns 503 when encryption disabled"
        (with-redefs [encryption/default-secret-key nil]
          (is (= "Slack integration is not fully configured." (post-events 503)))))

      (testing "returns 503 when site-url missing"
        (mt/with-temporary-setting-values [site-url nil]
          (is (= "Slack integration is not fully configured." (post-events 503)))))

      (testing "returns 503 when signing-secret missing (can't sign request)"
        (mt/with-temporary-raw-setting-values [metabot-slack-signing-secret nil]
          (is (= "Slack integration is not fully configured."
                 (mt/client :post 503 "ee/metabot-v3/slack/events" request-body))))))))
