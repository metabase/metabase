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
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(deftest update-slack-settings-test
  (testing "PUT /api/slack/settings"
    (testing "An admin can set a valid Slack app token to the slack-app-token setting"
      (mt/with-dynamic-fn-redefs [slack/valid-token?                                (constantly true)
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

(deftest manifest-test
  (testing "GET /api/slack/manifest"
    (testing "The Slack manifest can be fetched via an API call"
      (mt/with-temporary-setting-values [site-url "https://example.com"]
        (is (map? (mt/user-http-request :crowberto :get 200 "slack/manifest")))))))

(deftest ^:parallel manifest-test-2
  (testing "GET /api/slack/manifest"
    (testing "A non-admin cannot fetch the Slack manifest"
      (mt/user-http-request :rasta :get 403 "slack/manifest"))))

(deftest app-info-test
  (testing "GET /api/slack/app-info"
    (testing "Returns app_id and team_id when Slack is configured"
      (mt/with-dynamic-fn-redefs [api.slack/app-info (constantly {:app_id "A12345"
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
                   response))))))
    (testing "A non-admin cannot fetch the Slack app info"
      (mt/user-http-request :rasta :get 403 "slack/app-info"))
    (testing "Returns nil values when Slack is not configured"
      (mt/with-temporary-setting-values [slack-app-token nil]
        (let [response (mt/user-http-request :crowberto :get 200 "slack/app-info")]
          (is (= {:app_id nil :team_id nil :scopes nil} response)))))))

(def ^:private bug-report-diagnostic-info
  {:url "https://test.com"
   :description "Test description"
   ;; not the session user; the endpoint substitutes the session user's name and email
   :reporter {:name "John McLane"
              :email "diehard@metabase.com"}
   :bugReportDetails
   {:metabase-info {:version {:date "2025-01-10"
                              :tag "vUNKNOWN"
                              :hash "68b5038"}}}})

(def ^:private bug-report-mock-file-info
  {:url "https://files.slack.com/files-pri/123/diagnostic.json"
   :id "F123ABC"
   :permalink_public "https://slack.com/files/123/diagnostic.json"})

(defn- bug-report-expected-blocks
  "The Slack message blocks for [[bug-report-diagnostic-info]] reported by test user `user`."
  [user]
  (let [{:keys [common_name email]} (mt/fetch-user user)
        {:keys [url id]}            bug-report-mock-file-info]
    [{:type "rich_text",
      :elements
      [{:type "rich_text_section",
        :elements
        [{:type "text", :text "New bug report from "}
         {:type "link", :url (str "mailto:" email), :text common_name}
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
        :url (str "https://metabase-debugger.vercel.app/?fileId=" id),
        :style "primary"}
       {:type "button",
        :text {:type "plain_text", :text "Download the report", :emoji true},
        :url url}]}]))

(defn- post-bug-report!
  "POST `diagnostic-info` as `user` with Slack stubbed out. Returns the response plus the message and decoded file the
  endpoint handed to Slack (`nil` when it didn't)."
  [user expected-status diagnostic-info]
  (let [posted   (atom nil)
        uploaded (atom nil)]
    (mt/with-dynamic-fn-redefs [slack/upload-file!       (fn [content _filename]
                                                           (reset! uploaded (String. ^bytes content "UTF-8"))
                                                           bug-report-mock-file-info)
                                slack/post-chat-message! (fn [message] (reset! posted message))
                                slack/channel-exists?    (constantly true)]
      (mt/with-temporary-setting-values [slack-bug-report-channel "test-bugs"]
        {:response (mt/user-http-request user :post expected-status "slack/bug-report"
                                         {:diagnosticInfo diagnostic-info})
         :posted   @posted
         :uploaded (some-> @uploaded json/decode+kw)}))))

(deftest bug-report-test
  (testing "POST /api/slack/bug-report"
    (mt/with-temp-env-var-value! [mb-bug-reporting-enabled "true"]
      (testing "posts the report to Slack, attributed to the session user rather than the reporter in the request body"
        (let [{:keys [response posted uploaded]} (post-bug-report! :crowberto 200 bug-report-diagnostic-info)
              {:keys [common_name email]}        (mt/fetch-user :crowberto)]
          (is (= {:success true
                  :file-url (:permalink_public bug-report-mock-file-info)}
                 response))
          (is (= (bug-report-expected-blocks :crowberto) (:blocks posted)))
          (is (= {:name common_name :email email}
                 (:reporter uploaded)))))
      (let [anonymous-blocks (walk/postwalk
                              (fn [m] (if (and (map? m) (= (:type m) "link") (str/starts-with? (:url m) "mailto:"))
                                        {:type "text" :text "anonymous user"}
                                        m))
                              (bug-report-expected-blocks :crowberto))]
        (testing "a report without a reporter stays anonymous"
          (let [{:keys [posted uploaded]} (post-bug-report! :crowberto 200
                                                            (dissoc bug-report-diagnostic-info :reporter))]
            (is (= anonymous-blocks (:blocks posted)))
            (is (not (contains? uploaded :reporter)))))
        (testing "a report with a null reporter stays anonymous"
          (let [{:keys [posted uploaded]} (post-bug-report! :crowberto 200
                                                            (assoc bug-report-diagnostic-info :reporter nil))]
            (is (= anonymous-blocks (:blocks posted)))
            (is (nil? (:reporter uploaded)))))))))

(deftest bug-report-disabled-test
  (testing "POST /api/slack/bug-report"
    (testing "is refused when bug reporting is not enabled, even with a Slack bug report channel configured"
      (mt/with-temp-env-var-value! [mb-bug-reporting-enabled "false"]
        (let [{:keys [response posted uploaded]} (post-bug-report! :crowberto 400 bug-report-diagnostic-info)]
          (is (= "Bug reporting is not enabled." response))
          (is (nil? uploaded))
          (is (nil? posted)))))))
