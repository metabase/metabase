(ns metabase.integrations.slack
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.core.memoize :as memoize]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.email.messages :as messages]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(defsetting slack-token
  (str (deferred-tru "Deprecated Slack API token for connecting the Metabase Slack bot.")
       " "
       (deferred-tru "Please use a new Slack app integration instead."))
  :deprecated "0.42.0")

(defsetting slack-app-token
  (str (deferred-tru "Bot user OAuth token for connecting the Metabase Slack app.")
       " "
       (deferred-tru "This should be used for all new Slack integrations starting in Metabase v0.42.0.")))

(defsetting slack-token-valid?
  (str (deferred-tru "Whether the current Slack app token, if set, is valid.")
       " "
       (deferred-tru "Set to 'false' if a Slack API request returns an auth error."))
  :type :boolean)

(defn process-files-channel-name
  "Converts empty strings to `nil`, and removes leading `#` from the channel name if present."
  [channel-name]
  (when-not (str/blank? channel-name)
    (if (str/starts-with? channel-name "#") (subs channel-name 1) channel-name)))

(defsetting slack-files-channel
  (deferred-tru "The name of the channel to which Metabase files should be initially uploaded")
  :default "metabase_files"
  :setter (fn [channel-name]
            (setting/set-value-of-type! :string :slack-files-channel (process-files-channel-name channel-name))))

(def ^:private ^String slack-api-base-url "https://slack.com/api")

(defn slack-configured?
  "Is Slack integration configured?"
  []
  (boolean (or (seq (slack-app-token)) (seq (slack-token)))))

