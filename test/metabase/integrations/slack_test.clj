(ns metabase.integrations.slack-test
  (:require [cheshire.core :as json]
            [clj-http.fake :as http-fake]
            [clojure.java.io :as io]
            [expectations :refer :all]
            [metabase.integrations.slack :as slack-integ :refer :all]
            [metabase.test.util :as tu]))

(def ^:private default-channels-response
  (delay (slurp (io/resource "slack_channels_response.json"))))

(def ^:private default-channels
  (delay (:channels (json/parse-string @default-channels-response keyword))))

(def ^:private channels-request
  {:address      "https://slack.com/api/channels.list"
   :query-params {:token            "test-token"
                  :exclude_archived "true"
                  :exclude_members  "true"}})

(defn- expected-200-response [body]
  (fn [_]
    {:status 200
     :body (if (string? body)
             body
             (json/generate-string body))}))

(def ^:private invalid-token-response
  (expected-200-response
   {:ok    false
    :error "invalid_auth"}))

(defn- exception-if-called [_]
  (throw (Exception. "Failure, route should not have been invoked")))

;; Channels should return nil if no Slack token has been configured
(expect
  nil
  (http-fake/with-fake-routes {channels-request exception-if-called}
    (tu/with-temporary-setting-values [slack-token nil]
      (channels-list))))

;; Test the channels call and expected response
(expect
  @default-channels
  (http-fake/with-fake-routes {channels-request (expected-200-response @default-channels-response)}
    (tu/with-temporary-setting-values [slack-token "test-token"]
      (channels-list))))

;; Test the invalid token auth flow
(expect
  {:ex-class clojure.lang.ExceptionInfo
   :msg      nil
   :data     {:errors {:slack-token "Invalid token"}}}
  (http-fake/with-fake-routes {channels-request invalid-token-response}
    (tu/with-temporary-setting-values [slack-token "test-token"]
      (tu/exception-and-message
       (channels-list)))))

(def ^:private default-users-response
  (delay (slurp (io/resource "slack_users_response.json"))))

(def ^:private default-users
  (delay (:members (json/parse-string @default-users-response keyword))))

(def ^:private users-request
  {:address "https://slack.com/api/users.list"
   :query-params {:token "test-token"}})

;; Users should return nil if no Slack token has been configured
(expect
  nil
  (http-fake/with-fake-routes {users-request exception-if-called}
    (tu/with-temporary-setting-values [slack-token nil]
      (users-list))))

;; Test the users call and the expected response
(expect
  @default-users
  (http-fake/with-fake-routes {users-request (expected-200-response @default-users-response)}
    (tu/with-temporary-setting-values [slack-token "test-token"]
      (users-list))))

;; Test the invalid token auth flow for users
(expect
  {:ex-class clojure.lang.ExceptionInfo
   :msg      nil
   :data     {:errors {:slack-token "Invalid token"}}}
  (http-fake/with-fake-routes {users-request invalid-token-response}
    (tu/with-temporary-setting-values [slack-token "test-token"]
      (tu/exception-and-message
       (users-list)))))

(def ^:private files-request
  (assoc-in channels-request [:query-params :exclude_archived] "false"))

;; Asking for the files channel when slack is not configured throws an exception
(expect
  {:ex-class clojure.lang.ExceptionInfo
   :msg      (var-get #'slack-integ/channel-missing-msg)
   :data     {:status-code 400}}
  (http-fake/with-fake-routes {files-request exception-if-called}
    (tu/exception-and-message
     (files-channel))))

(defn- create-files-channel []
  (let [channel-name (var-get #'slack-integ/files-channel-name)]
    (-> @default-channels
        first
        (assoc
            :name channel-name, :name_normalized channel-name,
            :purpose {:value "Metabase file upload location", :creator "", :last_set 0}))))

;; Testing the call that finds the metabase files channel
(expect
  (create-files-channel)
  (http-fake/with-fake-routes {files-request (-> @default-channels-response
                                                 json/parse-string
                                                 (update :channels conj (create-files-channel))
                                                 expected-200-response)}
    (tu/with-temporary-setting-values [slack-token "test-token"]
      (files-channel))))
