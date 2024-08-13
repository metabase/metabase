(ns metabase.integrations.slack
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.email.messages :as messages]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.string :as u.str]))

(set! *warn-on-reflection* true)

(defsetting slack-token
  (deferred-tru
    (str "Deprecated Slack API token for connecting the Metabase Slack bot. "
         "Please use a new Slack app integration instead."))
  :deprecated "0.42.0"
  :visibility :settings-manager
  :doc        false
  :audit      :never)

(defsetting slack-app-token
  (deferred-tru
   (str "Bot user OAuth token for connecting the Metabase Slack app. "
        "This should be used for all new Slack integrations starting in Metabase v0.42.0."))
  :visibility :settings-manager
  :getter (fn []
            (-> (setting/get-value-of-type :string :slack-app-token)
                (u.str/mask 9))))

(defn- unobfuscated-slack-app-token
  []
  (setting/get-value-of-type :string :slack-app-token))

(defsetting slack-token-valid?
  (deferred-tru
    (str "Whether the current Slack app token, if set, is valid. "
         "Set to 'false' if a Slack API request returns an auth error."))
  :type       :boolean
  :visibility :settings-manager
  :doc        false
  :audit      :never)

(defn process-files-channel-name
  "Converts empty strings to `nil`, and removes leading `#` from the channel name if present."
  [channel-name]
  (when-not (str/blank? channel-name)
    (if (str/starts-with? channel-name "#") (subs channel-name 1) channel-name)))

(defsetting slack-cached-channels-and-usernames
  "A cache shared between instances for storing an instance's slack channels and users."
  :visibility :internal
  :type       :json
  :doc        false
  :audit      :never)

(def ^:private zoned-time-epoch (t/zoned-date-time 1970 1 1 0))

(defsetting slack-channels-and-usernames-last-updated
  "The updated-at time for the [[slack-cached-channels-and-usernames]] setting."
  :visibility :internal
  :cache?     false
  :type       :timestamp
  :default    zoned-time-epoch
  :doc        false
  :audit      :never)

(defsetting slack-files-channel
  (deferred-tru "The name of the channel to which Metabase files should be initially uploaded")
  :default "metabase_files"
  :visibility :settings-manager
  :audit      :getter
  :setter (fn [channel-name]
            (setting/set-value-of-type! :string :slack-files-channel (process-files-channel-name channel-name))))

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
      (when (slack-token-valid?) (messages/send-slack-token-error-emails!))
      (slack-token-valid?! false))
    (when invalid-token?
      (log/warn (u/colorize :red (str "🔒 Your Slack authorization token is invalid or has been revoked. Please"
                                      " update your integration in Admin Settings -> Slack."))))
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
                  (unobfuscated-slack-app-token)
                  (slack-token))]
    (when token
      (let [url     (str "https://slack.com/api/" (name endpoint))
            _       (log/tracef "Slack API request: %s %s" (pr-str url) (pr-str request))
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
            (throw (ex-info (.getMessage e) (merge (ex-data e) {:url url}) e))))))))

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
  [endpoint response->data params]
  ;; use default limit (page size) of 1000 instead of 100 so we don't end up making a hundred API requests for orgs
  ;; with a huge number of channels or users.
  (let [default-params {:limit 1000}
        response       (m/mapply GET endpoint (merge default-params params))
        data           (response->data response)]
    (when (seq response)
      (take
       max-list-results
       (concat
        data
        (when-let [next-cursor (next-cursor response)]
          (lazy-seq
           (paged-list-request endpoint response->data (assoc params :cursor next-cursor)))))))))

(defn channel-transform
  "Transformation from slack's api representation of a channel to our own."
  [channel]
  {:display-name (str \# (:name channel))
   :name         (:name channel)
   :id           (:id channel)
   :type         "channel"})

(defn conversations-list
  "Calls Slack API `conversations.list` and returns list of available 'conversations' (channels and direct messages).
  By default only fetches channels, and returns them with their # prefix. Note the call to [[paged-list-request]] will
  only fetch the first [[max-list-results]] items."
  [& {:as query-parameters}]
  (let [params (merge {:exclude_archived true, :types "public_channel"} query-parameters)]
    (paged-list-request "conversations.list"
                        ;; response -> channel names
                        #(->> % :channels (map channel-transform))
                        params)))

(defn channel-exists?
  "Returns a Boolean indicating whether a channel with a given name exists in the cache."
  [channel-name]
  (boolean
   (let [channel-names (into #{} (comp (map (juxt :name :id))
                                       cat)
                             (:channels (slack-cached-channels-and-usernames)))]
     (and channel-name (contains? channel-names channel-name)))))