(def ^:private slack-token-error-codes
  "List of error codes that indicate an invalid or revoked Slack token."
  ;; If any of these error codes are received from the Slack API, we send an email to all admins indicating that the
  ;; Slack integration is broken. In practice, the "account_inactive" error code is the one that is most likely to be
  ;; received. This would happen if access to the Slack workspace is manually revoked via the Slack UI.
  #{"invalid_auth", "account_inactive", "token_revoked", "token_expired"})

(def ^:private ^:dynamic *send-token-error-emails?*
  "Whether to send an email to all admins when an invalid or revoked token error is received in response to a Slack
  API call. Should be set to false when checking if an unsaved token is valid. (Default: `true`)"
  true)

(defn- handle-error [body]
  (let [invalid-token? (slack-token-error-codes (:error body))
        message        (if invalid-token?
                         (trs "Invalid token")
                         (trs "Slack API error: {0}" (:error body)))
        error          (if invalid-token?
                         {:error-code (:error body)
                          :errors     {:slack-token message}}
                         {:error-code (:error body)
                          :message    message
                          :response   body})]
    (when (and invalid-token? *send-token-error-emails?*)
      ;; Check `slack-token-valid?` before sending emails to avoid sending repeat emails for the same invalid token.
      ;; We should send an email if `slack-token-valid?` is `true` or `nil` (i.e. a pre-existing bot integration is
      ;; being used)
      (when (not (false? (slack-token-valid?))) (messages/send-slack-token-error-emails!))
      (slack-token-valid? false))
    (if invalid-token?
      (log/warn (u/pprint-to-str 'red (trs "🔒 Your Slack authorization token is invalid or has been revoked. Please update your integration in Admin Settings -> Slack.")))
      (log/warn (u/pprint-to-str 'red error)))
    (throw (ex-info message error))))

(defn- handle-response [{:keys [status body]}]
  (with-open [reader (io/reader body)]
    (let [body (json/parse-stream reader true)]
      (if (and (= 200 status) (:ok body))
        body
        (handle-error body)))))

(defn- do-slack-request [request-fn endpoint request]
  (let [token (or (get-in request [:query-params :token])
                  (get-in request [:form-params :token])
                  (slack-app-token)
                  (slack-token))]
    (when token
      (let [url     (str slack-api-base-url "/" (name endpoint))
            _       (log/trace "Slack API request: %s %s" (pr-str url) (pr-str request))
            request (m/deep-merge
                     {:headers        {:authorization (str "Bearer\n" token)}
                      :as             :stream
                      ;; use a relatively long connection timeout (10 seconds) in cases where we're fetching big
                      ;; amounts of data -- see #11735
                      :conn-timeout   10000
                      :socket-timeout 10000}
                     (m/dissoc-in request [:query-params :token]))]
        (try
          (handle-response (request-fn url request))
          (catch Throwable e
            (throw (ex-info (.getMessage e) (merge (ex-data e) {:url url, :request request}) e))))))))

(defn- GET
  "Make a GET request to the Slack API."
  [endpoint & {:as query-params}]
  (do-slack-request http/get endpoint {:query-params query-params}))

(defn- POST
  "Make a POST request to the Slack API."
  [endpoint body]
  (do-slack-request http/post endpoint body))

(defn- next-cursor
  "Get a cursor for the next page of results in a Slack API response, if one exists."
  [response]
  (not-empty (get-in response [:response_metadata :next_cursor])))

(def ^:private max-list-results
  "Absolute maximum number of results to fetch from Slack API list endpoints. To prevent unbounded pagination of
  results. Don't set this too low -- some orgs have many thousands of channels (see #12978)"
  10000)

(defn- paged-list-request
  "Make a GET request to a Slack API list `endpoint`, returning a sequence of objects returned by the top level
  `results-key` in the response. If additional pages of results exist, fetches those lazily, up to a total of
  `max-list-results`."
  [endpoint results-key params]
  ;; use default limit (page size) of 1000 instead of 100 so we don't end up making a hundred API requests for orgs
  ;; with a huge number of channels or users.
  (let [default-params {:limit 1000}
        response       (m/mapply GET endpoint (merge default-params params))]
    (when (seq response)
      (take
       max-list-results
       (concat
        (get response results-key)
        (when-let [next-cursor (next-cursor response)]
          (lazy-seq
           (paged-list-request endpoint results-key (assoc params :cursor next-cursor)))))))))

(defn conversations-list
  "Calls Slack API `conversations.list` and returns list of available 'conversations' (channels and direct messages). By
  default only fetches channels."
  [& {:as query-parameters}]
  (let [params (merge {:exclude_archived true, :types "public_channel"} query-parameters)]
    (paged-list-request "conversations.list" :channels params)))

(defn channel-with-name
  "Return a Slack channel with `channel-name` (as a map) if it exists."
  [channel-name]
  (some (fn [channel]
          (when (= (:name channel) channel-name)
            channel))
        (conversations-list)))

(s/defn valid-token?
  "Check whether a Slack token is valid by checking whether we can call `conversations.list` with it."
  [token :- su/NonBlankString]
  (try
    (binding [*send-token-error-emails?* false]
      (boolean (take 1 (conversations-list :limit 1, :token token))))
    (catch Throwable e
      (if (slack-token-error-codes (:error-code (ex-data e)))
        false
        (throw e)))))

(defn users-list
  "Calls Slack API `users.list` endpoint and returns the list of available users."
  [& {:as query-parameters}]
  (->> (paged-list-request "users.list" :members query-parameters)
       ;; filter out deleted users and bots. At the time of this writing there's no way to do this in the Slack API
       ;; itself so we need to do it after the fact.
       (filter (complement :deleted))
       (filter (complement :is_bot))))

(def ^:private ^{:arglists '([channel-name])} files-channel*
  ;; If the channel has successfully been created we can cache the information about it from the API response. We need
  ;; this information every time we send out a pulse, but making a call to the `conversations.list` endpoint everytime we
  ;; send a Pulse can result in us seeing 429 (rate limiting) status codes -- see
  ;; https://github.com/metabase/metabase/issues/8967
  ;;
  ;; Of course, if `files-channel*` *fails* (because the channel is not created), this won't get cached; this is what
  ;; we want -- to remind people to create it
  ;;
  ;; The memoized function is paramterized by the channel name so that if the name is changed, the cached channel details
  ;; will be refetched.
  (memoize/ttl
   (fn [channel-name]
     (or (when channel-name (channel-with-name channel-name))
         (let [message (str (tru "Slack channel named `{0}` is missing!" channel-name)
                            " "
                            (tru "Please create or unarchive the channel in order to complete the Slack integration.")
                            " "
                            (tru "The channel is used for storing images that are included in dashboard subscriptions."))]
           (log/error (u/format-color 'red message))
           (throw (ex-info message {:status-code 400})))))
   :ttl/threshold (u/hours->ms 6)))

(defn files-channel
  "Calls Slack api `channels.info` to check whether a channel exists with the expected name from the
  [[slack-files-channel]] setting. If it does, returns the channel details as a map. If it doesn't, throws an error
  that advices an admin to create it."
  []
  (files-channel* (slack-files-channel)))

(def ^:private NonEmptyByteArray
  (s/constrained
   (Class/forName "[B")
   not-empty
   "Non-empty byte array"))

(s/defn join-channel!
  "Given a channel ID, calls Slack API `conversations.join` endpoint to join the channel as the Metabase Slack app.
  This must be done before uploading a file to the channel, if using a Slack app integration."
  [channel-id :- su/NonBlankString]
  (POST "conversations.join" {:form-params {:channel channel-id}}))

(s/defn upload-file!
  "Calls Slack API `files.upload` endpoint and returns the URL of the uploaded file."
  [file :- NonEmptyByteArray, filename :- su/NonBlankString, channel-id :- su/NonBlankString]
  {:pre [(slack-configured?)]}
  (let [request  {:multipart [{:name "file",     :content file}
                              {:name "filename", :content filename}
                              {:name "channels", :content channel-id}]}
        response (try
                   (POST "files.upload" request)
                   (catch Throwable e
                     ;; If file upload fails with a "not_in_channel" error, we join the channel and try again.
                     ;; This is expected to happen the first time a Slack subscription is sent.
                     (if (= "not_in_channel" (:error-code (ex-data e)))
                       (do (join-channel! channel-id)
                           (POST "files.upload" request))
                       (throw e))))]
    (u/prog1 (get-in response [:file :url_private])
      (log/debug (trs "Uploaded image") <>))))

(s/defn post-chat-message!
  "Calls Slack API `chat.postMessage` endpoint and posts a message to a channel. `attachments` should be serialized
  JSON."
  [channel-id :- su/NonBlankString, text-or-nil :- (s/maybe s/Str) & [attachments]]
  ;; TODO: it would be nice to have an emoji or icon image to use here
  (POST "chat.postMessage"
        {:form-params
         {:channel     channel-id
          :username    "MetaBot"
          :icon_url    "http://static.metabase.com/metabot_slack_avatar_whitebg.png"
          :text        text-or-nil
          :attachments (when (seq attachments)
                         (json/generate-string attachments))}}))
