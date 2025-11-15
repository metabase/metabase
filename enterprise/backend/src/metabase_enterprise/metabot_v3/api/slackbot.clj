(ns metabase-enterprise.metabot-v3.api.slackbot
  "`/api/ee/metabot-v3/slack` routes"
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [metabase-enterprise.metabot-v3.api :as metabot-v3.api]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; ------------------ SLACK CLIENT --------------------

(defn slack-get
  "GET from slack"
  [client endpoint params]
  (http/get (str "https://slack.com/api" endpoint)
            {:headers {"Authorization" (str "Bearer " (:bot-token client))}
             :query-params params}))

(defn fetch-thread
  "Fetch an entire full Slack thread"
  [client message]
  (slack-get client "/conversations.replies" (select-keys message [:channel :ts])))

(defn slack-post
  "POST to slack"
  [client endpoint payload]
  (http/post (str "https://slack.com/api" endpoint)
             {:headers {"Authorization" (str "Bearer " (:bot-token client))}
              :content-type "application/json; charset=utf-8"
              :body (json/encode payload)}))

(defn post-message
  "Send a Slack message"
  [client message]
  (slack-post client "/chat.postMessage" message))

(defn delete-message
  "Remove a Slack message"
  [client message]
  (slack-post client "/chat.delete" (select-keys message [:channel :ts])))

;; -------------------- AI ---------------------------

(defn thread->history
  "Convert a Slack thread to an ai-service history object"
  [thread]
  (->> (:messages thread)
       (filter :text)
       (mapv #(hash-map :role (if (:bot_id %) :assistant :user)
                        :content (:text %)))))

(defn make-ai-request
  "Make an AI request and aggregate the streamed response text"
  [conversation_id prompt thread]
  (let [response-stream (metabot-v3.api/streaming-request {:context         {:current_time_with_timezone (str (java.time.OffsetDateTime/now))
                                                                             :capabilities []}
                                                           :message         prompt
                                                           :history         (thread->history thread)
                                                           :profile_id      "slackbot"
                                                           :conversation_id conversation_id
                                                           :state           {}})
        ;; TODO: gross code, need some help on cleaning this up
        baos (java.io.ByteArrayOutputStream.)
        streaming-fn (.-f response-stream)
        _ (streaming-fn baos (a/chan))
        full-response (.toString baos)]
    (->> (clojure.string/split-lines full-response)
         (filter #(clojure.string/starts-with? % "0:"))
         (map #(-> %
                   (subs 2) ; remove "0:"
                   (clojure.string/trim)
                   (json/decode))) ; decode JSON to handle Unicode escapes
         (clojure.string/join ""))))

;; -------------------- UTILS ------------------------

(comment
  (def client {:bot-token (metabot.settings/metabot-slack-bot-token)})

  (def message (post-message client {:channel "XXXXXXXXXXX" :text "_Thinking..._" :thread_ts "XXXXXXXXXXXXXXXXX"}))
  (delete-message client message)
  (select-keys message [:channel :ts])

  (def thread (fetch-thread client message))
  (def history (thread->history thread))

  (def user (t2/select-one :model/User :is_superuser true))
  (def response-stream
    (binding [api/*current-user* (t2/select-one :model/User :is_superuser true)
              api/*current-user-id* (:id (t2/select-one :model/User :is_superuser true))]
      (make-ai-request (str (random-uuid)) "hi metabot!" thread)))
  (println response-stream)
  (post-message client {:channel "XXXXXXXXXXX" :text response-stream :thread_ts (:ts thread)}))

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

(comment
  (json/encode (slackbot-manifest "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")))

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
  (let [prompt (:text event)
        thread (fetch-thread client message)
        ;; TODO: removing binding w/ something that converst the current user to an internal user
        answer (binding [api/*current-user* (t2/select-one :model/User :is_superuser true)
                         api/*current-user-id* (:id (t2/select-one :model/User :is_superuser true))]
                 (make-ai-request (str (random-uuid)) prompt thread))]
    (println prompt thread answer)
    (post-message client {:channel (:channel event)
                          :text answer
                          :thread_ts (or (:thread_ts event) (:ts event))})))

(defn- handle-event-callback
  "Respond to an event_callback request (docs: TODO)"
  [payload]
  (let [client {:bot-token (metabot.settings/metabot-slack-bot-token)}
        event (:event payload)]
    (println event)
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
