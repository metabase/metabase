(ns metabase-enterprise.metabot-v3.api.slackbot
  "`/api/ee/metabot-v3/slack` routes"
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase-enterprise.metabot-v3.api.slackbot.client :as slackbot.client]
   [metabase-enterprise.metabot-v3.api.slackbot.config :as slackbot.config]
   [metabase-enterprise.metabot-v3.api.slackbot.events :as slackbot.events]
   [metabase-enterprise.metabot-v3.api.slackbot.streaming :as slackbot.streaming]
   [metabase-enterprise.metabot-v3.api.slackbot.uploads :as slackbot.uploads]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.feedback :as metabot-v3.feedback]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.macros :as api.macros]
   [metabase.channel.api.slack :as channel.api.slack]
   [metabase.channel.settings :as channel.settings]
   [metabase.config.core :as config]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features :refer [defenterprise
                                                                defenterprise-schema]]
   [metabase.request.core :as request]
   [metabase.settings.core :as setting]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defenterprise clear-slack-bot-settings!
  "Clears all slackbot-related settings when Slack token is cleared.
   This ensures enable-sso-slack? becomes false."
  :feature :metabot-v3
  []
  (setting/set-many! {:slack-connect-enabled        false
                      :slack-connect-client-id      nil
                      :slack-connect-client-secret  nil
                      :metabot-slack-signing-secret nil})
  nil)

(defenterprise-schema get-slack-manifest :- channel.api.slack/SlackManifest
  "Enterprise implementation - returns full MetaBot manifest with event subscriptions, slash commands, etc."
  :feature :metabot-v3
  []
  (let [base-url (system/site-url)]
    (when-not base-url
      (throw (ex-info (tru "You must configure a site-url for Slack integration to work.") {:status-code 503})))
    (slackbot.config/build-slack-manifest base-url)))

;; ------------------------- VALIDATION ----------------------------------

(defn- assert-valid-slack-req
  "Asserts that incoming Slack request has a valid signature."
  [request]
  (when-not (metabot.settings/unobfuscated-metabot-slack-signing-secret)
    (throw (ex-info (str (tru "Slack integration is not fully configured.")) {:status-code 503})))
  (when-not (:slack/validated? request)
    (throw (ex-info (str (tru "Slack request signature is not valid.")) {:status-code 401}))))

;; ------------------------- AUTHENTICATION ------------------------------

(defn- slack-id->user-id
  "Look up a Metabase user ID from Slack user ID."
  [slack-user-id]
  (t2/select-one-fn :user_id
                    :model/AuthIdentity
                    :provider "slack-connect"
                    :provider_id slack-user-id
                    {:join  [[:core_user :user] [:= :user.id :auth_identity.user_id]]
                     :where [:= :user.is_active true]
                     :order-by [[:created_at :desc]]}))

(defn- slack-user-authorize-link
  "Link to page where user can initiate SSO auth flow to authorize slackbot"
  []
  (let [sso-url "/auth/sso/slack-connect?redirect=/slack-connect-success"]
    (str (system/site-url) "/auth/login?redirect=" (codec/url-encode sso-url))))

(defn- send-auth-link
  "Respond to an incoming slack message with a request to authorize.
   For DMs, always threads the reply. For channel @mentions, only threads
   if the original message was in a thread."
  [client event]
  (let [user-mention (slackbot.events/user-mention (:user event))
        msg-prefix (if (slackbot.events/dm? event) "" (str user-mention " "))
        msg (str msg-prefix "Connect your Slack account to Metabase. Once linked, I can use your permissions to query data on your behalf.")]
    (slackbot.client/post-message
     client
     (merge (slackbot.events/event->reply-context event)
            { ;; DMs: always thread. Channels: only thread if already in a thread.
             :thread_ts (or (:thread_ts event) (:ts event))
             :text msg
             :blocks [{:type "section"
                       :text {:type "mrkdwn"
                              :text msg}}
                      {:type "actions"
                       :elements [{:type "button"
                                   :text {:type "plain_text"
                                          :text ":link: Connect to Metabase"
                                          :emoji true}
                                   :url (slack-user-authorize-link)}]}]}))))

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

(defn- process-async
  "Process an event asynchronously with logging and error handling.
   Authenticates the user and calls handler with [client event]."
  [handler client event]
  (let [event-type (or (:subtype event) (:channel_type event) (:type event))]
    (log/debugf "[slackbot] Processing %s event" event-type)
    (future
      (try
        (when-let [user-id (require-authenticated-slack-user! client event)]
          (request/with-current-user user-id
            (handler client event)))
        (catch Exception e
          (log/errorf e "[slackbot] Error processing %s: %s" event-type (ex-message e)))))))

(defn- ignore-event
  "Handle any event we don't care to process"
  [event]
  (log/debugf "[slackbot] Ignoring event type=%s channel_type=%s subtype=%s ts=%s"
              (:type event) (:channel_type event) (:subtype event) (:ts event)))

(defn- assert-setup-complete
  "Asserts that all required Slack settings have been configured."
  []
  (when-not (slackbot.config/setup-complete?)
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

        (or (slackbot.events/app-mention? event)
            (slackbot.events/dm? event))
        (process-async slackbot.streaming/send-response client event)

        :else
        (ignore-event event))))
  ack-msg)

;; ----------------------- ROUTES --------------------------
;; NOTE: make sure to do premium-features/enable-metabot-v3? checks if you add new endpoints

