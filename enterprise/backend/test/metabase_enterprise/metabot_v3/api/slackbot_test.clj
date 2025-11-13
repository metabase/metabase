(ns metabase-enterprise.metabot-v3.api.slackbot-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest manifest-endpoint-test
  (testing "GET /api/ee/metabot-v3/slack/manifest"
    (mt/with-premium-features #{:metabot-v3}
      (testing "admins can access manifest"
        (let [response (mt/user-http-request :crowberto :get 200 "ee/metabot-v3/slack/manifest")]
          (is (map? response))
          (is (contains? response :display_information))
          (is (contains? response :features))
          (is (contains? response :oauth_config))
          (is (contains? response :settings))))

      (testing "non-admins cannot access manifest"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/metabot-v3/slack/manifest")))))))

(deftest events-endpoint-test
  (testing "POST /api/ee/metabot-v3/slack/events"
    (mt/with-premium-features #{:metabot-v3}
      (testing "handles URL verification challenge (no auth required)"
        (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                  ;; https://docs.slack.dev/reference/events/url_verification
                                  {:type "url_verification"
                                   :token "Jhj5dZrVaK7ZwHHjRyZWbDl",
                                   :challenge "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P"})]
          (is (= "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P" response))))

      (testing "handles regular events without challenge (no auth required)"
        (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                  {:type "event_callback"})]
          ;; Your endpoint returns (:challenge body) which is nil for events without challenge
          (is (nil? response)))))))
