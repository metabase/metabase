(ns metabase.integrations.slack
  (:require [cheshire.core :as cheshire]
            [clj-http.lite.client :as client]
            [clj-http.client :as http]
            [clojure.tools.logging :as log]
            [metabase.models.setting :refer [defsetting]]))


;; Define a setting which captures our Slack api token
(defsetting slack-token "Slack API bearer token obtained from https://api.slack.com/web#authentication")

(def ^:private ^:const slack-api-baseurl "https://slack.com/api")
(def ^:private ^:const metabase-slack-files-channel "metabase_files")


(defn slack-configured?
  "Predicate function which returns `true` if the application has a valid integration with Slack, `false` otherwise."
  []
  (not (empty? (slack-token))))


(defn slack-api-get
  "Generic function which calls a given method on the Slack api via HTTP GET."
  ([token method]
    (slack-api-get token method {}))
  ([token method params]
    {:pre [(string? method)
           (map? params)]}
   (when token
     (try
       (client/get (str slack-api-baseurl "/" method) {:query-params   (merge params {:token token})
                                                       :conn-timeout   1000
                                                       :socket-timeout 1000})
       (catch Throwable t
         (log/warn "Error making Slack API call:" (.getMessage t)))))))

(defn slack-api-post
  "Generic function which calls a given method on the Slack api via HTTP POST."
  ([token method]
   (slack-api-get token method {}))
  ([token method params]
   {:pre [(string? method)
          (map? params)]}
   (when token
     (try
       (client/post (str slack-api-baseurl "/" method) {:form-params   (merge params {:token token})
                                                        :conn-timeout   1000
                                                        :socket-timeout 1000})
       (catch Throwable t
         (log/warn "Error making Slack API call:" (.getMessage t)))))))

(defn- ^:private handle-api-response
  "Simple helper that checks that response is a HTTP 200 and deserializes the `:body` if so, otherwise logs an error"
  [response]
  (if (= 200 (:status response))
    (cheshire/parse-string (:body response))
    (log/warn "Error in Slack api response:" (with-out-str (clojure.pprint/pprint response)))))

(defn channels-create
  "Calls Slack api `channels.create` for CHANNEL."
  [channel]
  {:pre [(string? channel)]}
  (-> (slack-api-post (slack-token) "channels.create" {:name channel})
      handle-api-response))

(defn channels-archive
  "Calls Slack api `channels.archive` for CHANNEL."
  [channel]
  {:pre [(string? channel)]}
  (-> (slack-api-post (slack-token) "channels.archive" {:channel channel})
      handle-api-response))

(defn channels-list
  "Calls Slack api `channels.list` function and returns the list of available channels."
  []
  (-> (slack-api-get (slack-token) "channels.list" {:exclude_archived 1})
      handle-api-response))

(defn users-list
  "Calls Slack api `users.list` function and returns the list of available users."
  []
  (-> (slack-api-get (slack-token) "users.list")
      handle-api-response))

(defn- create-files-channel
  "Convenience function for creating our Metabase files channel to store file uploads."
  []
  (when-let [response (channels-create metabase-slack-files-channel)]
    (if-let [files-channel (clojure.walk/keywordize-keys (get response "channel"))]
      (do
        ;; right after creating our files channel, archive it.  this is because we don't need users to see it.
        (channels-archive (:id files-channel))
        ;; then return the info about the files channel we created as our response
        files-channel)
      (log/error "Error creating Slack channel for Metabase file uploads:" (with-out-str (clojure.pprint/pprint response))))))

(defn get-or-create-files-channel
  "Calls Slack api `channels.info` and `channels.create` function as needed to ensure that a #metabase_files channel exists."
  []
  (if-let [files-channel (->> (get (handle-api-response (slack-api-get (slack-token) "channels.list" {:exclude_archived 0})) "channels")
                              (map clojure.walk/keywordize-keys)
                              (filter #(= metabase-slack-files-channel (:name %)))
                              first)]
    files-channel
    (create-files-channel)))

(defn files-upload
  "Calls Slack api `files.upload` function and returns the body of the uploaded file."
  [file filename channels]
  {:pre [(string? filename)
         (string? channels)]}
  (let [response (http/post (str slack-api-baseurl "/files.upload") {:multipart [["token" (slack-token)]
                                                                                 ["file" file]
                                                                                 ["filename" filename]
                                                                                 ["channels" channels]]
                                                                     :as :json})]
    (if (= 200 (:status response))
      (get-in (:body response) [:file :url_private])
      (log/warn "Error uploading file to Slack:" (with-out-str (clojure.pprint/pprint response))))))

(defn chat-post-message
  "Calls Slack api `chat.postMessage` function and posts a message to a given channel."
  ([channel text]
    (chat-post-message channel text []))
  ([channel text attachments]
   {:pre [(string? channel)
          (string? text)]}
    ;; TODO: it would be nice to have an emoji or icon image to use here
   (-> (slack-api-post (slack-token) "chat.postMessage" {:channel     channel
                                                         :username    "MetaBot"
                                                         :icon_url    "http://static.metabase.com/metabot_slack_avatar_whitebg.png"
                                                         :text        text
                                                         :attachments attachments})
       (handle-api-response))))
