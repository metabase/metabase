(ns metabase-enterprise.metabot-v3.api.slackbot.client
  "Slack API client functions for Metabot slackbot."
  (:require
   [clj-http.client :as http]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def SlackClient
  "Malli schema for a Slack client."
  [:map {:closed true}
   [:token ms/NonBlankString]])

(defn- slack-get
  "GET from slack"
  [client endpoint params]
  (let [response (http/get (str "https://slack.com/api" endpoint)
                           {:headers {"Authorization" (str "Bearer " (:token client))}
                            :query-params params})]
    {:body (json/decode (:body response) true)
     :headers (:headers response)}))

(defn- slack-post-json
  "POST to slack."
  [client endpoint payload]
  (let [response (http/post (str "https://slack.com/api" endpoint)
                            {:headers {"Authorization" (str "Bearer " (:token client))}
                             :content-type "application/json; charset=utf-8"
                             :body (json/encode payload)})]
    {:body (json/decode (:body response) true)
     :headers (:headers response)}))

(defn- slack-post-form
  "POST form to slack"
  [client endpoint payload]
  (-> (http/post (str "https://slack.com/api" endpoint)
                 {:headers {"Authorization" (str "Bearer " (:token client))
                            "Content-Type" "application/x-www-form-urlencoded; charset=utf-8"}
                  :form-params payload})
      :body
      (json/decode true)))

(def ^:private slack-token-error-codes
  "Error codes from Slack that indicate an invalid or revoked token."
  #{"invalid_auth" "account_inactive" "token_revoked" "token_expired" "not_authed"})

(defn auth-test
  "Call auth.test and return the response including headers.
   Throws an exception with appropriate status code if the call fails:
   - 400 for invalid/revoked tokens
   - 502 for Slack API errors (e.g., Slack is down)"
  [client]
  (try
    (let [{:keys [body headers]} (slack-post-json client "/auth.test" {})]
      (if (:ok body)
        {:body body :headers headers}
        (let [error-code (:error body)
              invalid-token? (slack-token-error-codes error-code)]
          (throw (ex-info (if invalid-token?
                            (tru "Invalid Slack bot token: {0}" error-code)
                            (tru "Slack API error: {0}" error-code))
                          {:status-code (if invalid-token? 400 502)
                           :error-code error-code})))))
    (catch clojure.lang.ExceptionInfo e
      (throw e))
    (catch Exception e
      (throw (ex-info (tru "Unable to connect to Slack API: {0}" (.getMessage e))
                      {:status-code 502}
                      e)))))

(defn get-bot-user-id
  "Get the bot's Slack user ID"
  [client]
  (:user_id (:body (auth-test client))))

(defn fetch-thread
  "Fetch a Slack thread"
  ([client message]
   (fetch-thread client message 50))
  ([client message limit]
   (:body (slack-get client "/conversations.replies"
                     {:channel (:channel message)
                      :ts (or (:thread_ts message) (:ts message))
                      :limit limit}))))

(defn- get-upload-url
  "Get a URL we can upload to"
  [client args]
  (slack-post-form client "/files.getUploadURLExternal" args))

(defn post-message
  "Send a Slack message"
  [client message]
  (:body (slack-post-json client "/chat.postMessage" message)))

(defn post-ephemeral-message
  "Send a Slack ephemeral message (visible only to the specified user)"
  [client message]
  (:body (slack-post-json client "/chat.postEphemeral" message)))

(defn post-image
  "Upload a PNG image and send in a message"
  [client image-bytes filename channel thread-ts]
  (let [{:keys [ok upload_url file_id] :as res} (get-upload-url client {:filename filename
                                                                        :length (alength ^bytes image-bytes)})]
    (when ok
      (http/post upload_url
                 {:headers {"Content-Type" "image/png"}
                  :body image-bytes})
      (:body (slack-post-json client "/files.completeUploadExternal"
                              {:files [{:id file_id
                                        :title filename}]
                               :channel_id channel
                               :thread_ts thread-ts}))
      res)))

(defn delete-message
  "Remove a Slack message"
  [client message]
  (:body (slack-post-json client "/chat.delete" (select-keys message [:channel :ts]))))

(defn download-file
  "Download a file from Slack using the client's token for authentication.
   Returns byte array of file contents."
  [client url]
  (-> (http/get url {:headers {"Authorization" (str "Bearer " (:token client))}
                     :as :byte-array})
      :body))

;; -------------------- SLACK STREAMING API --------------------
;; These functions implement Slack's chat streaming API for progressive AI responses.
;; See: https://docs.slack.dev/changelog/2025/10/7/chat-streaming/

(defn start-stream
  "Start a Slack message stream. Returns the stream timestamp on success (acts as an identifier)."
  [client {:keys [channel thread_ts team_id user_id]}]
  (let [body (:body (slack-post-json client "/chat.startStream"
                                     {:channel           channel
                                      :thread_ts         thread_ts
                                      :recipient_team_id team_id
                                      :recipient_user_id user_id}))]
    (log/debugf "[slackbot] start-stream response: %s" (pr-str body))
    (if (:ok body)
      {:stream_ts (:ts body)
       :channel   (:channel body)
       :thread_ts thread_ts}
      (log/warnf "[slackbot] start-stream failed: %s" (:error body)))))

(defn append-stream
  "Append chunks to an active stream. Each chunk is a map with :type and type-specific keys,
   e.g. {:type \"markdown_text\" :text \"...\"} or {:type \"task_update\" :id \"...\" :title \"...\" :status \"...\"}."
  [client channel stream-ts chunks]
  (let [payload  {:channel channel
                  :ts      stream-ts
                  :chunks  chunks}
        body (:body (slack-post-json client "/chat.appendStream" payload))]
    (when-not (:ok body)
      (log/warnf "[slackbot] append-stream failed: %s" (:error body)))
    body))

(defn append-markdown-text
  "Helper to append markdown text to a stream."
  [client channel stream-ts text]
  (append-stream client channel stream-ts [{:type "markdown_text" :text text}]))

(defn stop-stream
  "Stop a stream and finalize it into a regular message."
  ([client channel stream-ts]
   (stop-stream client channel stream-ts nil))
  ([client channel stream-ts blocks]
   (let [body (:body (slack-post-json client "/chat.stopStream"
                                      (cond-> {:channel channel
                                               :ts      stream-ts}
                                        blocks (assoc :blocks blocks))))]
     (when-not (:ok body)
       (log/warnf "[slackbot] stop-stream failed: %s" (:error body)))
     body)))