(api.macros/defendpoint :post "/events" :- slackbot.events/SlackEventsResponse
  "Respond to activities in Slack"
  [_route-params
   _query-params
   body :- [:multi {:dispatch :type}
            ["url_verification" slackbot.events/SlackUrlVerificationEvent]
            ["event_callback"   slackbot.events/SlackEventCallbackEvent]
            [::mc/default       [:map [:type :string]]]]
   request]
  (assert-valid-slack-req request)
  (log/debugf "[slackbot] Received Slack event type=%s" (:type body))
  ;; all handlers must respond within 3 seconds or slack will retry
  (if (premium-features/enable-metabot-v3?)
    (case (:type body)
      "url_verification" (handle-url-verification body)
      "event_callback"   (handle-event-callback body)
      ack-msg)
    ack-msg))

(def SlackBotSettingsRequest
  "Malli schema for the request body of PUT /api/ee/metabot-v3/slack/settings.
   All credential fields must be provided together (either all set or all nil)."
  [:map
   [:slack-connect-client-id      [:maybe ms/NonBlankString]]
   [:slack-connect-client-secret  [:maybe ms/NonBlankString]]
   [:metabot-slack-signing-secret [:maybe ms/NonBlankString]]])

(def SlackBotSettingsResponse
  "Malli schema for the response of PUT /api/ee/metabot-v3/slack/settings."
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
                        (nil? metabot-slack-signing-secret))]
    ;; require metabot-v3 feature only when setting values (clearing is always allowed)
    (when (not (or all-unset? (premium-features/enable-metabot-v3?)))
      (throw (ex-info (tru "Metabot feature is not enabled.")
                      {:status-code 402})))
    ;; all values must be set together or unset together
    (when-not (or all-set? all-unset?)
      (throw (ex-info (tru "Must provide client id, client secret and signing secret together.")
                      {:status-code 400})))
    (setting/set-many! {:slack-connect-client-id      slack-connect-client-id
                        :slack-connect-client-secret  slack-connect-client-secret
                        :metabot-slack-signing-secret metabot-slack-signing-secret
                        :slack-connect-enabled        (boolean all-set?)})
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
                         :label    {:type "plain_text" :text "Any details you'd like to share? (optional)"}}]
     (if positive
       [freeform-block]
       [{:type     "input"
         :block_id "issue_type"
         :optional true
         :element  {:type        "static_select"
                    :action_id   "issue_type_select"
                    :placeholder {:type "plain_text" :text "Select issue type"}
                    :options     issue-type-options}
         :label    {:type "plain_text" :text "What kind of issue are you reporting? (optional)"}}
        freeform-block]))})

(defn- replace-feedback-buttons-with-thanks
  "Update the Slack message to replace the feedback buttons with a confirmation."
  [client channel message-ts message-blocks]
  (let [updated-blocks (-> (into [] (remove #(= (:block_id %) "metabot_feedback")) message-blocks)
                           (conj {:type     "context"
                                  :elements [{:type "mrkdwn"
                                              :text "Thanks for your feedback!"}]}))]
    (slackbot.client/update-message client {:channel channel
                                            :ts      message-ts
                                            :blocks  updated-blocks})))

(defn- build-base-feedback
  "Build the common feedback payload fields."
  [user-id conversation-id positive]
  {:metabot_id        (metabot-v3.config/normalize-metabot-id "slackbotmetabotmetabo")
   :feedback          {:positive          positive
                       :message_id        conversation-id
                       :freeform_feedback ""}
   :conversation_data {}
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

(defn- handle-feedback-modal-submission
  "Handle submission of the feedback details modal.
   Always submits to Harbormaster (the modal opening already captured positive/negative),
   then replaces the feedback buttons with a thanks message."
  [payload]
  (let [private-metadata (json/decode (get-in payload [:view :private_metadata]) true)
        {:keys [conversation_id positive user_id channel_id message_ts]} private-metadata
        values           (get-in payload [:view :state :values])
        issue-type       (get-in values [:issue_type :issue_type_select :selected_option :value])
        freeform         (get-in values [:freeform_feedback :freeform_input :value])]
    (future
      (try
        (metabot-v3.feedback/submit-to-harbormaster!
         (cond-> (build-base-feedback user_id conversation_id positive)
           true       (assoc-in [:feedback :freeform_feedback] (or freeform ""))
           issue-type (assoc-in [:feedback :issue_type] issue-type)))
        (catch Exception e
          (log/error e "[slackbot] Error submitting feedback to Harbormaster")))
      (try
        (when (and channel_id message_ts)
          (let [client  {:token (channel.settings/unobfuscated-slack-app-token)}
                message (slackbot.client/fetch-message client channel_id message_ts)]
            (when message
              (replace-feedback-buttons-with-thanks client channel_id message_ts (:blocks message)))))
        (catch Exception e
          (log/error e "[slackbot] Error replacing feedback buttons"))))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/interactive"
  "Handle interactive payloads from Slack (button clicks, modal submissions)."
  [_route-params _query-params _body request]
  (assert-valid-slack-req request)
  (when (premium-features/enable-metabot-v3?)
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
            (when (= (:action_id action) "metabot_feedback")
              (handle-feedback-action {:action        action
                                       :trigger-id    trigger-id
                                       :slack-user-id slack-user
                                       :channel-id    channel-id
                                       :message-ts    message-ts}))))

        "view_submission"
        (when (= (get-in payload [:view :callback_id]) "metabot_feedback_modal")
          (handle-feedback-modal-submission payload))

        nil)))
  {:status 200 :body ""})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/slack` routes."
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
