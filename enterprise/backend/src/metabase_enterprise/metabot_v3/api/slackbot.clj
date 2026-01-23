;; NOTE: image rendering works, but is a huge hack at the moment

(ns metabase-enterprise.metabot-v3.api.slackbot
  "`/api/ee/metabot-v3/slack` routes"
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.util]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.render.core :as channel.render]
   [metabase.permissions.core :as perms]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.request.core :as request]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; ------------------ SLACK CLIENT --------------------

(defn slack-get
  "GET from slack"
  [client endpoint params]
  (-> (http/get (str "https://slack.com/api" endpoint)
                {:headers {"Authorization" (str "Bearer " (:bot-token client))}
                 :query-params params})
      :body
      (json/decode true)))

(defn slack-post-json
  "POST to slack"
  [client endpoint payload]
  (-> (http/post (str "https://slack.com/api" endpoint)
                 {:headers {"Authorization" (str "Bearer " (:bot-token client))}
                  :content-type "application/json; charset=utf-8"
                  :body (json/encode payload)})
      :body
      (json/decode true)))

(defn slack-post-form
  "POST form to slack"
  [client endpoint payload]
  (-> (http/post (str "https://slack.com/api" endpoint)
                 {:headers {"Authorization" (str "Bearer " (:bot-token client))
                            "Content-Type" "application/x-www-form-urlencoded; charset=utf-8"}
                  :form-params payload})
      :body
      (json/decode true)))

(defn fetch-thread
  "Fetch an entire full Slack thread"
  [client message]
  (slack-get client "/conversations.replies"
             {:channel (:channel message)
              :ts (or (:thread_ts message) (:ts message))}))

(defn get-upload-url
  "Get a URL we can upload to"
  [client args]
  (slack-post-form client "/files.getUploadURLExternal" args))

(defn post-message
  "Send a Slack message"
  [client message]
  (slack-post-json client "/chat.postMessage" message))

(defn post-ephemeral-message
  "Send a Slack ephemeral message (visible only to the specified user)"
  [client message]
  (slack-post-json client "/chat.postEphemeral" message))

(defn post-image
  "Upload a PNG image and send in a message"
  [client image-bytes filename channel thread-ts]
  (let [{:keys [ok upload_url file_id] :as res} (get-upload-url client {:filename filename
                                                                        :length (alength ^bytes image-bytes)})]
    (when ok
      (http/post upload_url
                 {:headers {"Content-Type" "image/png"}
                  :body image-bytes})
      (slack-post-json client "/files.completeUploadExternal"
                       {:files [{:id file_id
                                 :title filename}]
                        :channel_id channel
                        :thread_ts thread-ts})
      res)))

(defn delete-message
  "Remove a Slack message"
  [client message]
  (slack-post-json client "/chat.delete" (select-keys message [:channel :ts])))

;; -------------------- PNG GENERATION ---------------------------

