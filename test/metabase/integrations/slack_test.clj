(ns metabase.integrations.slack-test
  (:require [cheshire.core :as json]
            [clj-http.fake :as http-fake]
            [clojure.core.memoize :as memoize]
            [clojure.java.io :as io]
            [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.integrations.slack :as slack]
            [metabase.test.util :as tu]
            [schema.core :as s])
  (:import java.nio.charset.Charset
           org.apache.commons.io.IOUtils
           org.apache.http.client.utils.URLEncodedUtils
           org.apache.http.NameValuePair))

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
      (tu/with-temporary-setting-values [slack-token nil]
        (is (= nil
               (thunk)))))))

(defn- test-invalid-auth-token
  "Test that a Slack API endpoint function throws an Exception if an invalid Slack API token is set."
  [endpoint thunk]
  (testing "should throw Exception if auth token is invalid"
    (http-fake/with-fake-routes {endpoint (constantly
                                           (mock-200-response {:ok    false
                                                               :error "invalid_auth"}))}
      (tu/with-temporary-setting-values [slack-token "test-token"]
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

(deftest conversations-list-test
  (testing "conversations-list"
    (test-auth conversations-endpoint slack/conversations-list)

    (testing "should be able to fetch channels and paginate"
      (http-fake/with-fake-routes {conversations-endpoint (comp mock-200-response mock-conversations-response-body)}
        (tu/with-temporary-setting-values [slack-token "test-token"]
          (is (= (concat (mock-conversations) (mock-conversations))
                 (slack/conversations-list))))))))

(deftest valid-token?-test
  (testing "valid-token?"
    ;; should ignore value of `slack-token` Setting
    (doseq [setting-value ["test-token" nil]]
      (tu/with-temporary-setting-values [slack-token setting-value]
        (http-fake/with-fake-routes {conversations-endpoint (fn [{:keys [query-string], :as request}]
                                                              (let [{:keys [token]} (parse-query-string query-string)]
                                                                (testing "token passed as parameter should be used for the request"
                                                                  (is (= "abc"
                                                                         token))))
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
        (tu/with-temporary-setting-values [slack-token "test-token"]
          (is (= (concat (mock-users) (mock-users))
                 (slack/users-list))))))))

(defn- mock-files-channel []
  (let [channel-name @#'slack/files-channel-name]
    (-> (mock-conversations)
        first
        (assoc
         :name channel-name, :name_normalized channel-name,
         :purpose {:value "Metabase file upload location", :creator "", :last_set 0}))))

(deftest files-channel-test
  ;; clear out any cached valid values of `files-channel`
  (memoize/memo-clear! @#'slack/files-channel)
  (testing "files-channel"
    (test-invalid-auth-token conversations-endpoint slack/files-channel)

    (testing "Should be able to fetch the files-channel (if it exists)"
      (http-fake/with-fake-routes {conversations-endpoint (fn [request]
                                                            (-> (mock-conversations-response-body request)
                                                                (update :channels conj (mock-files-channel))
                                                                mock-200-response))}
        (tu/with-temporary-setting-values [slack-token "test-token"]
          (is (= (mock-files-channel)
                 (slack/files-channel))))))))

(deftest upload-file!-test
  (testing "upload-file!"
    (let [image-bytes (with-open [is (io/input-stream (io/resource "frontend_client/favicon.ico"))]
                            (IOUtils/toByteArray is))
          filename    "wow.gif"
          channel-id  "C13372B6X"]
      (http-fake/with-fake-routes {#"^https://slack.com/api/files\.upload.*" (fn [_]
                                                                               (mock-200-response (slurp "./test_resources/slack_upload_file_response.json")))}
        (tu/with-temporary-setting-values [slack-token "test-token"]
          (is (= "https://files.slack.com/files-pri/T078VLEET-F017C3TSBK6/wow.gif"
                 (slack/upload-file! image-bytes filename channel-id))))))))

(deftest post-chat-message!-test
  (testing "post-chat-message!"
    (http-fake/with-fake-routes {#"^https://slack.com/api/chat\.postMessage.*" (fn [_]
                                                                                 (mock-200-response (slurp "./test_resources/slack_post_chat_message_response.json")))}
      (tu/with-temporary-setting-values [slack-token "test-token"]
        (is (schema= {:ok       (s/eq true)
                      :message  {:type     (s/eq "message")
                                 :subtype  (s/eq "bot_message")
                                 :text     (s/eq ":wow:")
                                 s/Keyword s/Any}
                      s/Keyword s/Any}
                     (slack/post-chat-message! "C94712B6X" ":wow:")))))))