(mu/defn valid-token?
  "Check whether a Slack token is valid by checking if the `conversations.list` Slack api accepts it."
  [token :- ms/NonBlankString]
  (try
    (binding [*send-token-error-emails?* false]
      (boolean (take 1 (:channels (GET "conversations.list" :limit 1, :token token)))))
    (catch Throwable e
      (if (slack-token-error-codes (:error-code (ex-data e)))
        false
        (throw e)))))

(defn user-transform
  "Tranformation from slack api user to our own internal representation."
  [member]
  {:display-name (str \@ (:name member))
   :type         "user"
   :name         (:name member)
   :id           (:id member)})

(defn users-list
  "Calls Slack API `users.list` endpoint and returns the list of available users with their @ prefix. Note the call
  to [[paged-list-request]] will only fetch the first [[max-list-results]] items."
  [& {:as query-parameters}]
  (->> (paged-list-request "users.list"
                           ;; response -> user names
                           #(->> % :members (map user-transform))
                           query-parameters)
       ;; remove deleted users and bots. At the time of this writing there's no way to do this in the Slack API
       ;; itself so we need to do it after the fact.
       (remove :deleted)
       (remove :is_bot)))

(defonce ^:private refresh-lock (Object.))

(defn- needs-refresh? []
  (u.date/older-than?
   (slack-channels-and-usernames-last-updated)
   (t/minutes 10)))

(defn clear-channel-cache!
  "Clear the Slack channels cache, and reset its last-updated timestamp to its default value (the Unix epoch)."
  []
  (slack-channels-and-usernames-last-updated! zoned-time-epoch)
  (slack-cached-channels-and-usernames! {:channels []}))

(defn refresh-channels-and-usernames!
  "Refreshes users and conversations in slack-cache. finds both in parallel, sets
  [[slack-cached-channels-and-usernames]], and resets the [[slack-channels-and-usernames-last-updated]] time."
  []
  (when (slack-configured?)
    (log/info "Refreshing slack channels and usernames.")
    (let [users (future (vec (users-list)))
          conversations (future (vec (conversations-list)))]
      (slack-cached-channels-and-usernames! {:channels (concat @conversations @users)})
      (slack-channels-and-usernames-last-updated! (t/zoned-date-time)))))

(defn refresh-channels-and-usernames-when-needed!
  "Refreshes users and conversations in slack-cache on a per-instance lock."
  []
  (when (needs-refresh?)
    (locking refresh-lock
      (when (needs-refresh?)
        (refresh-channels-and-usernames!)))))

