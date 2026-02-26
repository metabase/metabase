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
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.macros :as api.macros]
   [metabase.channel.api.slack :as channel.api.slack]
   [metabase.channel.settings :as channel.settings]
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
                     :where [:= :user.is_active true]}))

(defn- slack-user-authorize-link
  "Link to page where user can initiate SSO auth flow to authorize slackbot"
  []
  (let [sso-url "/auth/sso?preferred_method=slack-connect&redirect=/slack-connect-success"]
    (str (system/site-url) "/auth/login?redirect=" (codec/url-encode sso-url))))

(defn- send-auth-link
  "Respond to an incoming slack message with a request to authorize.
   For top-level @mentions (not in a thread), sends ephemeral message directly to channel
   so users don't miss it (threaded ephemeral messages don't show thread indicators)."
  [client event]
  (slackbot.client/post-ephemeral-message
   client
   (merge (slackbot.events/event->reply-context event)
          {:user (:user event)
           ;; only thread the reply if the original message was already in a thread
           :thread_ts (:thread_ts event)
           :text "Connect your Slack account to Metabase. Once linked, I can use your permissions to query data on your behalf."
           :blocks [{:type "section"
                     :text {:type "mrkdwn"
                            :text "Connect your Slack account to Metabase. Once linked, I can use your permissions to query data on your behalf."}}
                    {:type "actions"
                     :elements [{:type "button"
                                 :text {:type "plain_text"
                                        :text ":link: Connect to Metabase"
                                        :emoji true}
                                 :url (slack-user-authorize-link)}]}]})))

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

(mu/defn- handle-message-im
  "Process a direct message (message.im)"
  [client  :- slackbot.client/SlackClient
   event   :- slackbot.events/SlackMessageImEvent
   user-id :- :int]
  (request/with-current-user user-id
    (slackbot.streaming/send-response client event)))

(defn- all-files-skipped?
  "Returns true if all files were skipped (none were CSV/TSV)."
  [{:keys [upload-result]}]
  (let [{:keys [results skipped]} upload-result]
    (and (seq skipped)
         (empty? results))))

(mu/defn- handle-message-file-share
  "Process a file_share message - handles CSV uploads"
  [client  :- slackbot.client/SlackClient
   event   :- slackbot.events/SlackMessageFileShareEvent
   user-id :- :int]
  (request/with-current-user user-id
    (let [files (:files event)
          text (:text event)
          has-text? (not (str/blank? text))
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
          all-skipped? (all-files-skipped? file-handling)
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
        (slackbot.streaming/send-response client event extra-history)))))

(mu/defn- handle-app-mention
  "Handle an app_mention event (when bot is @mentioned in a channel)."
  [client  :- slackbot.client/SlackClient
   event   :- slackbot.events/SlackAppMentionEvent
   user-id :- :int]
  (request/with-current-user user-id
    (slackbot.streaming/send-response client event)))

(defn- process-async
  "Process an event asynchronously with logging and error handling.
   Authenticates the user and calls handler with [client event user-id]."
  [handler client event]
  (let [event-type (or (:subtype event) (:channel_type event) (:type event))]
    (log/debugf "[slackbot] Processing %s event" event-type)
    (future
      (try
        (when-let [user-id (require-authenticated-slack-user! client event)]
          (handler client event user-id))
        (catch Exception e
          (log/errorf e "[slackbot] Error processing %s: %s" event-type (ex-message e)))))))

(defn ignore-event
  "Handle any event we don't care to process"
  [event]
  (log/debugf "[slackbot] Ignoring event type=%s channel_type=%s subtype=%s ts=%s"
              (:type event) (:channel_type event) (:subtype event) (:ts event)))

(defn assert-setup-complete
  "Asserts that all required Slack settings have been configured."
  []
  (when-not (slackbot.config/setup-complete?)
    (throw (ex-info (str (tru "Slack integration is not fully configured.")) {:status-code 503}))))

(defn assert-enabled
  "Asserts that all required Slack settings have been configured."
  []
  (when-not (sso-settings/slack-connect-enabled)
    (throw (ex-info (str (tru "Slack integration is not enabled.")) {:status-code 403}))))

(mu/defn- handle-event-callback :- slackbot.events/SlackEventsResponse
  "Respond to an event_callback request"
  [payload :- slackbot.events/SlackEventCallbackEvent]
  (assert-setup-complete)
  (assert-enabled)
  (let [client {:token (channel.settings/unobfuscated-slack-app-token)}
        event (:event payload)]
    (log/debugf "[slackbot] Event callback: event_type=%s user=%s channel=%s"
                (:type event) (:user event) (:channel event))
    (cond
      ((some-fn
        slackbot.events/bot-message? ;; ignore the bot's own messages
        slackbot.events/edited-message? ;; no support regenerating responses for now
        slackbot.events/app-mention-with-files? ;; we'll get another file_share event
        slackbot.events/channel-message?) ;; only responsd for app mentions
       event)
      (ignore-event event)

      (slackbot.events/app-mention? event)
      (process-async handle-app-mention client event)

      (slackbot.events/file-share? event)
      (process-async handle-message-file-share client event)

      (slackbot.events/dm? event)
      (process-async handle-message-im client event)

      :else
      (ignore-event event)))
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

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/slack` routes."
  (api.macros/ns-handler *ns*))

;; -------------- DEV SETUP -------------------

(comment
  ;; Guide to set yourself up for local development
  ;;
  ;; New slack app
  ;; 1. create a tunnel via `ngrok http 3000`
  ;; 2. update your site url to the provided tunnel url
  (system/site-url! "https://<random-id>.ngrok-free.app")
  ;; 4. visit this url in yoru browser, following the setup flow outlined there
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
