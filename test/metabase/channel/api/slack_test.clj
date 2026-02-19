(ns metabase.channel.api.slack-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [metabase.channel.api.slack :as api.slack]
   [metabase.channel.settings :as channel.settings]
   [metabase.channel.slack :as slack]
   [metabase.config.core :as config]
   [metabase.test :as mt]))

(deftest update-slack-settings-test
  (testing "PUT /api/slack/settings"
    (testing "An admin can set a valid Slack app token to the slack-app-token setting"
      (with-redefs [slack/valid-token?                                (constantly true)
                    slack/channel-exists?                             (constantly true)
                    slack/refresh-channels-and-usernames!             (constantly nil)
                    slack/refresh-channels-and-usernames-when-needed! (constantly nil)]
        (mt/with-temporary-setting-values [slack-app-token nil]
          (mt/user-http-request :crowberto :put 200 "slack/settings" {:slack-app-token "fake-token"})
          (is (= "fake-token" (channel.settings/unobfuscated-slack-app-token))))))))

(deftest update-slack-settings-test-2
  (testing "PUT /api/slack/settings"
    (testing "A 400 error is returned if the Slack app token is invalid"
      (mt/with-temporary-setting-values [slack-app-token nil]
        (with-redefs [slack/valid-token?                                (constantly false)
                      ;; Token validation is skipped by default in test environments; overriding `is-test?` ensures
                      ;; that validation occurs
                      config/is-test?                                   false
                      slack/refresh-channels-and-usernames!             (constantly nil)
                      slack/refresh-channels-and-usernames-when-needed! (constantly nil)]
          (let [response (mt/user-http-request :crowberto :put 400 "slack/settings" {:slack-app-token "fake-token"})]
            (is (= {:slack-app-token "invalid token"} (:errors response)))
            (is (= nil (channel.settings/slack-app-token)))
            (is (= {:channels []}
                   (channel.settings/slack-cached-channels-and-usernames)))))))))

(deftest update-slack-settings-test-3
  (testing "PUT /api/slack/settings"
    (testing "An empty request body is a no-op and does not modify existing settings"
      (mt/with-temporary-setting-values [slack-app-token                                            "fake-token"
                                         channel.settings/slack-cached-channels-and-usernames       {:channels [{:name "fake_channel"}]}
                                         channel.settings/slack-channels-and-usernames-last-updated (t/zoned-date-time)]
        (let [original-last-updated (channel.settings/slack-channels-and-usernames-last-updated)]
          (mt/user-http-request :crowberto :put 200 "slack/settings" {})
          ;; Settings remain unchanged
          (is (= "fake-token" (channel.settings/unobfuscated-slack-app-token)))
          (is (= {:channels [{:name "fake_channel"}]}
                 (channel.settings/slack-cached-channels-and-usernames)))
          (is (= original-last-updated
                 (channel.settings/slack-channels-and-usernames-last-updated))))))))

(deftest update-slack-settings-test-4
  (testing "PUT /api/slack/settings"
    (testing "A non-admin cannot modify the Slack app token"
      (mt/user-http-request :rasta :put 403 "slack/settings"
                            {:slack-app-token "fake-token"}))))

(deftest ^:parallel manifest-test
  (testing "GET /api/slack/manifest"
    (testing "The Slack manifest can be fetched via an API call"
      (is (map? (mt/user-http-request :crowberto :get 200 "slack/manifest"))))))

(deftest ^:parallel manifest-test-2
  (testing "GET /api/slack/manifest"
    (testing "A non-admin cannot fetch the Slack manifest"
      (mt/user-http-request :rasta :get 403 "slack/manifest"))))

(deftest app-info-test
  (testing "GET /api/slack/app-info"
    (testing "Returns app_id and team_id when Slack is configured"
      (with-redefs [slack/app-info (constantly {:app_id "A12345"
                                                :team_id "T67890"
                                                :scopes {:actual ["chat:write"]
                                                         :required ["chat:write"]
                                                         :missing []
                                                         :extra []}})]
        (mt/with-temporary-setting-values [slack-app-token "fake-token"]
          (let [response (mt/user-http-request :crowberto :get 200 "slack/app-info")]
            (is (= {:app_id "A12345"
                    :team_id "T67890"
                    :scopes {:actual ["chat:write"]
                             :required ["chat:write"]
                             :missing []
                             :extra []}}
                   response))))))))

