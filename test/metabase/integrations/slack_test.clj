(ns metabase.integrations.slack-test
  (:require
   [cheshire.core :as json]
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.email.messages :as messages]
   [metabase.integrations.slack :as slack]
   [metabase.test :as mt]
   [metabase.test.util :as tu])
  (:import
   (java.nio.charset Charset)
   (org.apache.http NameValuePair)
   (org.apache.http.client.utils URLEncodedUtils)))

(set! *warn-on-reflection* true)

(defn- parse-query-string [query-string]
  (into {} (for [^NameValuePair pair (URLEncodedUtils/parse (str query-string) (Charset/forName "UTF-8"))]
             [(keyword (.getName pair)) (.getValue pair)])))

(defn- mock-paged-response-body [{:keys [query-string], :as request} response-body]
  (if (string? response-body)
    (recur request (json/parse-string response-body true))
    (let [{:keys [cursor]} (parse-query-string query-string)]
      ;; if the mock handler is called without a `cursor` param, return response with a `next_cursor`; if passed that
      ;; `cursor`, remove the `next_cursor`. That way we should get two pages total for testing paging
      (if (seq cursor)
        (m/dissoc-in response-body [:response_metadata :next_cursor])
        response-body))))

(defn- mock-conversations-response-body [request]
  (mock-paged-response-body request (slurp "./test_resources/slack_channels_response.json")))

(defn- mock-conversations []
  (:channels (mock-conversations-response-body nil)))

(def ^:private conversations-endpoint #"^https://slack\.com/api/conversations\.list.*")

(defn- mock-200-response [body]
  {:status 200
   :body   (if (string? body)
             body
             (json/generate-string body))})

(defn- test-no-auth-token
  "Test that a Slack API endpoint function returns `nil` if a Slack API token isn't configured."
  [endpoint thunk]
  (http-fake/with-fake-routes {endpoint (fn [_]
                                          (throw (Exception. "Failure, route should not have been invoked")))}
    (testing "should return nil if no Slack token has been configured"
      (tu/with-temporary-setting-values [slack-app-token nil
                                         slack-token nil]
        (is (= nil
               (not-empty (thunk))))))))

(defn- test-invalid-auth-token
  "Test that a Slack API endpoint function throws an Exception if an invalid Slack API token is set."
  [endpoint thunk]
  (testing "should throw Exception if auth token is invalid"
    (http-fake/with-fake-routes {endpoint (constantly
                                           (mock-200-response {:ok    false
                                                               :error "invalid_auth"}))}
      (tu/with-temporary-setting-values [slack-app-token "test-token"]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid token"
             (thunk)))
        (try
          (thunk)
          (catch clojure.lang.ExceptionInfo e
            (is (= {:slack-token "Invalid token"}
                   (:errors (ex-data e))))))))))

(defn- test-auth
  "Test that a Slack API `endpoint` function works as expected when Slack token is missing or invalid."
  [endpoint thunk]
  (doseq [f [test-no-auth-token test-invalid-auth-token]]
    (f endpoint thunk)))

(deftest slack-app-token-truncation-test
  (testing "slack-app-token is truncated when fetched by the setting's custom getter"
    (tu/with-temporary-setting-values [slack-app-token "xoxb-781236542736-2364535789652-GkwFDQoHqzXDVsC6GzqYUypD"]
      (is (= "xoxb-7812...UypD"
             (slack/slack-app-token))))))

(deftest conversations-list-test
  (testing "conversations-list"
    (test-auth conversations-endpoint slack/conversations-list)

    (testing "should be able to fetch channels and paginate"
      (http-fake/with-fake-routes {conversations-endpoint (comp mock-200-response mock-conversations-response-body)}
        (let [expected-result (map slack/channel-transform
                                   (concat (mock-conversations) (mock-conversations)))]
          (tu/with-temporary-setting-values [slack-token "test-token"
                                             slack-app-token nil]
            (is (= expected-result
                   (slack/conversations-list))))
          (tu/with-temporary-setting-values [slack-app-token "test-token"
                                             slack-token nil]
            (is (= expected-result
                   (slack/conversations-list)))))))))

(deftest valid-token?-test
  (testing "valid-token?"
    ;; should ignore the values of `slack-token` and `slack-app-token` settings
    (doseq [setting-value ["test-token" nil]]
      (tu/with-temporary-setting-values [slack-token setting-value
                                         slack-app-token setting-value]
        (http-fake/with-fake-routes {conversations-endpoint (fn [{:keys [headers], :as request}]
                                                              (is (= "Bearer\nabc"
                                                                     (get headers "Authorization")))
                                                              (mock-200-response (mock-conversations-response-body request)))}
          (is (= true
                 (slack/valid-token? "abc"))))
        (testing "invalid token should return false"
          (http-fake/with-fake-routes {conversations-endpoint (constantly
                                                               (mock-200-response {:ok    false
                                                                                   :error "invalid_auth"}))}
            (is (= false
                   (slack/valid-token? "abc")))))
        (testing "other error should be thrown as an Exception"
          (http-fake/with-fake-routes {conversations-endpoint (constantly
                                                               (mock-200-response {:ok    false
                                                                                   :error "some_other_error"}))}
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Slack API error: some_other_error"
                 (slack/valid-token? "abc")))))))))

