(ns metabase.channel.slack-test
  (:require
   [clj-http.fake :as http-fake]
   [clojure.set :as s]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.channel.settings :as channel.settings]
   [metabase.channel.slack :as slack]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset Charset)
   (org.apache.http NameValuePair)
   (org.apache.http.client.utils URLEncodedUtils)))

(use-fixtures :once (fixtures/initialize :notifications))

(set! *warn-on-reflection* true)

(defn- parse-query-string [query-string]
  (into {} (for [^NameValuePair pair (URLEncodedUtils/parse (str query-string) (Charset/forName "UTF-8"))]
             [(keyword (.getName pair)) (.getValue pair)])))

(defn- mock-paged-response-body [{:keys [query-string], :as request} response-body]
  (if (string? response-body)
    (recur request (json/decode+kw response-body))
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
             (json/encode body))})

(defn- test-no-auth-token!
  "Test that a Slack API endpoint function returns `nil` if a Slack API token isn't configured."
  [endpoint thunk]
  (http-fake/with-fake-routes {endpoint (fn [_]
                                          (throw (Exception. "Failure, route should not have been invoked")))}
    (testing "should return nil if no Slack token has been configured"
      (mt/with-temporary-setting-values [slack-app-token nil
                                         slack-token nil]
        (is (= nil
               (not-empty (thunk))))))))

(defn- test-invalid-auth-token!
  "Test that a Slack API endpoint function throws an Exception if an invalid Slack API token is set."
  [endpoint thunk]
  (testing "should throw Exception if auth token is invalid"
    (http-fake/with-fake-routes {endpoint (constantly
                                           (mock-200-response {:ok    false
                                                               :error "invalid_auth"}))}
      (mt/with-temporary-setting-values [slack-app-token "test-token"]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Slack API error: invalid_auth"
             (thunk)))
        (let [expected-error-markers (set {:error-code "invalid_auth" :error-type :slack/invalid-token})]
          (try
            (thunk)
            (catch clojure.lang.ExceptionInfo e
              (is (s/subset? expected-error-markers (set (ex-data e)))))))))))

(defn- test-auth!
  "Test that a Slack API `endpoint` function works as expected when Slack token is missing or invalid."
  [endpoint thunk]
  (doseq [f [test-no-auth-token! test-invalid-auth-token!]]
    (f endpoint thunk)))

(deftest conversations-list-test
  (testing "conversations-list"
    (test-auth! conversations-endpoint slack/conversations-list)

    (testing ":private_channel flag determines the \"types\" param sent to slack"
      (are [opts conversation-types]
           (let [request (atom nil)]
             (http-fake/with-fake-routes
               {conversations-endpoint
                (fn [req]
                  (reset! request req)
                  (mock-200-response (mock-conversations-response-body req)))}
               (mt/with-temporary-setting-values [slack-token "test-token"
                                                  slack-app-token nil]
                 (slack/conversations-list opts)))
             (let [{:keys [query-string]} @request
                   {:keys [types]}        (parse-query-string query-string)]
               (= conversation-types types)))
        {}                        "public_channel"
        {:private-channels false} "public_channel"
        {:private-channels true}  "public_channel,private_channel"))

    (testing "should be able to fetch channels and paginate"
      (http-fake/with-fake-routes {conversations-endpoint (comp mock-200-response mock-conversations-response-body)}
        (let [expected-result (map slack/channel-transform
                                   (concat (mock-conversations) (mock-conversations)))]
          (mt/with-temporary-setting-values [slack-token "test-token"
                                             slack-app-token nil]
            (is (= expected-result
                   (slack/conversations-list))))
          (mt/with-temporary-setting-values [slack-app-token "test-token"
                                             slack-token nil]
            (is (= expected-result
                   (slack/conversations-list)))))))))

