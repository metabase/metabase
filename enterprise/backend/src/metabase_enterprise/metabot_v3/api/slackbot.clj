(ns metabase-enterprise.metabot-v3.api.slackbot
  "`/api/ee/metabot-v3/slack` routes"
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.system.core :as system]
   [metabase.util.malli.schema :as ms])
  (:import
   [javax.crypto Mac]
   [javax.crypto.spec SecretKeySpec]))

;; TODO: move these into some kind of private setting
(def signing-secret
  "Secret to verify requests are from Slack"
  "TEMP")

(def bot-token
  "Token to send messages back to Slack"
  "TEMP")

(def ack-msg
  "Acknowledgement payload"
  {:status 200
   :headers {"Content-Type" "text/plain"}
   :body "ok"})

(defn- hmac-sha256
  "Generate HMAC-SHA256 signature"
  [key message]
  (let [mac (Mac/getInstance "HmacSHA256")
        secret-key (SecretKeySpec. (.getBytes ^String key "UTF-8") "HmacSHA256")]
    (.init mac secret-key)
    (->> (.doFinal mac (.getBytes ^String message "UTF-8"))
         (map #(format "%02x" (bit-and % 0xff)))
         (apply str))))

(defn- verify-slack-signature
  "Verify that the request came from Slack using signature verification"
  [request-body timestamp slack-signature]
  (let [base-string (str "v0:" timestamp ":" request-body)
        computed-hash (hmac-sha256 signing-secret base-string)
        expected-signature (str "v0=" computed-hash)]
    (= expected-signature slack-signature)))

(defn- verify-request-timestamp
  "Verify request timestamp to prevent replay attacks"
  [timestamp]
  (let [current-time (quot (System/currentTimeMillis) 1000)
        request-time (Long/parseLong timestamp)
        time-diff (Math/abs (- current-time request-time))]
    ;; Allow 5 minutes tolerance
    (<= time-diff 300)))

(defn send-message
  "Send a Slack message"
  [channel text]
  (try
    (http/post "https://slack.com/api/chat.postMessage"
               {:headers {"Authorization" (str "Bearer " bot-token)}
                :content-type :json
                :form-params {:channel channel :text text}})
    (catch Exception e
      (println "Error sending message to Slack:" (.getMessage e))
      nil)))

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

(api.macros/defendpoint :get "/manifest"
  "Returns the YAML manifest file that should be used to bootstrap new Slack apps"
  []
  (perms/check-has-application-permission :setting)
  (slackbot-manifest (system/site-url)))

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

;; TODO: this should return a 200 without a body and kick off work that issues a reply
(defn- handle-event-callback
  "Respond to an event_callback request (docs: TODO)"
  [payload]
  (let [event (:event payload)]
    (when (user-message? event)
      (send-message (:channel event) "Hello from Clojure"))
    ack-msg))

(defn- verify-slack-request
  "Verify that the request came from Slack"
  [{:keys [headers body]}]
  (let [slack-signature (get headers "x-slack-signature")
        timestamp (get headers "x-slack-request-timestamp")
        raw-body (if (string? body) body (str body))]
    (and slack-signature
         timestamp
         (verify-request-timestamp timestamp)
         (verify-slack-signature raw-body timestamp slack-signature))))

(api.macros/defendpoint :post "/events"
  "Respond to activities in Slack"
  [_route-params
   _query-params
   body
   {{x-slack-signature "x-slack-signature"
     x-slack-request-timestamp "x-slack-request-timestamp"} :headers
    :as request}]
  ;; Try to get the preserved raw body, fallback to reconstructing JSON
  (let [raw-body (or (:body request)
                     (json/generate-string body))]

    (println "DEBUG: Headers:" (:headers request))
    (println "DEBUG: Body type:" (type body))
    (println "DEBUG: Using preserved raw body?" (boolean (:body request)))
    (println "DEBUG: Raw body:" raw-body)
    (let [verification-result (and x-slack-signature
                                   x-slack-request-timestamp
                                   (try
                                     (verify-slack-request {:headers {"x-slack-signature" x-slack-signature
                                                                      "x-slack-request-timestamp" x-slack-request-timestamp}
                                                            :body raw-body})
                                     (catch Exception e
                                       (println "Signature verification failed:" (.getMessage e))
                                       false)))]
      (if verification-result
        (when body
          (case (:type body)
            "url_verification" (handle-url-verification body)
            "event_callback" (handle-event-callback body)
            ack-msg))
        {:status 401
         :headers {"Content-Type" "text/plain"}
         :body "Unauthorized: Missing or invalid signature"}))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/slack` routes."
  (api.macros/ns-handler *ns*))

;; and is there really no way to get the original untouched request from our defendpoint tool?
