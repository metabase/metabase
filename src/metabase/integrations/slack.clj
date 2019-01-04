(ns metabase.integrations.slack
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.core.memoize :as memoize]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.config :as config]))

;; Define a setting which captures our Slack api token
(defsetting slack-token (tru "Slack API bearer token obtained from https://api.slack.com/web#authentication"))

(def ^:private ^String slack-api-base-url "https://slack.com/api")
(def ^:private ^String files-channel-name "metabase_files")

(defn slack-configured?
  "Is Slack integration configured?"
  []
  (boolean (seq (slack-token))))


(defn- handle-response [{:keys [status body]}]
  (let [body (-> body io/reader (json/parse-stream keyword))]
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
                                                                               :as             :stream
                                                                               :conn-timeout   1000
                                                                               :socket-timeout 1000}))))

(def ^{:arglists '([endpoint & {:as params}]), :style/indent 1} GET  "Make a GET request to the Slack API."  (partial do-slack-request http/get  :query-params))
(def ^{:arglists '([endpoint & {:as params}]), :style/indent 1} POST "Make a POST request to the Slack API." (partial do-slack-request http/post :form-params))

(def ^{:arglists '([& {:as args}])} channels-list
  "Calls Slack api `channels.list` function and returns the list of available channels."
  (comp :channels (partial GET :channels.list, :exclude_archived true, :exclude_members true)))

(def ^{:arglists '([& {:as args}])} users-list
  "Calls Slack api `users.list` function and returns the list of available users."
  (comp :members (partial GET :users.list)))

(def ^:private ^:const ^String channel-missing-msg
  (str "Slack channel named `metabase_files` is missing! Please create the channel in order to complete "
       "the Slack integration. The channel is used for storing graphs that are included in pulses and "
       "MetaBot answers."))

(defn- maybe-get-files-channel
  "Return the `metabase_files channel (as a map) if it exists."
  []
  (some (fn [channel] (when (= (:name channel) files-channel-name)
                        channel))
        (channels-list :exclude_archived false)))

(defn- files-channel* []
  (or (maybe-get-files-channel)
      (do (log/error (u/format-color 'red channel-missing-msg))
          (throw (ex-info channel-missing-msg {:status-code 400})))))

(def ^{:arglists '([])} files-channel
  "Calls Slack api `channels.info` to check whether a channel named #metabase_files exists. If it doesn't, throws an
  error that advices an admin to create it."
  ;; If the channel has successfully been created we can cache the information about it from the API response. We need
  ;; this information every time we send out a pulse, but making a call to the `channels.list` endpoint everytime we
  ;; send a Pulse can result in us seeing 429 (rate limiting) status codes -- see
  ;; https://github.com/metabase/metabase/issues/8967
  ;;
  ;; Of course, if `files-channel*` *fails* (because the channel is not created), this won't get cached; this is what
  ;; we want -- to remind people to create it
  (if config/is-test?
    ;; don't cache the channel when running tests, because we don't actually hit the Slack API, and we don't want one
    ;; test causing their "fake" channel to get cached and mess up other tests
    files-channel*
    (let [six-hours-ms (* 6 60 60 1000)]
      (memoize/ttl files-channel* :ttl/threshold six-hours-ms))))


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
