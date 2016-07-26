(ns metabase.integrations.slack
  (:require [clojure.tools.logging :as log]
            [cheshire.core :as json]
            [clj-http.client :as http]
            [metabase.models.setting :as setting, :refer [defsetting]]
            [metabase.util :as u]))


;; Define a setting which captures our Slack api token
(defsetting slack-token "Slack API bearer token obtained from https://api.slack.com/web#authentication")

(def ^:private ^:const ^String slack-api-base-url "https://slack.com/api")
(def ^:private ^:const ^String files-channel-name "metabase_files")

(defn slack-configured?
  "Is Slack integration configured?"
  []
  (boolean (seq (slack-token))))


(defn- handle-response [{:keys [status body]}]
  (let [body (json/parse-string body keyword)]
    (if (and (= 200 status) (:ok body))
      body
      (let [error (if (= (:error body) "invalid_auth")
                    {:errors {:slack-token "Invalid token"}}
                    {:message (str "Slack API error: " (:error body)), :response body})]
        (log/warn (u/pprint-to-str 'red error))
        (throw (ex-info (:message error) error))))))

(defn- do-slack-request [request-fn params-key endpoint & {:keys [token], :as params, :or {token (slack-token)}}]
  (when token
    (handle-response (request-fn (str slack-api-base-url "/" (name endpoint)) {params-key      (assoc params :token token)
                                                                              :conn-timeout   1000
                                                                              :socket-timeout 1000}))))

(def ^{:arglists '([endpoint & {:as params}]), :style/indent 1} GET  "Make a GET request to the Slack API."  (partial do-slack-request http/get  :query-params))
(def ^{:arglists '([endpoint & {:as params}]), :style/indent 1} POST "Make a POST request to the Slack API." (partial do-slack-request http/post :form-params))

(def ^:private ^{:arglists '([channel-id & {:as args}])} create-channel!
  "Calls Slack api `channels.create` for CHANNEL."
  (partial POST :channels.create, :name))

(def ^:private ^{:arglists '([channel-id & {:as args}])} archive-channel!
  "Calls Slack api `channels.archive` for CHANNEL."
  (partial POST :channels.archive, :channel))

(def ^{:arglists '([& {:as args}])} channels-list
  "Calls Slack api `channels.list` function and returns the list of available channels."
  (comp :channels (partial GET :channels.list, :exclude_archived 1)))

(def ^{:arglists '([& {:as args}])} users-list
  "Calls Slack api `users.list` function and returns the list of available users."
  (comp :members (partial GET :users.list)))

(defn- create-files-channel!
  "Convenience function for creating our Metabase files channel to store file uploads."
  []
  (when-let [{files-channel :channel, :as response} (create-channel! files-channel-name)]
    (when-not files-channel
      (log/error (u/pprint-to-str 'red response))
      (throw (ex-info "Error creating Slack channel for Metabase file uploads" response)))
    ;; Right after creating our files channel, archive it. This is because we don't need users to see it.
    (u/prog1 files-channel
      (archive-channel! (:id <>)))))

(defn- files-channel
  "Return the `metabase_files` channel (as a map) if it exists."
  []
  (some (fn [channel] (when (= (:name channel) files-channel-name)
                        channel))
        (channels-list :exclude_archived 0)))

(defn get-or-create-files-channel!
  "Calls Slack api `channels.info` and `channels.create` function as needed to ensure that a #metabase_files channel exists."
  []
  (or (files-channel)
      (create-files-channel!)))

(defn upload-file!
  "Calls Slack api `files.upload` function and returns the body of the uploaded file."
  [file filename channel-ids-str]
  {:pre [file
         (instance? (Class/forName "[B") file)
         (not (zero? (count file)))
         (string? filename)
         (seq filename)
         (string? channel-ids-str)
         (seq channel-ids-str)
         (seq (slack-token))]}
  (let [response (http/post (str slack-api-base-url "/files.upload") {:multipart [{:name "token",    :content (slack-token)}
                                                                                  {:name "file",     :content file}
                                                                                  {:name "filename", :content filename}
                                                                                  {:name "channels", :content channel-ids-str}]
                                                                      :as        :json})]
    (if (= 200 (:status response))
      (u/prog1 (get-in (:body response) [:file :url_private])
        (log/debug "Uploaded image" <>))
      (log/warn "Error uploading file to Slack:" (u/pprint-to-str response)))))

(defn post-chat-message!
  "Calls Slack api `chat.postMessage` function and posts a message to a given channel.
   ATTACHMENTS should be serialized JSON."
  [channel-id text-or-nil & [attachments]]
  {:pre [(string? channel-id)]}
  ;; TODO: it would be nice to have an emoji or icon image to use here
  (POST :chat.postMessage
    :channel     channel-id
    :username    "MetaBot"
    :icon_url    "http://static.metabase.com/metabot_slack_avatar_whitebg.png"
    :text        text-or-nil
    :attachments (when (seq attachments)
                   (json/generate-string attachments))))

(def ^{:arglists '([& {:as params}])} websocket-url
  "Return a new WebSocket URL for [Slack's Real Time Messaging API](https://api.slack.com/rtm)
   This makes an API request so don't call it more often than needed."
  (comp :url (partial GET :rtm.start)))
