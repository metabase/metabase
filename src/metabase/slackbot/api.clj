(ns metabase.slackbot.api
  "`/api/metabot/slack` routes"
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.core :as analytics.core]
   [metabase.api.macros :as api.macros]
   [metabase.channel.settings :as channel.settings]
   [metabase.config.core :as config]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.feedback :as metabot.feedback]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.server.settings :as server.settings]
   [metabase.settings.core :as setting]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.slackbot.config :as slackbot.config]
   [metabase.slackbot.events :as slackbot.events]
   [metabase.slackbot.persistence :as slackbot.persistence]
   [metabase.slackbot.settings :as slackbot.settings]
   [metabase.slackbot.streaming :as slackbot.streaming]
   [metabase.slackbot.uploads :as slackbot.uploads]
   [metabase.sso.settings :as sso-settings]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent ExecutorService Executors ThreadFactory)))

(set! *warn-on-reflection* true)

(defonce ^:private event-handler-executor
  (delay
    (let [counter (atom 0)
          factory (reify ThreadFactory
                    (newThread [_ r]
                      (doto (Thread. r (str "slack-event-handler-" (swap! counter inc)))
                        (.setDaemon true))))]
      (Executors/newFixedThreadPool (long (slackbot.settings/slackbot-event-handler-pool-size)) factory))))

(defn- submit-async
  "Submit a function for async execution on the bounded event handler thread pool."
  [f]
  (.submit ^ExecutorService @event-handler-executor
           ^Runnable (bound-fn* f)))

(defn clear-slack-bot-settings!
  "Clears all slackbot-related settings when Slack token is cleared."
  []
  (setting/set-many! {:slack-connect-enabled        false
                      :slack-connect-client-id      nil
                      :slack-connect-client-secret  nil
                      :metabot-slack-signing-secret nil})
  nil)

;; ------------------------- VALIDATION ----------------------------------

(defn- assert-valid-slack-req
  "Asserts that incoming Slack request has a valid signature."
  [request]
  (when-not (slackbot.settings/unobfuscated-metabot-slack-signing-secret)
    (throw (ex-info (str (tru "Slack integration is not fully configured.")) {:status-code 503})))
  (when-not (:slack/validated? request)
    (throw (ex-info (str (tru "Slack request signature is not valid.")) {:status-code 401}))))

;; ------------------------- AUTHENTICATION ------------------------------

(defn- current-signing-secret-version
  []
  (or (server.settings/slack-connect-signing-secret-version) 0))

(defn- auth-identity-signing-secret-version
  [identity]
  (or (get-in identity [:metadata :signing_secret_version]) 0))

(defn- slack-id->user-id
  "Look up a Metabase user ID from Slack user ID. Only returns a match if the identity was created under the current
  signing secret version, so that rotating the secret automatically invalidates existing identity links. Legacy
  identities without an explicit version are treated as version 0."
  [slack-user-id]
  (let [identity (t2/select-one [:model/AuthIdentity :user_id :metadata]
                                :provider "slack-connect"
                                :provider_id slack-user-id
                                {:join     [[:core_user :user] [:= :user.id :auth_identity.user_id]]
                                 :where    [:= :user.is_active true]
                                 :order-by [[:created_at :desc]]})]
    (when (= (auth-identity-signing-secret-version identity)
             (current-signing-secret-version))
      (:user_id identity))))

(defn- slack-user-authorize-link
  "Link to page where user can initiate SSO auth flow to authorize slackbot"
  []
  (let [sso-url "/auth/sso/slack-connect?redirect=/slack-connect-success"]
    (str (system/site-url) "/auth/login?redirect=" (codec/url-encode sso-url))))