(defn- mock-users-response-body [request]
  (mock-paged-response-body request (slurp "./test_resources/slack_users_response.json")))

(defn- mock-users []
  (:members (mock-users-response-body nil)))

(def ^:private users-endpoint #"^https://slack\.com/api/users\.list.*")

(deftest users-list-test
  (testing "users-list"
    (test-auth users-endpoint slack/users-list)

    (testing "should be able to fetch list of users and page"
      (http-fake/with-fake-routes {users-endpoint (comp mock-200-response mock-users-response-body)}
        (let [expected-result (map slack/user-transform
                                   (concat (mock-users) (mock-users)))]
          (tu/with-temporary-setting-values [slack-token     nil
                                             slack-app-token "test-token"]
            (is (= expected-result
                   (slack/users-list)))
            (tu/with-temporary-setting-values [slack-app-token nil
                                               slack-token     "test-token"]
              (is (= expected-result
                     (slack/users-list))))))))))

(deftest files-channel-test
  (testing "files-channel"
    (testing "Should be able to get the files-channel from the cache (if it exists)"
      (tu/with-temporary-setting-values [slack-files-channel "general"
                                         slack-cached-channels-and-usernames
                                         {:channels (mapv (fn [c] {:name c :id c})
                                                          ["general" "random" "off-topic"
                                                           "cooking" "john" "james" "jordan"])}]
        (is (= "general" (slack/files-channel))))
      (tu/with-temporary-setting-values [slack-files-channel "not_in_the_cache"
                                         slack-cached-channels-and-usernames
                                         {:channels [{:name "general" :id "C0G9QKBBL"}]}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Slack channel named.*is missing.*"
             (slack/files-channel)))))))