(deftest valid-token?-test
  (testing "valid-token?"
    ;; should ignore the values of `slack-token` and `slack-app-token` settings
    (doseq [setting-value ["test-token" nil]]
      (mt/with-temporary-setting-values [slack-token setting-value
                                         slack-app-token setting-value]
        (http-fake/with-fake-routes {conversations-endpoint (fn [{:keys [headers], :as request}]
                                                              (is (= "Bearer\nabc"
                                                                     (get headers "Authorization")))
                                                              (mock-200-response (mock-conversations-response-body request)))}
          (is (true?
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
    (test-auth! users-endpoint slack/users-list)

    (testing "should be able to fetch list of users and page"
      (http-fake/with-fake-routes {users-endpoint (comp mock-200-response mock-users-response-body)}
        (let [expected-result (map slack/user-transform
                                   (concat (mock-users) (mock-users)))]
          (mt/with-temporary-setting-values [slack-token     nil
                                             slack-app-token "test-token"]
            (is (= expected-result
                   (slack/users-list)))
            (mt/with-temporary-setting-values [slack-app-token nil
                                               slack-token     "test-token"]
              (is (= expected-result
                     (slack/users-list))))))))))

(deftest upload-file!-test
  (testing "upload-file!"
    (let [image-bytes (.getBytes "fake-picture")
          filename    "wow.gif"
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
        (mt/with-temporary-setting-values [slack-token "test-token"
                                           slack-app-token nil]
          (is (= {:url "https://files.slack.com/files-pri/DDDDDDDDD-EEEEEEEEE/wow.gif"
                  :id "DDDDDDDDD-EEEEEEEEE"}
                 (slack/upload-file! image-bytes filename)))))
      ;; Slack app token requires joining the `metabase_files` channel before uploading a file
      (http-fake/with-fake-routes
        (assoc fake-upload-routes
               #"^https://slack.com/api/conversations\.join.*"
               (fn [_] (mock-200-response (slurp "./test_resources/slack_conversations_join_response.json"))))
        (mt/with-temporary-setting-values [slack-token nil
                                           slack-app-token "test-token"]
          (is (= {:url "https://files.slack.com/files-pri/DDDDDDDDD-EEEEEEEEE/wow.gif"
                  :id "DDDDDDDDD-EEEEEEEEE"}
                 (slack/upload-file! image-bytes filename))))))))

(deftest post-chat-message!-test
  (testing "post-chat-message!"
    (http-fake/with-fake-routes {#"^https://slack.com/api/chat\.postMessage.*" (fn [_]
                                                                                 (mock-200-response (slurp "./test_resources/slack_post_chat_message_response.json")))}
      (let [expected {:ok      true
                      :message {:type    "message"
                                :subtype "bot_message"
                                :text    ":wow:"}}]
        (mt/with-temporary-setting-values [slack-token "test-token"
                                           slack-app-token nil]
          (is (=? expected
                  (slack/post-chat-message! "C94712B6X" ":wow:"))))
        (mt/with-temporary-setting-values [slack-app-token "test-token"
                                           slack-token nil]
          (is (=? expected
                  (slack/post-chat-message! "C94712B6X" ":wow:"))))))))

(deftest slack-token-error-test
  (notification.tu/with-send-notification-sync
    (mt/with-temporary-setting-values [slack-app-token    "test-token"
                                       admin-email         nil
                                       #_:clj-kondo/ignore slack-token-valid? true]
      (mt/with-fake-inbox
        (http-fake/with-fake-routes {#"^https://slack.com/api/chat\.postMessage.*"
                                     (fn [_] (mock-200-response {:ok false, :error "account_inactive"}))}
          (testing "If a slack token is revoked, an email should be sent to admins, and the `slack-token-valid?` setting
                   should be set to false"
            (try
              (slack/post-chat-message! "C94712B6X" ":wow:")
              (catch Throwable e
                (is (= :slack/invalid-token (:error-type (ex-data e))))
                (let [recipient->emails (mt/summarize-multipart-email #"Your Slack connection stopped working.")]
                  (is (=? {:from "notifications@metabase.com",
                           :subject "Your Slack connection stopped working",
                           :body [{"Your Slack connection stopped working." true}]}
                          (-> recipient->emails (get "crowberto@metabase.com") first)))
                  (is (= (t2/select-fn-set :email :model/User :is_superuser true)
                         (set (keys recipient->emails)))))
                (is (false? (channel.settings/slack-token-valid?))))))

          (testing "If `slack-token-valid?` is already false, no email should be sent"
            (mt/reset-inbox!)
            (try
              (slack/post-chat-message! "C94712B6X" ":wow:")
              (catch Throwable e
                (is (= :slack/invalid-token (:error-type (ex-data e))))
                (is (= {} (mt/summarize-multipart-email #"Your Slack connection stopped working.")))))))

        (testing "No email is sent during token validation checks, even if `slack-token-valid?` is currently true"
          (mt/with-temporary-setting-values [slack-token-valid? true]
            (http-fake/with-fake-routes {conversations-endpoint (fn [_] (mock-200-response {:ok false, :error "account_inactive"}))}
              (mt/reset-inbox!)
              (is (= false (slack/valid-token? "abc")))
              (is (= {} (mt/summarize-multipart-email #"Your Slack connection stopped working.")))
              (is (channel.settings/slack-token-valid?)))))))))

(def auth-endpoint #"^https://slack\.com/api/auth\.test.*")

(deftest refresh-channels-and-usernames!-test
  (testing "Chooses correct value for :private-channels if groups:read scope is available"
    (are [oauth-scopes conversation-types]
         (let [request (atom nil)]
           (mt/with-temporary-setting-values [slack-app-token "test"
                                              slack-token nil]
             (http-fake/with-fake-routes
               {auth-endpoint
                (constantly
                 {:status 200
                  :body (json/encode {:ok true})
                  :headers {"x-oauth-scopes" oauth-scopes}})
                conversations-endpoint
                (fn [req]
                  (reset! request req)
                  {:status 200, :body (json/encode {:ok true})})
                users-endpoint
                (constantly {:status 200, :body (json/encode {:ok true})})}
               (slack/refresh-channels-and-usernames!)
               (let [{:keys [query-string]} @request
                     {:keys [types]}        (parse-query-string query-string)]
                 (= conversation-types types)))))

      ""            "public_channel"
      "groups:read" "public_channel,private_channel")))