(defn- send-auth-link
  "Respond to an incoming slack message with a request to authorize.
   In channels, sends an ephemeral message (only visible to the user).
   In DMs, sends a regular threaded reply."
  [client event]
  (let [msg     "Connect your Slack account to Metabase. Once linked, I can use your permissions to query data on your behalf."
        dm?     (slackbot.events/dm? event)
        ;; always thread dms, but only thread in channels if message is within a thread already
        thread-ts (if dm?
                    (or (:thread_ts event) (:ts event))
                    (:thread_ts event))
        payload (cond-> {:channel (:channel event)
                         :text msg
                         :blocks [{:type "section"
                                   :text {:type "mrkdwn"
                                          :text msg}}
                                  {:type "actions"
                                   :elements [{:type "button"
                                               :text {:type "plain_text"
                                                      :text ":link: Connect to Metabase"
                                                      :emoji true}
                                               :url (slack-user-authorize-link)}]}]}
                  thread-ts (assoc :thread_ts thread-ts))]
    (if dm?
      (slackbot.client/post-message client payload)
      (slackbot.client/post-ephemeral-message client (assoc payload :user (:user event))))))

(defn- require-authenticated-slack-user!
  "Returns Metabase user-id if authenticated, nil otherwise.
   Sends auth link as side-effect when not authenticated."
  [client event]
  (if-let [user-id (slack-id->user-id (:user event))]
    user-id
    (do (send-auth-link client event) nil)))

;; ------------------------- EVENT HANDLING ------------------------------

(mu/defn- handle-url-verification :- slackbot.events/SlackEventsResponse
  "Respond to a url_verification request (docs: https://docs.slack.dev/reference/events/url_verification)"
  [event :- slackbot.events/SlackUrlVerificationEvent]
  {:status  200
   :headers {"Content-Type" "text/plain"}
   :body    (:challenge event)})

(def ^:private ack-msg
  "Acknowledgement payload"
  {:status  200
   :headers {"Content-Type" "text/plain"}
   :body    "ok"})

(defn- all-files-skipped?
  "Returns true if all files were skipped (none were CSV/TSV)."
  [{:keys [upload-result]}]
  (let [{:keys [results skipped]} upload-result]
    (and (seq skipped)
         (empty? results))))

(mu/defn- handle-message-file-share
  "Process a file_share message - handles CSV uploads"
  [client :- slackbot.client/SlackClient
   event  :- slackbot.events/SlackMessageFileShareEvent]
  (let [files         (:files event)
        text          (:text event)
        has-text?     (not (str/blank? text))
        file-handling (when (seq files)
                        (slackbot.uploads/handle-file-uploads files))
        extra-history (cond
                        ;; Pre-flight error (uploads disabled, no permission)
                        (:error file-handling)
                        [{:role :assistant
                          :content (:error file-handling)}]

                        ;; Upload results to communicate to AI
                        (:system-messages file-handling)
                        (:system-messages file-handling))
        all-skipped?    (all-files-skipped? file-handling)
        should-skip-ai? (and (not has-text?)
                             (not (:error file-handling))
                             all-skipped?)]
    ;; If all files were skipped (non-CSV) and there's no text, respond directly
    ;; without calling the AI to avoid sending an empty prompt
    (if should-skip-ai?
      (let [skipped-files (get-in file-handling [:upload-result :skipped])]
        (slackbot.client/post-message client
                                      (merge (slackbot.events/event->reply-context event)
                                             {:text (format "I can only process CSV and TSV files. The following files were skipped: %s"
                                                            (str/join ", " skipped-files))})))
      (slackbot.streaming/send-response client event extra-history))))

(defmethod analytics.core/known-labels :metabase-slackbot/responses-generated [_]
  [{:source "dm"      :result "success"}
   {:source "dm"      :result "error"}
   {:source "channel" :result "success"}
   {:source "channel" :result "error"}])

(defmethod analytics.core/known-labels :metabase-slackbot/file-uploads [_]
  [{:result "success"} {:result "error"}])

(defn- event-source
  "Return the source label for a Slack event: \"dm\" or \"channel\"."
  [event]
  (if (slackbot.events/dm? event) "dm" "channel"))