(deftest upload-file!-test
  (testing "upload-file!"
    (let [image-bytes (.getBytes "fake-picture")
          filename    "wow.gif"
          channel-id  "C13372B6X"
          upload-url  "https://files.slack.com/upload/v1/CwABAAAAWgoAAZnBg"
          fake-upload-routes {#"^https://slack.com/api/files\.getUploadURLExternal.*"
                              (fn [_] (mock-200-response {:ok         true
                                                          :upload_url upload-url
                                                          :file_id    "DDDDDDDDD-EEEEEEEEE"}))

                              upload-url
                              (fn [_] (mock-200-response "OK"))

                              #"^https://slack.com/api/files\.completeUploadExternal.*"
                              (fn [_] (mock-200-response (slurp "./test_resources/slack_upload_file_response.json")))}]
      (http-fake/with-fake-routes fake-upload-routes
        (tu/with-temporary-setting-values [slack-token "test-token"
                                           slack-app-token nil]
          (is (= "https://files.slack.com/files-pri/DDDDDDDDD-EEEEEEEEE/wow.gif"
                 (slack/upload-file! image-bytes filename channel-id)))))
      ;; Slack app token requires joining the `metabase_files` channel before uploading a file
      (http-fake/with-fake-routes
        (assoc fake-upload-routes
               #"^https://slack.com/api/conversations\.join.*"
               (fn [_] (mock-200-response (slurp "./test_resources/slack_conversations_join_response.json"))))
        (tu/with-temporary-setting-values [slack-token nil
                                           slack-app-token "test-token"]
          (is (= "https://files.slack.com/files-pri/DDDDDDDDD-EEEEEEEEE/wow.gif"
                 (slack/upload-file! image-bytes filename channel-id))))
        (testing (str "upload-file! will attempt to join channels by internal slack id"
                      " but we can continue to use the channel name for posting")
          (let [filename    "wow.gif"
                channel-id  "metabase_files"
                slack-id    "CQXPZKNQ3RK"
                joined?     (atom false)
                channel-info [{:display-name "#random",
                               :name "random",
                               :id "CT2FNGZSRPL",
                               :type "channel"}
                              {:display-name "#general",
                               :name "general",
                               :id "C4Q6LXLRA46",
                               :type "channel"}
                              {:display-name "#metabase_files",
                               :name channel-id,
                               ;; must look up "metabase_files" and find the id below
                               :id slack-id,
                               :type "channel"}]
                post          (var-get #'slack/POST)]
            (with-redefs [slack/POST (fn [endpoint payload]
                                       (case endpoint
                                         "files.completeUploadExternal"
                                         (if @joined?
                                           (json/parse-string (slurp "./test_resources/slack_upload_file_response.json") keyword)
                                           (throw (ex-info "Not in that channel"
                                                           {:error-code "not_in_channel"})))
                                         "conversations.join"
                                         (reset! joined? (= (-> payload :form-params :channel)
                                                            slack-id))
                                         (post endpoint payload)))]
              (tu/with-temporary-setting-values [slack/slack-app-token "slack-configured?"
                                                 slack/slack-cached-channels-and-usernames
                                                 {:channels channel-info}]
                (slack/upload-file! (.getBytes "fake-picture") filename channel-id)
                (is @joined? (str "Did not attempt to join with slack-id " slack-id))))))))))

(deftest maybe-lookup-id-test
  (let [f (var-get #'slack/maybe-lookup-id)]
    (testing "On new v2 shape"
      (testing "Returns original if not found"
        (is (= "needle"
               (f "needle" {:channels [{:display-name "#other1"
                                        :name         "other1"
                                        :type         "channel"
                                        :id           "CR65C4ZJVIW"}
                                       {:display-name "#other2"
                                        :name         "other2"
                                        :type         "channel"
                                        :id           "C87LQNL0Y23"}]}))))
      (testing "Returns the slack internal id if found"
        (is (= "slack-id"
               (f "needle" {:channels [{:display-name "#other1"
                                        :name         "other1"
                                        :type         "channel"
                                        :id           "CR65C4ZJVIW"}
                                       {:display-name "#needle"
                                        :name         "needle"
                                        :type         "channel"
                                        :id           "slack-id"}]})))))))

(deftest post-chat-message!-test
  (testing "post-chat-message!"
    (http-fake/with-fake-routes {#"^https://slack.com/api/chat\.postMessage.*" (fn [_]
                                                                                 (mock-200-response (slurp "./test_resources/slack_post_chat_message_response.json")))}
      (let [expected {:ok      true
                      :message {:type    "message"
                                :subtype "bot_message"
                                :text    ":wow:"}}]
        (tu/with-temporary-setting-values [slack-token "test-token"
                                           slack-app-token nil]
          (is (=? expected
                  (slack/post-chat-message! "C94712B6X" ":wow:"))))
        (tu/with-temporary-setting-values [slack-app-token "test-token"
                                           slack-token nil]
          (is (=? expected
                  (slack/post-chat-message! "C94712B6X" ":wow:"))))))))

(deftest slack-token-error-test
  (with-redefs [messages/all-admin-recipients (constantly ["crowberto@metabase.com"])]
    (tu/with-temporary-setting-values [slack-app-token    "test-token"
                                       #_:clj-kondo/ignore slack-token-valid? true]
      (mt/with-fake-inbox
        (http-fake/with-fake-routes {#"^https://slack.com/api/chat\.postMessage.*"
                                     (fn [_] (mock-200-response {:ok false, :error "account_inactive"}))}
          (testing "If a slack token is revoked, an email should be sent to admins, and the `slack-token-valid?` setting
             should be set to false"
            (try
              (slack/post-chat-message! "C94712B6X" ":wow:")
              (catch Throwable e
                (is (= "Invalid token" (ex-message e)))
                (is (= (mt/email-to :crowberto {:subject "Your Slack connection stopped working"
                                                :to #{"crowberto@metabase.com"}
                                                :body [{"Your Slack connection stopped working." true}]})
                       (mt/summarize-multipart-email #"Your Slack connection stopped working.")))
                (is (false? (slack/slack-token-valid?))))))

          (testing "If `slack-token-valid?` is already false, no email should be sent"
            (mt/reset-inbox!)
            (try
              (slack/post-chat-message! "C94712B6X" ":wow:")
              (catch Throwable e
                (is (= "Invalid token" (ex-message e)))
                (is (= {} (mt/summarize-multipart-email #"Your Slack connection stopped working.")))))))

        (testing "No email is sent during token validation checks, even if `slack-token-valid?` is currently true"
          (tu/with-temporary-setting-values [slack-token-valid? true]
            (http-fake/with-fake-routes {conversations-endpoint (fn [_] (mock-200-response {:ok false, :error "account_inactive"}))}
              (mt/reset-inbox!)
              (is (= false (slack/valid-token? "abc")))
              (is (= {} (mt/summarize-multipart-email #"Your Slack connection stopped working.")))
              (is (slack/slack-token-valid?)))))))))

(deftest slack-cache-updated-at-nil
  (tu/with-temporary-setting-values [slack-channels-and-usernames-last-updated nil]
    (is (= (var-get #'slack/zoned-time-epoch) (slack/slack-channels-and-usernames-last-updated)))))
