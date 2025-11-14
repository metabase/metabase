(ns metabase-enterprise.metabot-v3.api.slackbot
  "`/api/ee/metabot-v3/slack` routes"
  (:require
   [clj-http.client :as http]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;; ------------------ SLACK CLIENT --------------------

(defn send-slack-req
  "POST to Slack API"
  [client endpoint payload]
  (try
    (let [res (http/post (str "https://slack.com/api" endpoint)
                         {:headers {"Authorization" (str "Bearer " (:bot-token client))}
                          :content-type "application/json; charset=utf-8"
                          :body (json/encode payload)})]
      ;; TODO: better error handling
      (if (> (:status res) 299)
        (throw res)
        (json/decode (:body res) true)))
    (catch Exception e
      (println "Error sending message to Slack:" (.getMessage e))
      nil)))

;; TODO: bad name, would like to consolidate w/ above function
(defn fetch-slack-req
  "GET from Slack API"
  [client endpoint params]
  (try
    (let [res (http/get (str "https://slack.com/api" endpoint)
                        {:headers {"Authorization" (str "Bearer " (:bot-token client))}
                         :query-params params})]
      ;; TODO: better error handling
      (if (> (:status res) 299)
        (throw res)
        (json/decode (:body res) true)))
    (catch Exception e
      (println "Error sending message to Slack:" (.getMessage e))
      nil)))

;; TODO: would be nice if each of these endpoints defined their required scopes
;; and then this was aggregated into the manifest definition somehow...

(defn post-message
  "Send a Slack message"
  [client message]
  (send-slack-req client "/chat.postMessage" message))

(defn delete-message
  "Remove a Slack message"
  [client message]
  (send-slack-req client "/chat.delete" (select-keys message [:channel :ts])))

(defn fetch-thread
  "Fetch an entire full Slack thread"
  [client message]
  (fetch-slack-req client "/conversations.replies" (select-keys message [:channel :ts])))

;; -------------------- UTILS ------------------------

(defn thread->history
  "Convert a Slack thread to an ai-service history object"
  [thread]
  (for [msg (:messages thread) :when (:text msg)]
    {:role (if (:bot_id msg) "assistant" "user")
     :content (:text msg)}))

(comment
  (def client {:bot-token (metabot.settings/metabot-slack-bot-token)})

  (def message (post-message client {:channel "XXXXXXXXXXX" :text "_Thinking..._"}))
  (delete-message client message)
  (select-keys message [:channel :ts])

  (def thread (fetch-thread client message))
  (def history (thread->history thread)))

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
                                                    "message.im"]}

               "interactivity" {"is_enabled" true
                                "request_url" (str base-url "/api/ee/metabot-v3/slack/interactive")}
               "org_deploy_enabled" true
               "socket_mode_enabled" false
               "token_rotation_enabled" false}})

;; TODO: add auth middleware + check that user has admin settings access
(api.macros/defendpoint :get "/manifest"
  "Returns the YAML manifest file that should be used to bootstrap new Slack apps"
  []
  (perms/check-has-application-permission :setting)
  (slackbot-manifest (system/site-url)))

;; ------------------------- VALIDATION ------------------------------------------

(defn assert-valid-slack-req
  "Asserts that incoming Slack request has a valid signature."
  [request]
  (when-not (:slack/validated? request)
    (throw (ex-info (str (tru "Slack request signature is not valid.")) {:status 401, :body "Invalid request signature."}))))

;; ------------------------- EVENT HANDLING ENDPOINT ------------------------------

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

(defn- process-user-message
  "Resond to an incoming user slack message"
  [client event]
  (post-message client {:channel (:channel event) :message "Hello from Clojure"}))

(defn- handle-event-callback
  "Respond to an event_callback request (docs: TODO)"
  [payload]
  (let [client {:bot-token (metabot.settings/metabot-slack-bot-token)}
        event (:event payload)]
    (when (user-message? event)
      ;; we must respond to slack w/ a 200 within 3 seconds
      ;; otherwise slack will retry their request
      (future (process-user-message client event)))
    ack-msg))

(api.macros/defendpoint :post "/events"
  "Respond to activities in Slack"
  [_route-params _query-params body request]
  (assert-valid-slack-req request)
  (case (:type body)
    "url_verification" (handle-url-verification body)
    "event_callback" (handle-event-callback body)
    ack-msg))

;; ----------------------- ROUTES --------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/slack` routes."
  (api.macros/ns-handler *ns*))