(defn files-channel
  "Looks in [[slack-cached-channels-and-usernames]] to check whether a channel exists with the expected name from the
  [[slack-files-channel]] setting with an # prefix. If it does, returns the channel details as a map. If it doesn't,
  throws an error that advices an admin to create it."
  []
  (let [channel-name (slack-files-channel)]
    (if (channel-exists? channel-name)
      channel-name
      (let [message (str (tru "Slack channel named `{0}` is missing!" channel-name)
                         " "
                         (tru "Please create or unarchive the channel in order to complete the Slack integration.")
                         " "
                         (tru "The channel is used for storing images that are included in dashboard subscriptions."))]
        (log/error (u/format-color 'red message))
        (throw (ex-info message {:status-code 400}))))))

(def ^:private NonEmptyByteArray
  [:and
   (ms/InstanceOfClass (Class/forName "[B"))
   [:fn not-empty]])

(mu/defn join-channel!
  "Given a channel ID, calls Slack API `conversations.join` endpoint to join the channel as the Metabase Slack app.
  This must be done before uploading a file to the channel, if using a Slack app integration."
  [channel-id :- ms/NonBlankString]
  (POST "conversations.join" {:form-params {:channel channel-id}}))

(defn- maybe-lookup-id
  "Slack requires the slack app to be in the channel that we post all of our attachments to. Slack changed (around June
  2022 #23229) the \"conversations.join\" api to require the internal slack id rather than the common name. This makes
  a lot of sense to ensure we continue to operate despite channel renames. Attempt to look up the channel-id in the
  list of channels to obtain the internal id. Fallback to using the current channel-id."
  [channel-id cached-channels]
  (let [name->id    (into {} (comp (filter (comp #{"channel"} :type))
                                   (map (juxt :name :id)))
                          (:channels cached-channels))
        channel-id' (get name->id channel-id channel-id)]
    channel-id'))

(defn- poll
  "Returns `(thunk)` if the result satisfies the `done?` predicate within the timeout and nil otherwise."
  [{:keys [thunk done? timeout-ms ^long interval-ms]}]
  (let [start-time (System/currentTimeMillis)]
    (loop []
      (let [response (thunk)]
        (if (done? response)
          response
          (let [current-time (System/currentTimeMillis)
                elapsed-time (- current-time start-time)]
            (if (>= elapsed-time timeout-ms)
              nil ; timeout reached
              (do
                (Thread/sleep interval-ms)
                (recur)))))))))

(defn complete!
  "Completes the file upload to a Slack channel by calling the `files.completeUploadExternal` endpoint, and polls the
   same endpoint until the file is uploaded to the channel. Returns the URL of the uploaded file."
  [& {:keys [channel-id file-id filename]}]
  (let [complete! (fn []
                    (POST "files.completeUploadExternal"
                      {:query-params {:files      (json/generate-string [{:id file-id, :title filename}])
                                      :channel_id channel-id}}))
        complete-response (try
                            (complete!)
                            (catch Throwable e
                              ;; If file upload fails with a "not_in_channel" error, we join the channel and try again.
                              ;; This is expected to happen the first time a Slack subscription is sent.
                              (if (= "not_in_channel" (:error-code (ex-data e)))
                                (do (join-channel! channel-id)
                                    (complete!))
                                (throw (ex-info (ex-message e)
                                                (assoc (ex-data e) :channel-id channel-id, :filename filename))))))
        ;; Step 4: Poll the endpoint to confirm the file is uploaded to the channel
        uploaded-to-channel? (fn [response]
                               (boolean (some-> response :files first :shares not-empty)))
        _ (when-not (or
                     (uploaded-to-channel? complete-response)
                     (u/poll {:thunk       complete!
                              :done?       uploaded-to-channel?
                              ;; Cal 2024-04-30: this typically takes 1-2 seconds to succeed.
                              ;; If it takes more than 20 seconds, something else is wrong and we should abort.
                              :timeout-ms  20000
                              :interval-ms 500}))
            (throw (ex-info "Timed out waiting to confirm the file was uploaded to a Slack channel."
                            {:channel-id channel-id, :filename filename})))]
    (get-in complete-response [:files 0 :url_private])))

(defn- get-upload-url! [filename file]
  (POST "files.getUploadURLExternal" {:query-params {:filename filename
                                                     :length   (count file)}}))


(defn- upload-file-to-url! [upload-url file]
  (let [response (http/post upload-url {:multipart [{:name "file", :content file}]})]
    (if (= (:status response) 200)
      response
      (throw (ex-info "Failed to upload file to Slack:" (select-keys response [:status :body]))))))

(mu/defn upload-file!
  "Calls Slack API `files.getUploadURLExternal` and `files.completeUploadExternal` endpoints to upload a file and returns
   the URL of the uploaded file."
  [file       :- NonEmptyByteArray
   filename   :- ms/NonBlankString
   channel-id :- ms/NonBlankString]
  {:pre [(slack-configured?)]}
  ;; TODO: we could make uploading files a lot faster by uploading the files in parallel.
  ;; Steps 1 and 2 can be done for all files in parallel, and step 3 can be done once at the end.
  (let [;; Step 1: Get the upload URL using files.getUploadURLExternal
        {:keys [upload_url file_id]} (get-upload-url! filename file)
        ;; Step 2: Upload the file to the obtained upload URL
        _ (upload-file-to-url! upload_url file)
        ;; Step 3: Complete the upload using files.completeUploadExternal
        file-url (complete! {:channel-id (maybe-lookup-id channel-id (slack-cached-channels-and-usernames))
                             :file-id    file_id
                             :filename   filename})]
    (u/prog1 file-url
      (log/debug "Uploaded image" <>))))

(mu/defn post-chat-message!
  "Calls Slack API `chat.postMessage` endpoint and posts a message to a channel. `attachments` should be serialized
  JSON."
  [channel-id  :- ms/NonBlankString
   text-or-nil :- [:maybe :string]
   & [attachments]]
  ;; TODO: it would be nice to have an emoji or icon image to use here
  (POST "chat.postMessage"
        {:form-params
         {:channel     channel-id
          :username    "MetaBot"
          :icon_url    "http://static.metabase.com/metabot_slack_avatar_whitebg.png"
          :text        text-or-nil
          :attachments (when (seq attachments)
                         (json/generate-string attachments))}}))