(deftest app-info-test-2
  (testing "GET /api/slack/app-info"
    (testing "A non-admin cannot fetch the Slack app info"
      (mt/user-http-request :rasta :get 403 "slack/app-info"))))

(deftest app-info-test-3
  (testing "GET /api/slack/app-info"
    (testing "Returns nil values when Slack is not configured"
      (mt/with-temporary-setting-values [slack-app-token nil]
        (let [response (mt/user-http-request :crowberto :get 200 "slack/app-info")]
          (is (= {:app_id nil :team_id nil :scopes nil} response)))))))

(deftest bug-report-test
  (testing "POST /api/slack/bug-report"
    (let [diagnostic-info {:url "https://test.com"
                           :description "Test description"
                           :reporter {:name "John McLane"
                                      :email "diehard@metabase.com"}
                           :bugReportDetails
                           {:metabase-info {:version {:date "2025-01-10"
                                                      :tag "vUNKNOWN"
                                                      :hash "68b5038"}}}}
          mock-file-info {:url "https://files.slack.com/files-pri/123/diagnostic.json"
                          :id "F123ABC"
                          :permalink_public "https://slack.com/files/123/diagnostic.json"}
          expected-blocks [{:type "rich_text",
                            :elements
                            [{:type "rich_text_section",
                              :elements
                              [{:type "text", :text "New bug report from "}
                               {:type "link", :url "mailto:diehard@metabase.com", :text "John McLane"}
                               {:type "text", :text "\n\nDescription:\n", :style {:bold true}}]}]}
                           {:type "section", :text {:type "mrkdwn", :text "Test description"}}
                           {:type "rich_text",
                            :elements
                            [{:type "rich_text_section",
                              :elements
                              [{:type "text", :text "\n\nURL:\n", :style {:bold true}}
                               {:type "link", :text "https://test.com", :url "https://test.com"}
                               {:type "text", :text "\n\nVersion info:\n", :style {:bold true}}]}
                             {:type "rich_text_preformatted",
                              :border 0,
                              :elements
                              [{:type "text",
                                :text "{\n  \"date\" : \"2025-01-10\",\n  \"tag\" : \"vUNKNOWN\",\n  \"hash\" : \"68b5038\"\n}"}]}]}
                           {:type "divider"}
                           {:type "actions",
                            :elements
                            [{:type "button",
                              :text {:type "plain_text", :text "Jump to debugger", :emoji true},
                              :url "https://metabase-debugger.vercel.app/?fileId=F123ABC",
                              :style "primary"}
                             {:type "button",
                              :text {:type "plain_text", :text "Download the report", :emoji true},
                              :url "https://files.slack.com/files-pri/123/diagnostic.json"}]}]]

      (testing "should post bug report to Slack with correct blocks"
        (with-redefs [slack/upload-file! (constantly mock-file-info)
                      slack/post-chat-message! (constantly nil)
                      slack/channel-exists? (constantly true)]
          (mt/with-temporary-setting-values [slack-bug-report-channel "test-bugs"]
            (let [response (mt/user-http-request :crowberto :post 200 "slack/bug-report"
                                                 {:diagnosticInfo diagnostic-info})]
              (is (= expected-blocks (#'api.slack/create-slack-message-blocks diagnostic-info mock-file-info)))
              (is (= {:success true
                      :file-url "https://slack.com/files/123/diagnostic.json"}
                     response))))))

      (testing "should handle anonymous reports"
        (with-redefs [slack/upload-file! (constantly mock-file-info)
                      slack/post-chat-message! (constantly nil)
                      slack/channel-exists? (constantly true)]
          (mt/with-temporary-setting-values [slack-bug-report-channel "test-bugs"]
            (let [anonymous-info (dissoc diagnostic-info :reporter)
                  anonymous-blocks (walk/postwalk
                                    (fn [m] (if (and (map? m) (= (:type m) "link") (str/starts-with? (:url m) "mailto:"))
                                              {:type "text" :text "anonymous user"}
                                              m))
                                    expected-blocks)]
              (is (= anonymous-blocks (#'api.slack/create-slack-message-blocks anonymous-info mock-file-info))))))))))