(defn- pulse-card-query-results
  {:arglists '([card])}
  [{query :dataset_query, card-id :id}]
  ;; Use the same approach as pulse API - this works for accessible cards
  (binding [qp.perms/*card-id* card-id]
    (qp/process-query
     (qp/userland-query
      (assoc query
             :middleware {:process-viz-settings? true
                          :js-int-to-string?     false})
      {:executed-by api/*current-user-id*
       :context     :pulse
       :card-id     card-id}))))

(defn generate-card-png
  "Generate PNG for a card. Accepts either:
   - card-id (integer) - fetches saved card from database
   - adhoc-card (map) - renders ad-hoc card with :display, :visualization_settings, :results, :name"
  [card-or-id & {:keys [width padding-x padding-y]
                 :or {width 400 padding-x 32 padding-y 32}}]
  (let [options {:channel.render/include-title? true
                 :channel.render/padding-x padding-x
                 :channel.render/padding-y padding-y}]
    (if (integer? card-or-id)
      ;; Saved card path
      (let [card (t2/select-one :model/Card :id card-or-id)]
        (when-not card
          (throw (ex-info "Card not found" {:card-id card-or-id})))
        ;; TODO: should we use the user's timezone for this?
        (channel.render/render-pulse-card-to-png (channel.render/defaulted-timezone card)
                                                 card
                                                 (pulse-card-query-results card)
                                                 width
                                                 options))
      ;; Ad-hoc card path
      (let [{:keys [display visualization_settings results name]} card-or-id]
        (channel.render/render-adhoc-card-to-png
         {:display display
          :visualization_settings visualization_settings
          :name name}
         results
         width
         options)))))

;; -------------------- AI SERVICE ---------------------------

(defn thread->history
  "Convert a Slack thread to an ai-service history object"
  [thread]
  (->> (:messages thread)
       (filter :text)
       (mapv #(hash-map :role (if (:bot_id %) :assistant :user)
                        :content (:text %)))))

(defn make-ai-request
  "Make an AI request and return both text and data parts"
  [conversation-id prompt thread]
  (let [message    (metabot-v3.envelope/user-message prompt)
        metabot-id (metabot-v3.config/resolve-dynamic-metabot-id nil)
        profile-id (metabot-v3.config/resolve-dynamic-profile-id "slackbot" metabot-id)
        session-id (metabot-v3.client/get-ai-service-token api/*current-user-id* metabot-id)
        response-stream (metabot-v3.client/streaming-request
                         {:context         (metabot-v3.context/create-context {:current_time_with_timezone (str (java.time.OffsetDateTime/now))
                                                                               :capabilities []})
                          :metabot-id      metabot-id
                          :profile-id      profile-id
                          :session-id      session-id
                          :conversation-id conversation-id
                          :message         message
                          :history         (thread->history thread)
                          :state           {}
                          :on-complete     (fn [lines] :store-in-db)})
        baos (java.io.ByteArrayOutputStream.)
        _ ((.-f response-stream) baos (a/chan))
        lines (-> (.toString baos) str/split-lines)
        messages (metabot-v3.util/aisdk->messages :assistant lines)]
    {:text (->> messages
                (filter #(= (:_type %) :TEXT))
                (map :content)
                (str/join ""))
     :data-parts (filter #(= (:_type %) :DATA) messages)}))

;; -------------------- API ---------------------------

(defn- slackbot-manifest [base-url]
  {"display_information" {"name" "Metabot"
                          "description" "Your AI-powered data assistant"
                          "background_color" "#509EE3"}
   "features" {"app_home" {"home_tab_enabled" false
                           "messages_tab_enabled" true
                           "messages_tab_read_only_enabled" false}
               "bot_user" {"display_name" "Metabot"
                           "always_online" false}
               "assistant_view" {"assistant_description" "Your AI-powered data assistant"}
               "slash_commands" [{"command" "/metabot"
                                  "url" (str base-url "/api/ee/metabot-v3/slack/commands")
                                  "description" "Issue a Metabot command"
                                  "should_escape" false}]}

   "oauth_config" {"redirect_urls" [(str base-url "/api/ee/metabot-v3/slack/oauth_redirect")]
                   "scopes" {"bot" ["channels:history"
                                    "chat:write"
                                    "commands"
                                    "im:history"
                                    "files:write"
                                    "files:read"
                                    "assistant:write"]}}

   "settings" {"event_subscriptions" {"request_url" (str base-url "/api/ee/metabot-v3/slack/events")
                                      "bot_events" ["app_home_opened"
                                                    "message.channels"
                                                    "message.im"
                                                    "assistant_thread_started"
                                                    "assistant_thread_context_changed"]}

               "interactivity" {"is_enabled" true
                                "request_url" (str base-url "/api/ee/metabot-v3/slack/interactive")}
               "org_deploy_enabled" true
               "socket_mode_enabled" false
               "token_rotation_enabled" false}})

;; ------------------------- VALIDATION ----------------------------------

(defn assert-valid-slack-req
  "Asserts that incoming Slack request has a valid signature."
  [request]
  (when-not (:slack/validated? request)
    (throw (ex-info (str (tru "Slack request signature is not valid.")) {:status-code 401}))))

;; ------------------------- EVENT HANDLING ------------------------------

(defn- handle-url-verification
  "Respond to a url_verification request (docs: https://docs.slack.dev/reference/events/url_verification)"
  [event]
  {:status 200
   :headers {"Content-Type" "text/plain"}
   :body (:challenge event)})

(defn- user-message?
  "Check if event is a user message (not bot/system message)"
  [event]
  (let [subtype (:subtype event)
        has-text (contains? event :text)
        has-files (contains? event :files)
        is-bot-message (contains? event :bot_id)]
    (and (or (nil? subtype) (= subtype "file_share"))
         (or has-text has-files)
         (not is-bot-message))))

(def ack-msg
  "Acknowledgement payload"
  {:status 200
   :headers {"Content-Type" "text/plain"}
   :body "ok"})

(defn- slack-id->user-id
  "Look up a Metabase user ID from Slack user ID."
  [slack-user-id]
  (t2/select-one-fn :user_id
                    :model/AuthIdentity
                    :provider "slack-connect"
                    :provider_id slack-user-id))

(def ^:private slack-user-authorize-link
  "Link to page where user can initiate SSO auth flow to authorize slackbot"
  ;; TODO(appleby 2026-01-22) real URL
  (str (system/site-url) "/account/metabot-slackbot"))

(defn- process-user-message
  "Respond to an incoming user slack message"
  [client event]
  (let [slack-user-id (:user event)
        user-id (slack-id->user-id slack-user-id)
        message-ctx {:channel (:channel event)
                     :thread_ts (or (:thread_ts event) (:ts event))}]
    (if-not user-id
      ;; No metabase user found for the given slack user. Respond with auth link.
      (post-ephemeral-message client
                              (merge message-ctx
                                     {:user slack-user-id
                                      :text (str "You need to link your slack account and authorize the Metabot app. "
                                                 "Please visit: " slack-user-authorize-link)}))
      ;; Found linked metabase user. Bind to current user and make-ai-request.
      (request/with-current-user user-id
        (let [prompt (:text event)
              thread (fetch-thread client event)
              thinking-message (post-message client (merge message-ctx {:text "_Thinking..._"}))
              {:keys [text data-parts]} (make-ai-request (str (random-uuid)) prompt thread)]
          (delete-message client thinking-message)
          (post-message client (merge message-ctx {:text text}))
          (let [vizs (filter #(= (:type %) "static_viz") data-parts)]
            (doseq [viz vizs]
              (when-let [card-id (get-in viz [:value :entity_id])]
                (let [png-bytes (generate-card-png card-id)
                      filename (str "chart-" card-id ".png")]
                  (post-image client png-bytes filename
                              (:channel message-ctx)
                              (:thread_ts message-ctx)))))))))))

(defn- handle-event-callback
  "Respond to an event_callback request (docs: TODO)"
  [payload]
  (let [client {:bot-token (metabot.settings/metabot-slack-bot-token)}
        event (:event payload)]
    (when (user-message? event)
      ;; TODO: should we queue work up another way?
      (future (process-user-message client event)))
    ack-msg))

;; ----------------------- ROUTES --------------------------

(api.macros/defendpoint :get "/manifest"
  "Returns the YAML manifest file that should be used to bootstrap new Slack apps"
  []
  (perms/check-has-application-permission :setting)
  (slackbot-manifest (system/site-url)))

(api.macros/defendpoint :post "/events"
  "Respond to activities in Slack"
  [_route-params _query-params body request]
  (assert-valid-slack-req request)
  ;; all handlers must respond within 3 seconds or slack will retry
  (case (:type body)
    "url_verification" (handle-url-verification body)
    "event_callback" (handle-event-callback body)
    ack-msg))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/slack` routes."
  (api.macros/ns-handler *ns*))

;; --------------------------------------------

(comment
  ;; env vars, get these from https://api.slack.com/apps
  ;;
  ;; MB_METABOT_SLACK_BOT_TOKEN
  ;; MB_METABOT_SLACK_SIGNING_SECRET
  ;; MB_SLACK_CONNECT_CLIENT_ID
  ;; MB_SLACK_CONNECT_CLIENT_SECRET
  ;;
  ;; Optional, either: "link-only" or "sso" (default)
  ;; MB_SLACK_CONNECT_AUTHENTICATION_MODE
  ;;
  ;; for verifying values are set:
  (metabot.settings/metabot-slack-signing-secret)
  (metabot.settings/metabot-slack-bot-token)
  ((requiring-resolve 'metabase-enterprise.sso.settings/slack-connect-client-id))
  ((requiring-resolve 'metabase-enterprise.sso.settings/slack-connect-client-secret))
  ((requiring-resolve 'metabase-enterprise.sso.settings/slack-connect-authentication-mode))

  ;; constants for hacking
  (def user-id "XXXXXXXXXXX") ; your slack user id (not the bot's)
  (def channel "XXXXXXXXXXX") ; slack channel id (e.g. bot's dms)
  (def thread-ts "XXXXXXXX.XXXXXXX") ; thread id

  ;; create a tunnel via `cloudflared tunnel --url http://localhost:3000` copy tunnel url
  ;; to clipboard and execute to get a manifest file you can paste into the app manifest
  ;; page of your app settings (remember to verify the url after saving -- a warning w/
  ;; link appears at the top of the page after saving)
  (require '[clojure.java.shell :refer [sh]])
  (let [new-url (:out (sh "pbpaste"))
        ;; Sanity check clipboard-content. site-url! validates and normalizes the URL, but random clipboard content
        ;; like "ababa" will validate and get normalized to https://ababa.
        _ (assert (str/starts-with? new-url "https://"))
        _ (assert (str/ends-with? new-url ".com"))
        manifest (slackbot-manifest new-url)]
    (system/site-url! new-url)
    (sh "pbcopy" :in (json/encode manifest {:pretty true})))

  (def client {:bot-token (metabot.settings/metabot-slack-bot-token)})
  (def message (post-message client {:channel channel :text "_Thinking..._" :thread_ts thread-ts}))
  (delete-message client message)
  (select-keys message [:channel :ts])

  (post-ephemeral-message client {:channel channel
                                  :user user-id
                                  :text "sssh"
                                  :thread_ts thread-ts})

  (def thread (fetch-thread client message))
  (def history (thread->history thread))

  (def admin-user (t2/select-one :model/User :is_superuser true))
  (def response-stream
    (request/with-current-user (:id admin-user)
      (make-ai-request (str (random-uuid)) "hi metabot!" thread)))
  (log/debug "Response stream:" response-stream)
  (def ai-message (post-message client {:channel channel :text response-stream :thread_ts (:ts thread)}))
  (delete-message client ai-message))