(defn- process-async
  "Process an event asynchronously with logging and error handling.
   Authenticates the user and calls handler with [client event]."
  [handler client event]
  (let [event-type (or (:subtype event) (:channel_type event) (:type event))]
    (log/debugf "[slackbot] Processing %s event" event-type)
    (submit-async
     (fn []
       (try
         (when-let [user-id (require-authenticated-slack-user! client event)]
           (request/with-current-user user-id
             (let [source (event-source event)
                   timer  (u/start-timer)]
               (try
                 (handler client event)
                 (analytics/inc! :metabase-slackbot/responses-generated {:source source :result "success"})
                 (catch Exception e
                   (analytics/inc! :metabase-slackbot/responses-generated {:source source :result "error"})
                   (throw e))
                 (finally
                   (analytics/observe! :metabase-slackbot/response-duration-ms {:source source} (u/since-ms timer)))))))
         (catch Exception e
           (log/errorf e "[slackbot] Error processing %s: %s" event-type (ex-message e))))))))

(defn- ignore-event
  "Handle any event we don't care to process"
  [event]
  (log/debugf "[slackbot] Ignoring event type=%s channel_type=%s subtype=%s ts=%s"
              (:type event) (:channel_type event) (:subtype event) (:ts event)))

(def ^:private delete-reaction-names
  "Slack emoji names that trigger metabot-response deletion."
  #{"wastebasket" "x"})

(def ^:private removed-notice-blocks
  [{:type "section"
    :text {:type "mrkdwn"
           :text "_Message has been removed._"}}])

(defn- removed-notice-payload
  [channel-id message-ts]
  {:channel channel-id
   :ts      message-ts
   :text    "Message has been removed."
   :blocks  removed-notice-blocks})

(defn- replace-response-with-removed-notice!
  "Replace the Slack message first, then mark the stored response as deleted once Slack confirms the update."
  [client channel-id message-ts deleter-user-id]
  (let [res (slackbot.client/update-message client (removed-notice-payload channel-id message-ts))]
    (if (:ok res)
      (do
        (when-not (slackbot.persistence/soft-delete-response! channel-id message-ts deleter-user-id)
          (log/warnf "[slackbot] Slack message updated but soft delete was not recorded (channel=%s ts=%s user_id=%s)"
                     channel-id message-ts deleter-user-id))
        (analytics/inc! :metabase-slackbot/responses-deleted)
        true)
      (do
        (log/warnf "[slackbot] Failed to replace metabot response with removed notice: %s (channel=%s ts=%s user_id=%s)"
                   (:error res) channel-id message-ts deleter-user-id)
        false))))

(defn- authorize-delete-request
  "Resolve whether a Slack delete request is authorized for the target metabot response."
  [slack-user-id channel-id message-ts]
  (cond
    (nil? channel-id)
    {:status     :ignored
     :reason     :missing-channel
     :message-ts message-ts}

    (nil? message-ts)
    {:status     :ignored
     :reason     :missing-message-ts
     :channel-id channel-id}

    :else
    (let [request-user-id (slack-id->user-id slack-user-id)]
      (if (nil? request-user-id)
        {:status        :ignored
         :reason        :unlinked-user
         :slack-user-id slack-user-id
         :channel-id    channel-id
         :message-ts    message-ts}
        (if-let [owner-user-id (slackbot.persistence/response-owner-user-id channel-id message-ts)]
          (if (= request-user-id owner-user-id)
            {:status          :authorized
             :channel-id      channel-id
             :message-ts      message-ts
             :request-user-id request-user-id}
            {:status          :ignored
             :reason          :not-owner
             :channel-id      channel-id
             :message-ts      message-ts
             :request-user-id request-user-id
             :owner-user-id   owner-user-id})
          {:status     :ignored
           :reason     :untracked-message
           :channel-id channel-id
           :message-ts message-ts})))))

(defn- log-ignored-delete-request
  "Log expected delete-request ignore paths at debug level."
  [{:keys [source reason channel-id message-ts slack-user-id request-user-id owner-user-id reaction]}]
  (case reason
    :missing-channel
    (log/debugf "[slackbot] Ignoring %s delete request with missing channel for ts=%s reaction=%s"
                source message-ts reaction)

    :missing-message-ts
    (log/debugf "[slackbot] Ignoring %s delete request with missing message ts in channel=%s reaction=%s"
                source channel-id reaction)

    :unlinked-user
    (log/debugf "[slackbot] Ignoring %s delete request from unlinked slack user=%s reaction=%s channel=%s ts=%s"
                source slack-user-id reaction channel-id message-ts)

    :not-owner
    (log/debugf "[slackbot] Ignoring %s delete request from non-owner user_id=%s owner_user_id=%s channel=%s ts=%s reaction=%s"
                source request-user-id owner-user-id channel-id message-ts reaction)

    :untracked-message
    (log/debugf "[slackbot] Ignoring %s delete request for untracked message channel=%s ts=%s reaction=%s"
                source channel-id message-ts reaction)))

(defn- delete-reaction-event?
  "True when this event is a delete reaction added to a message."
  [event]
  (and (slackbot.events/reaction-added? event)
       (= "message" (get-in event [:item :type]))
       (contains? delete-reaction-names (:reaction event))))

(defn- handle-delete-reaction
  "Replace a metabot response with a removed notice when the original request user reacts with an approved emoji."
  [client event]
  (try
    (let [slack-user-id (:user event)
          reaction      (:reaction event)
          channel-id    (get-in event [:item :channel])
          message-ts    (get-in event [:item :ts])
          authorization (authorize-delete-request slack-user-id channel-id message-ts)]
      (case (:status authorization)
        :authorized
        (when (replace-response-with-removed-notice! client channel-id message-ts (:request-user-id authorization))
          (log/debugf "[slackbot] Replaced metabot response via reaction=%s channel=%s ts=%s"
                      reaction channel-id message-ts))

        (log-ignored-delete-request (assoc authorization
                                           :source   "reaction"
                                           :reaction reaction))))
    (catch Exception e
      (log/error e "[slackbot] Error handling delete reaction"))))

(defn- assert-setup-complete
  "Asserts that all required Slack settings have been configured."
  []
  (when-not (slackbot.config/setup-complete?)
    (log/errorf "[slackbot] Slack setup incomplete (site_url=%s sso_enabled=%s client_id=%s client_secret=%s signing_secret=%s app_token=%s encryption=%s)"
                (boolean (system/site-url))
                (boolean (sso-settings/slack-connect-enabled))
                (boolean (sso-settings/slack-connect-client-id))
                (boolean (sso-settings/slack-connect-client-secret))
                (boolean (slackbot.settings/metabot-slack-signing-secret))
                (boolean (channel.settings/unobfuscated-slack-app-token))
                (boolean (encryption/default-encryption-enabled?)))
    (throw (ex-info (str (tru "Slack integration is not fully configured.")) {:status-code 503}))))

(mu/defn- handle-event-callback :- slackbot.events/SlackEventsResponse
  "Respond to an event_callback request"
  [payload :- slackbot.events/SlackEventCallbackEvent]
  (assert-setup-complete)
  (when (sso-settings/slack-connect-enabled)
    (let [client {:token (channel.settings/unobfuscated-slack-app-token)}
          event (:event payload)]
      (log/debugf "[slackbot] Event callback: event_type=%s user=%s channel=%s"
                  (:type event) (:user event) (:channel event))
      (cond
        ((some-fn
          slackbot.events/bot-message? ;; ignore the bot's own messages
          slackbot.events/edited-message? ;; ignore message edits
          slackbot.events/message-deleted? ;; ignore message deletion notifications
          slackbot.events/app-mention-with-files?) ;; processed via the separate file_share event
         event)
        (ignore-event event)

        (and
         (slackbot.events/file-share? event)
         (slackbot.events/dm-or-channel-mention? event (slackbot.client/get-bot-user-id client)))
        (process-async handle-message-file-share client event)

        (delete-reaction-event? event)
        (submit-async (fn [] (handle-delete-reaction client event)))

        (slackbot.events/reaction-added? event)
        (log/debugf "[slackbot] Ignoring reaction_added for non-delete emoji reaction=%s item_type=%s channel=%s ts=%s"
                    (:reaction event) (get-in event [:item :type]) (get-in event [:item :channel]) (get-in event [:item :ts]))

        (or (slackbot.events/app-mention? event)
            (slackbot.events/dm? event))
        (process-async slackbot.streaming/send-response client event)

        :else
        (ignore-event event))))
  ack-msg)

;; ----------------------- ROUTES --------------------------

(api.macros/defendpoint :post "/events" :- slackbot.events/SlackEventsResponse
  "Respond to activities in Slack"
  [_route-params
   _query-params
   body :- [:multi {:dispatch :type}
            ["url_verification" slackbot.events/SlackUrlVerificationEvent]
            ["event_callback"   slackbot.events/SlackEventCallbackEvent]
            [::mc/default       [:map [:type :string]]]]
   request]
  (log/debugf "[slackbot] Incoming Slack request type=%s slack_event_type=%s request_ts=%s"
              (:type body)
              (get-in body [:event :type])
              (get-in request [:headers "x-slack-request-timestamp"]))
  (assert-valid-slack-req request)
  (log/debugf "[slackbot] Received Slack event type=%s slack_event_type=%s" (:type body) (get-in body [:event :type]))
  ;; all handlers must respond within 3 seconds or slack will retry
  (case (:type body)
    "url_verification" (handle-url-verification body)
    "event_callback"   (handle-event-callback body)
    ack-msg))

(def SlackBotSettingsRequest
  "Malli schema for the request body of PUT /api/metabot/slack/settings.
   All credential fields must be provided together (either all set or all nil)."
  [:map
   [:slack-connect-client-id      [:maybe ms/NonBlankString]]
   [:slack-connect-client-secret  [:maybe ms/NonBlankString]]
   [:metabot-slack-signing-secret [:maybe ms/NonBlankString]]])

(def SlackBotSettingsResponse
  "Malli schema for the response of PUT /api/metabot/slack/settings."
  [:map
   [:ok :boolean]])

(api.macros/defendpoint :put "/settings" :- SlackBotSettingsResponse
  "Update Metabot Slack settings atomically.
   All credential fields must be provided together.
   Setting values requires the metabot-v3 feature, but clearing values is always allowed.
   slack-connect-enabled is automatically set to true when credentials are provided, nil when cleared."
  [_route-params
   _query-params
   {:keys [slack-connect-client-id
           slack-connect-client-secret
           metabot-slack-signing-secret]} :- SlackBotSettingsRequest]
  (perms/check-has-application-permission :setting)
  (let [all-set?   (and slack-connect-client-id
                        slack-connect-client-secret
                        metabot-slack-signing-secret)
        all-unset? (and (nil? slack-connect-client-id)
                        (nil? slack-connect-client-secret)
                        (nil? metabot-slack-signing-secret))
        signing-secret-changed? (and all-set?
                                     (not= metabot-slack-signing-secret
                                           (server.settings/unobfuscated-metabot-slack-signing-secret)))]
    ;; all values must be set together or unset together
    (when-not (or all-set? all-unset?)
      (throw (ex-info (tru "Must provide client id, client secret and signing secret together.")
                      {:status-code 400})))
    (setting/set-many! {:slack-connect-client-id      slack-connect-client-id
                        :slack-connect-client-secret  slack-connect-client-secret
                        :metabot-slack-signing-secret metabot-slack-signing-secret
                        :slack-connect-enabled        (boolean all-set?)})
    (when signing-secret-changed?
      (server.settings/slack-connect-signing-secret-version!
       (inc (current-signing-secret-version))))
    {:ok true}))

;; ------------------------- FEEDBACK BUTTONS ------------------------------

(def ^:private issue-type-options
  [{:text {:type "plain_text" :text "Wrong or unhelpful chart"}  :value "unhelpful-chart"}
   {:text {:type "plain_text" :text "Wrong chart type"}          :value "wrong-chart-type"}
   {:text {:type "plain_text" :text "Incorrect data or results"} :value "not-factual"}
   {:text {:type "plain_text" :text "Did not follow request"}    :value "did-not-follow-request"}
   {:text {:type "plain_text" :text "Incomplete response"}       :value "incomplete-response"}
   {:text {:type "plain_text" :text "Other"}                     :value "other"}])

(defn- feedback-modal-view
  "Build a Slack modal view for collecting detailed feedback."
  [positive private-metadata]
  {:type             "modal"
   :callback_id      "metabot_feedback_modal"
   :notify_on_close  false
   :title            {:type "plain_text" :text "Metabot feedback"}
   :submit           {:type "plain_text" :text "Submit"}
   :close            {:type "plain_text" :text "Cancel"}
   :private_metadata (json/encode private-metadata)
   :blocks
   (let [freeform-block {:type     "input"
                         :block_id "freeform_feedback"
                         :optional true
                         :element  {:type        "plain_text_input"
                                    :action_id   "freeform_input"
                                    :multiline   true
                                    :placeholder {:type "plain_text"
                                                  :text (if positive
                                                          "Tell us what you liked!"
                                                          "What could be improved about this response?")}}
                         :label    {:type "plain_text" :text "Any details you'd like to share?"}}]
     (if positive
       [freeform-block]
       [{:type     "input"
         :block_id "issue_type"
         :optional true
         :element  {:type        "static_select"
                    :action_id   "issue_type_select"
                    :placeholder {:type "plain_text" :text "Select issue type"}
                    :options     issue-type-options}
         :label    {:type "plain_text" :text "What kind of issue are you reporting?"}}
        freeform-block]))})

(defn- get-conversation-messages
  "Retrieve all messages for a conversation from the database."
  [conversation-id]
  (when conversation-id
    (t2/select :model/MetabotMessage
               :conversation_id conversation-id
               :deleted_at nil
               {:order-by [[:created_at :asc]]})))

(defn- build-base-feedback
  "Build the common feedback payload fields."
  [user-id conversation-id positive]
  {:metabot_id        (metabot.config/normalize-metabot-id "slackbotmetabotmetabo")
   :feedback          {:positive          positive
                       :message_id        conversation-id
                       :freeform_feedback ""}
   :conversation_data {:messages (get-conversation-messages conversation-id)}
   :version           config/mb-version-info
   :submission_time   (str (java.time.OffsetDateTime/now))
   :is_admin          (boolean (t2/select-one-fn :is_superuser :model/User :id user-id))
   :source            "slack"})

(defn- handle-feedback-action
  "Handle a metabot feedback button click from Slack.
   Opens the detail modal immediately (trigger_id expires in 3s). Feedback is
   submitted to Harbormaster only when the user submits the modal."
  [{:keys [action trigger-id slack-user-id channel-id message-ts]}]
  (let [{:keys [conversation_id positive]} (json/decode (:value action) true)
        client  {:token (channel.settings/unobfuscated-slack-app-token)}
        user-id (slack-id->user-id slack-user-id)]
    (when user-id
      (try
        (slackbot.client/open-view
         client
         {:trigger_id trigger-id
          :view       (feedback-modal-view positive {:conversation_id conversation_id
                                                     :positive        positive
                                                     :user_id         user-id
                                                     :channel_id      channel-id
                                                     :message_ts      message-ts})})
        (catch Exception e
          (log/errorf e "[slackbot] Error opening feedback modal: %s" (ex-data e)))))))

(defn- handle-delete-action
  "Handle replacing a metabot response message with a removed notice.
   Only the user who triggered the response can do this."
  [{:keys [slack-user-id channel-id message-ts]}]
  (let [authorization (authorize-delete-request slack-user-id channel-id message-ts)]
    (case (:status authorization)
      :authorized
      (let [client {:token (channel.settings/unobfuscated-slack-app-token)}]
        (submit-async
         (fn []
           (try
             (replace-response-with-removed-notice! client channel-id message-ts (:request-user-id authorization))
             (catch Exception e
               (log/errorf e "[slackbot] Error replacing metabot response with removed notice: %s" (ex-data e)))))))

      (log-ignored-delete-request (assoc authorization :source "action")))))

(defn- handle-feedback-modal-submission
  "Handle submission of the feedback details modal. Submits detailed feedback to Harbormaster."
  [payload]
  (let [private-metadata (json/decode (get-in payload [:view :private_metadata]) true)
        {:keys [conversation_id positive user_id]} private-metadata
        values           (get-in payload [:view :state :values])
        issue-type       (get-in values [:issue_type :issue_type_select :selected_option :value])
        freeform         (get-in values [:freeform_feedback :freeform_input :value])]
    (submit-async
     (fn []
       (try
         (metabot.feedback/submit-to-harbormaster!
          (cond-> (build-base-feedback user_id conversation_id positive)
            true       (assoc-in [:feedback :freeform_feedback] (or freeform ""))
            issue-type (assoc-in [:feedback :issue_type] issue-type)))
         (catch Exception e
           (log/error e "[slackbot] Error submitting feedback to Harbormaster")))))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/interactive"
  "Handle interactive payloads from Slack (button clicks, modal submissions)."
  [_route-params _query-params _body request]
  (assert-valid-slack-req request)
  (let [payload (-> (get-in request [:params :payload])
                    (json/decode true))]
    (case (:type payload)
      "block_actions"
      (let [actions    (:actions payload)
            slack-user (get-in payload [:user :id])
            trigger-id (:trigger_id payload)
            channel-id (get-in payload [:channel :id])
            message-ts (get-in payload [:message :ts])]
        (doseq [action actions]
          (case (:action_id action)
            "metabot_feedback"
            (handle-feedback-action {:action        action
                                     :trigger-id    trigger-id
                                     :slack-user-id slack-user
                                     :channel-id    channel-id
                                     :message-ts    message-ts})

            "metabot_delete_response"
            (handle-delete-action {:slack-user-id slack-user
                                   :channel-id    channel-id
                                   :message-ts    message-ts})
            nil)))

      "view_submission"
      (when (= (get-in payload [:view :callback_id]) "metabot_feedback_modal")
        (handle-feedback-modal-submission payload))

      nil))
  {:status 200 :body ""})

(def ^{:arglists '([request respond raise])} routes
  "`/api/metabot/slack` routes."
  (api.macros/ns-handler *ns*))

;; -------------- LOCAL DEV SETUP -------------------

(comment
  ;; New slack app
  ;; 1. create a tunnel via `ngrok http 3000`
  ;; 2. update your site url to the provided tunnel url
  (system/site-url! "https://<random-id>.ngrok-free.app")
  ;; 4. visit this url in your browser, following the setup flow outlined there
  (str (system/site-url) "/admin/metabot/slackbot")
  ;; 6. verify you've setup your instance correctly
  (slackbot.config/setup-complete?)

  ;; Updating an existing slack app
  ;; 1. create a tunnel via `ngrok http 3000`
  ;; 2. update your site url to the provided tunnel url
  (system/site-url! "https://3ee6-104-174-230-42.ngrok-free.app")
  ;; 3. visit the app manifest slack settings page for your slack app (https://app.slack.com/app-settings/.../..../app-manifest)
  ;; 4. execute this form to copy the manifest to clipboard, paste the result in the manifest page
  (do
    (require '[clojure.java.shell :refer [sh]])
    (sh "pbcopy" :in (json/encode (get-slack-manifest) {:pretty true}))))
  ;; 5. there will be a notification at the top of the manifest page to verify your new site url, click verify

;; ----------------- DEV -----------------------

(comment
  (def user-id "XXXXXXXXXXX") ; your slack user id (not the bot's)
  (def channel "XXXXXXXXXXX") ; slack channel id (e.g. bot's dms)
  (def thread-ts "XXXXXXXX.XXXXXXX") ; thread id

  (def client {:token (channel.settings/unobfuscated-slack-app-token)})
  (def message (slackbot.client/post-message client {:channel channel :text "_Thinking..._" :thread_ts thread-ts}))
  (slackbot.client/delete-message client message)
  (select-keys message [:channel :ts])

  (slackbot.client/post-ephemeral-message client {:channel channel
                                                  :user user-id
                                                  :text "sssh"
                                                  :thread_ts thread-ts})

  (def thread (slackbot.client/fetch-thread client message)))
