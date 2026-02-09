;; NOTE: image rendering works, but is a huge hack at the moment

(ns metabase-enterprise.metabot-v3.api.slackbot
  "`/api/ee/metabot-v3/slack` routes"
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.util]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.render.core :as channel.render]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.request.core :as request]
   [metabase.system.core :as system]
   [metabase.upload.impl :as upload.impl]
   [metabase.upload.settings :as upload.settings]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io OutputStream)
   (metabase.server.streaming_response StreamingResponse)))

(set! *warn-on-reflection* true)

;; ------------------ SLACK CLIENT --------------------

(def ^:private SlackClient
  "Malli schema for a Slack client."
  [:map {:closed true}
   [:token ms/NonBlankString]])

(defn- slack-get
  "GET from slack"
  [client endpoint params]
  (-> (http/get (str "https://slack.com/api" endpoint)
                {:headers {"Authorization" (str "Bearer " (:token client))}
                 :query-params params})
      :body
      (json/decode true)))

(defn- slack-post-json
  "POST to slack"
  [client endpoint payload]
  (-> (http/post (str "https://slack.com/api" endpoint)
                 {:headers {"Authorization" (str "Bearer " (:token client))}
                  :content-type "application/json; charset=utf-8"
                  :body (json/encode payload)})
      :body
      (json/decode true)))

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

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defn validate-bot-token!
  "Validate a Slack bot token using the auth.test endpoint.
   Throws an exception with appropriate status code if validation fails:
   - 400 for invalid/revoked tokens
   - 502 for Slack API errors (e.g., Slack is down)
   Returns the response map on success."
  [token]
  (try
    (let [response (slack-post-json {:token token} "/auth.test" {})]
      (if (:ok response)
        response
        (let [error-code (:error response)
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

(defn- fetch-thread
  "Fetch an entire full Slack thread"
  [client message]
  (slack-get client "/conversations.replies"
             {:channel (:channel message)
              :ts (or (:thread_ts message) (:ts message))}))

(defn- get-upload-url
  "Get a URL we can upload to"
  [client args]
  (slack-post-form client "/files.getUploadURLExternal" args))

(defn- post-message
  "Send a Slack message"
  [client message]
  (slack-post-json client "/chat.postMessage" message))

(defn- post-ephemeral-message
  "Send a Slack ephemeral message (visible only to the specified user)"
  [client message]
  (slack-post-json client "/chat.postEphemeral" message))

(defn- post-image
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

(defn- delete-message
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

(defn- generate-card-png
  "Generate PNG for a card. Accepts either:
   - card-id (integer) - fetches saved card from database
   - adhoc-card (map) - renders ad-hoc card with :display, :visualization_settings, :results, :name"
  [card-or-id & {:keys [width padding-x padding-y]
                 :or {width 1280 padding-x 32 padding-y 0}}]
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

;; -------------------- CSV UPLOADS ---------------------------

(def ^:private max-file-size-bytes
  "Maximum file size for CSV uploads (1GB, matches Slack's limit)"
  (* 1024 1024 1024))

(def ^:private allowed-csv-filetypes
  "File types that are allowed for CSV uploads"
  #{"csv" "tsv"})

(defn- csv-file?
  "Check if a Slack file is a CSV/TSV based on filetype."
  [{:keys [filetype]}]
  (contains? allowed-csv-filetypes filetype))

(defn- validate-file-size
  "Returns nil if valid, error string if too large."
  [{:keys [name size]}]
  (when (> size max-file-size-bytes)
    (format "File '%s' exceeds 1GB size limit" name)))

(defn- uploads-enabled?
  "Check if CSV uploads are enabled on any database."
  []
  (some? (:db_id (upload.settings/uploads-settings))))

(defn- get-upload-db-id
  "Get the database ID configured for uploads."
  []
  (:db_id (upload.settings/uploads-settings)))

(defn- get-upload-schema-name
  "Get the schema name configured for uploads."
  []
  (:schema_name (upload.settings/uploads-settings)))

(defn- get-upload-table-prefix
  "Get the table prefix configured for uploads."
  []
  (:table_prefix (upload.settings/uploads-settings)))

(defn- download-slack-file
  "Download a file from Slack using the bot token for authentication.
   Returns byte array of file contents."
  [url]
  (let [token (metabot.settings/metabot-slack-bot-token)]
    (-> (http/get url {:headers {"Authorization" (str "Bearer " token)}
                       :as :byte-array})
        :body)))

(defn- process-csv-file
  "Process a single CSV file upload. Returns a result map with either
   :success (containing model info) or :error (containing message)."
  [{:keys [name url_private] :as file}]
  (if-let [size-error (validate-file-size file)]
    {:error size-error :filename name}
    (let [temp-file (java.io.File/createTempFile "slack-upload-" (str "-" name))]
      (try
        (let [content (download-slack-file url_private)
              _ (io/copy content temp-file)
              db-id (get-upload-db-id)
              result (upload.impl/create-csv-upload!
                      {:filename     name
                       :file         temp-file
                       :db-id        db-id
                       :schema-name  (get-upload-schema-name)
                       :table-prefix (get-upload-table-prefix)
                       :collection-id nil})]
          {:success true
           :filename name
           :model-id (:id result)
           :model-name (:name result)})
        (catch Exception e
          (log/warnf e "Failed to process CSV upload: %s" name)
          {:error (ex-message e) :filename name})
        (finally
          (io/delete-file temp-file true))))))

(defn- process-file-uploads
  "Process all files from a Slack event. Returns a map with:
   :results - seq of individual file results
   :skipped - seq of non-CSV filenames that were skipped"
  [files]
  (let [{csv-files true other-files false} (group-by csv-file? files)
        skipped (mapv :name other-files)
        results (mapv process-csv-file csv-files)]
    {:results results
     :skipped skipped}))

(defn- build-upload-system-messages
  "Build system messages to inject into AI request about uploads."
  [{:keys [results skipped]}]
  (let [successes (filter :success results)
        failures (filter :error results)]
    (cond-> []
      (seq successes)
      (conj {:role "system"
             :content (format "The user uploaded CSV files that are now available as models in Metabase: %s. You can help them query this data."
                              (str/join ", " (map #(format "%s (model ID: %d)"
                                                           (:filename %)
                                                           (:model-id %))
                                                  successes)))})

      (seq failures)
      (conj {:role "system"
             :content (format "Some file uploads failed: %s. Explain these errors to the user."
                              (str/join ", " (map #(format "%s: %s"
                                                           (:filename %)
                                                           (:error %))
                                                  failures)))})

      (seq skipped)
      (conj {:role "system"
             :content (format "The user tried to upload non-CSV files which are not supported: %s. Let them know only CSV files can be uploaded."
                              (str/join ", " skipped))}))))

(defn- handle-file-uploads
  "Handle file uploads if present. Returns nil if no files, otherwise
   returns upload result map and messages to inject into AI request."
  [files]
  (log/infof "[slackbot] handle-file-uploads: file_count=%s" (count files))
  (when (seq files)
    (cond
      (not (uploads-enabled?))
      (do
        (log/infof "[slackbot] handle-file-uploads: uploads not enabled")
        {:error "CSV uploads are not enabled. An administrator needs to configure a database for uploads in Admin > Settings > Uploads."})

      :else
      (let [db-id (get-upload-db-id)
            db (t2/select-one :model/Database :id db-id)
            schema-name (get-upload-schema-name)
            can-upload? (upload.impl/can-create-upload? db schema-name)]
        (log/infof "[slackbot] handle-file-uploads: db_id=%s schema=%s can_upload=%s" db-id schema-name can-upload?)
        (if-not can-upload?
          {:error "You don't have permission to upload files. Contact your Metabase administrator."}
          (let [result (process-file-uploads files)]
            (log/infof "[slackbot] handle-file-uploads: process_result=%s" (pr-str result))
            {:upload-result result
             :system-messages (build-upload-system-messages result)}))))))

;; -------------------- AI SERVICE ---------------------------

(defn- thread->history
  "Convert a Slack thread to an ai-service history object"
  [thread]
  (->> (:messages thread)
       (filter :text)
       (mapv #(hash-map :role (if (:bot_id %) :assistant :user)
                        :content (:text %)))))

(defn- make-ai-request
  "Make an AI request and return both text and data parts.
   Optional `extra-history` is prepended to the thread history (e.g., for upload context)."
  ([conversation-id prompt thread]
   (make-ai-request conversation-id prompt thread nil))
  ([conversation-id prompt thread extra-history]
   (log/infof "[slackbot] make-ai-request: extra_history_count=%s" (count extra-history))
   (let [message    (metabot-v3.envelope/user-message prompt)
         metabot-id (metabot-v3.config/resolve-dynamic-metabot-id nil)
         profile-id (metabot-v3.config/resolve-dynamic-profile-id "slackbot" metabot-id)
         session-id (metabot-v3.client/get-ai-service-token api/*current-user-id* metabot-id)
         thread-history (thread->history thread)
         history    (into (vec extra-history) thread-history)
         _ (log/infof "[slackbot] make-ai-request: thread_history_count=%s final_history_count=%s"
                      (count thread-history)
                      (count history))
         _ (log/infof "[slackbot] make-ai-request: final_history=%s" (pr-str history))
         lines      (atom nil)
         ^StreamingResponse response-stream
         (metabot-v3.client/streaming-request
          {:context         (metabot-v3.context/create-context
                             {:current_time_with_timezone (str (java.time.OffsetDateTime/now))
                              :capabilities []})
           :metabot-id      metabot-id
           :profile-id      profile-id
           :session-id      session-id
           :conversation-id conversation-id
           :message         message
           :history         history
           :state           {}
           :on-complete     (fn [the-lines] (reset! lines the-lines))})
         null-stream (OutputStream/nullOutputStream)
         _ ((.-f response-stream) null-stream (a/chan))
         messages (metabot-v3.util/aisdk->messages :assistant @lines)]
     {:text (->> messages
                 (filter #(= (:_type %) :TEXT))
                 (map :content)
                 (str/join ""))
      :data-parts (filter #(= (:_type %) :DATA) messages)})))

;; -------------------- API ---------------------------

(def ^:private SlackbotManifest
  "Malli schema for Slack app manifest structure"
  [:map
   [:display_information [:map
                          [:name :string]
                          [:description :string]
                          [:background_color :string]]]
   [:features [:map
               [:app_home [:map
                           [:home_tab_enabled :boolean]
                           [:messages_tab_enabled :boolean]
                           [:messages_tab_read_only_enabled :boolean]]]
               [:bot_user [:map
                           [:display_name :string]
                           [:always_online :boolean]]]
               [:assistant_view [:map
                                 [:assistant_description :string]]]
               [:slash_commands [:sequential [:map
                                              [:command :string]
                                              [:url ms/Url]
                                              [:description :string]
                                              [:should_escape :boolean]]]]]]
   [:oauth_config [:map
                   [:redirect_urls [:sequential ms/Url]]
                   [:scopes [:map
                             [:bot [:sequential :string]]]]]]
   [:settings [:map
               [:event_subscriptions [:map
                                      [:request_url ms/Url]
                                      [:bot_events [:sequential :string]]]]
               [:interactivity [:map
                                [:is_enabled :boolean]
                                [:request_url ms/Url]]]
               [:org_deploy_enabled :boolean]
               [:socket_mode_enabled :boolean]
               [:token_rotation_enabled :boolean]]]])

(mu/defn- slackbot-manifest :- SlackbotManifest
  [base-url :- ms/Url]
  {:display_information {:name "Metabot"
                         :description "Your AI-powered data assistant"
                         :background_color "#509EE3"}
   :features {:app_home {:home_tab_enabled false
                         :messages_tab_enabled true
                         :messages_tab_read_only_enabled false}
              :bot_user {:display_name "Metabot"
                         :always_online false}
              :assistant_view {:assistant_description "Your AI-powered data assistant"}
              :slash_commands [{:command "/metabot"
                                :url (str base-url "/api/ee/metabot-v3/slack/commands")
                                :description "Issue a Metabot command"
                                :should_escape false}]}
   :oauth_config {:redirect_urls [(str base-url "/auth/sso")]
                  :scopes {:bot ["channels:history"
                                 "chat:write"
                                 "commands"
                                 "im:history"
                                 "files:write"
                                 "files:read"
                                 "assistant:write"]}}
   :settings {:event_subscriptions {:request_url (str base-url "/api/ee/metabot-v3/slack/events")
                                    :bot_events ["app_home_opened"
                                                 "message.channels"
                                                 "message.im"
                                                 "assistant_thread_started"
                                                 "assistant_thread_context_changed"]}
              :interactivity {:is_enabled true
                              :request_url (str base-url "/api/ee/metabot-v3/slack/interactive")}
              :org_deploy_enabled true
              :socket_mode_enabled false
              :token_rotation_enabled false}})

;; ------------------------- VALIDATION ----------------------------------

(defn- assert-valid-slack-req
  "Asserts that incoming Slack request has a valid signature."
  [request]
  (when-not (:slack/validated? request)
    (throw (ex-info (str (tru "Slack request signature is not valid.")) {:status-code 401}))))

(defn- setup-complete?
  "Returns true if all required Slack settings are configured to process events."
  []
  (boolean
   (and (some? (system/site-url))
        (premium-features/enable-sso-slack?)
        (sso-settings/slack-connect-client-id)
        (sso-settings/slack-connect-client-secret)
        (metabot.settings/metabot-slack-signing-secret)
        ;; TODO: we need to factor in this or make it always true if metabot-v3 is enabled?
        ;; (metabase-enterprise.sso.settings/slack-connect-enabled)
        (metabot.settings/metabot-slack-bot-token)
        (encryption/default-encryption-enabled?))))

(defn- assert-setup-complete
  "Asserts that all required Slack settings have been configured."
  []
  (when-not (setup-complete?)
    (throw (ex-info (str (tru "Slack integration is not fully configured.")) {:status-code 503}))))

;; ------------------------- EVENT HANDLING ------------------------------

(def ^:private SlackEventsResponse
  "Malli schema for Slack events API response"
  [:map
   ;; Response status is expected to be 2xx to indicate the event was received
   ;; https://docs.slack.dev/apis/events-api/#error-handling
   [:status  [:= 200]]
   [:headers [:map ["Content-Type" [:= "text/plain"]]]]
   [:body    :string]])

(def ^:private SlackUrlVerificationEvent
  "Malli schema for Slack url_verification event"
  [:map
   [:type      [:= "url_verification"]]
   [:challenge :string]])

(def ^:private SlackFile
  "Malli schema for a file attached to a Slack message"
  [:map
   [:id :string]
   [:name :string]
   [:mimetype {:optional true} [:maybe :string]]
   [:filetype {:optional true} [:maybe :string]]
   [:url_private :string]
   [:size :int]])

(def ^:private SlackMessageEvent
  "Base schema for Slack message events"
  [:map
   [:type [:= "message"]]
   [:channel :string]
   [:user :string]
   [:ts :string]
   [:event_ts :string]
   [:bot_id {:optional true} [:maybe :string]]])

(def ^:private SlackMessageImEvent
  "Schema for message.im events (direct messages)"
  [:merge SlackMessageEvent
   [:map
    [:channel_type [:= "im"]]
    [:text :string]
    [:thread_ts {:optional true} [:maybe :string]]]])

(def ^:private SlackMessageChannelsEvent
  "Schema for message.channels events (public channel messages)"
  [:merge SlackMessageEvent
   [:map
    [:channel_type [:= "channel"]]
    [:text :string]
    [:thread_ts {:optional true} [:maybe :string]]]])

(def ^:private SlackMessageFileShareEvent
  "Schema for file_share message events"
  [:merge SlackMessageEvent
   [:map
    [:subtype [:= "file_share"]]
    [:channel_type :string]
    [:files [:sequential SlackFile]]
    [:text {:optional true} [:maybe :string]]
    [:thread_ts {:optional true} [:maybe :string]]]])

(def ^:private SlackHandledMessageEvent
  "Schema for event_callback event that we handle."
  [:or
   SlackMessageImEvent
   SlackMessageChannelsEvent
   SlackMessageFileShareEvent])

(def ^:private SlackEventCallbackEvent
  "Malli schema for Slack event_callback event"
  [:map
   [:type [:= "event_callback"]]
   [:event [:or
            SlackHandledMessageEvent
            ;; Fallback for any other valid event type
            [:map
             [:type :string]
             [:event_ts :string]]]]])

(mu/defn- handle-url-verification :- SlackEventsResponse
  "Respond to a url_verification request (docs: https://docs.slack.dev/reference/events/url_verification)"
  [event :- SlackUrlVerificationEvent]
  {:status  200
   :headers {"Content-Type" "text/plain"}
   :body    (:challenge event)})

(defn- user-message?
  "Check if event is a user message (not bot/system message).
   Returns true if the event has no bot_id and matches a known message schema."
  [event]
  (and (nil? (:bot_id event))
       (mr/validate SlackHandledMessageEvent event)))

(def ^:private ack-msg
  "Acknowledgement payload"
  {:status  200
   :headers {"Content-Type" "text/plain"}
   :body    "ok"})

(defn- slack-id->user-id
  "Look up a Metabase user ID from Slack user ID."
  [slack-user-id]
  (t2/select-one-fn :user_id
                    :model/AuthIdentity
                    :provider "slack-connect"
                    :provider_id slack-user-id))

(def ^:private slack-user-authorize-link
  "Link to page where user can initiate SSO auth flow to authorize slackbot"
  (str (system/site-url) "/auth/login?redirect=/auth/sso?preferred_method=slack-connect"))

(defn- event->reply-context
  "Extract the necessary context for a reply from the given `event`"
  [event]
  {:channel (:channel event)
   :thread_ts (or (:thread_ts event)
                  (:ts event))})

(mu/defn- send-metabot-response
  "Send a metabot response to `client` for message `event`.
   Optional `extra-history` is passed to make-ai-request for upload context."
  ([client :- SlackClient
    event  :- SlackHandledMessageEvent]
   (send-metabot-response client event nil))
  ([client :- SlackClient
    event  :- SlackHandledMessageEvent
    extra-history]
   (log/infof "[slackbot] send-metabot-response: extra_history_count=%s extra_history=%s"
              (count extra-history)
              (pr-str extra-history))
   (let [prompt (or (:text event) "I've uploaded some files.")
         _ (log/infof "[slackbot] send-metabot-response: prompt=%s" prompt)
         thread (fetch-thread client event)
         message-ctx (event->reply-context event)
         thinking-message (post-message client (merge message-ctx {:text "_Thinking..._"}))
         ;; TODO: handle case where this errors
         {:keys [text data-parts]} (make-ai-request (str (random-uuid)) prompt thread extra-history)]
     (delete-message client thinking-message)
     (post-message client (merge message-ctx {:text text}))
     (let [vizs (filter #(= (:type %) "static_viz") data-parts)]
       (doseq [viz vizs]
         (when-let [card-id (get-in viz [:value :entity_id])]
           (let [png-bytes (generate-card-png card-id)
                 filename (str "chart-" card-id ".png")]
             (post-image client png-bytes filename
                         (:channel message-ctx)
                         (:thread_ts message-ctx)))))))))

(mu/defn- process-message-im
  "Process a direct message (message.im)"
  [client  :- SlackClient
   event   :- SlackMessageImEvent
   user-id :- :int]
  (request/with-current-user user-id
    (send-metabot-response client event)))

(mu/defn- process-message-channels
  "Process a public channel message (message.channels)"
  [client   :- SlackClient
   event    :- SlackMessageChannelsEvent
   _user-id :- :int]
  (post-message client
                (merge (event->reply-context event)
                       {:text "Sorry, channel messages are not yet implemented"})))

(mu/defn- process-message-file-share
  "Process a file_share message - handles CSV uploads"
  [client  :- SlackClient
   event   :- SlackMessageFileShareEvent
   user-id :- :int]
  (request/with-current-user user-id
    (let [files (:files event)
          _ (log/infof "[slackbot] process-message-file-share: file_count=%s files=%s"
                       (count files)
                       (mapv #(select-keys % [:id :name :filetype :mimetype :size]) files))
          file-handling (when (seq files)
                          (handle-file-uploads files))
          _ (log/infof "[slackbot] process-message-file-share: file_handling=%s" (pr-str file-handling))
          extra-history (cond
                          ;; Pre-flight error (uploads disabled, no permission)
                          (:error file-handling)
                          [{:role "system"
                            :content (:error file-handling)}]

                          ;; Upload results to communicate to AI
                          (:system-messages file-handling)
                          (:system-messages file-handling))
          _ (log/infof "[slackbot] process-message-file-share: extra_history_count=%s extra_history=%s"
                       (count extra-history)
                       (pr-str extra-history))]
      (send-metabot-response client event extra-history))))

(mu/defn- process-user-message :- :nil
  "Respond to an incoming user slack message, dispatching based on channel_type or subtype"
  [client :- SlackClient
   event  :- SlackHandledMessageEvent]
  (let [slack-user-id (:user event)
        user-id (slack-id->user-id slack-user-id)]
    (log/infof "[slackbot] process-user-message: slack_user=%s metabase_user=%s" slack-user-id user-id)
    (if-not user-id
      (post-ephemeral-message client
                              (merge (event->reply-context event)
                                     {:user slack-user-id
                                      :text (str "You need to link your slack account and authorize the Metabot app. "
                                                 "Please visit: " slack-user-authorize-link)}))
      (let [channel-type (:channel_type event)
            subtype (:subtype event)]
        (log/infof "[slackbot] process-user-message dispatch: channel_type=%s subtype=%s -> %s"
                   channel-type
                   subtype
                   (cond
                     (= subtype "file_share") "process-message-file-share"
                     (= channel-type "im") "process-message-im"
                     (= channel-type "channel") "process-message-channels"
                     :else "unhandled"))
        (cond
          (= subtype "file_share")   (process-message-file-share client event user-id)
          (= channel-type "im")      (process-message-im client event user-id)
          (= channel-type "channel") (process-message-channels client event user-id)
          :else                      (log/warnf "Unhandled message type: channel_type=%s subtype=%s"
                                                channel-type subtype)))))
  nil)

(mu/defn- handle-event-callback :- SlackEventsResponse
  "Respond to an event_callback request (docs: TODO)"
  [payload :- SlackEventCallbackEvent]
  (let [client {:token (metabot.settings/metabot-slack-bot-token)}
        event (:event payload)]
    (def tsp-event event)
    (println "TSP received event")
    (log/infof "[slackbot] handle-event-callback: type=%s subtype=%s channel_type=%s has_files=%s file_count=%s"
               (:type event)
               (:subtype event)
               (:channel_type event)
               (boolean (seq (:files event)))
               (count (:files event)))
    (when (user-message? event)
      ;; TODO: should we queue work up another way?
      (future (process-user-message client event)))
    ack-msg))

;; ----------------------- ROUTES --------------------------

(api.macros/defendpoint :get "/manifest" :- SlackbotManifest
  "Returns the JSON manifest used to create a new Slack app"
  []
  (perms/check-has-application-permission :setting)
  (when-not (some? (system/site-url))
    (throw (ex-info (tru "You must configure a site-url for Slack integration to work.") {:status-code 503})))
  (slackbot-manifest (system/site-url)))

(api.macros/defendpoint :post "/events" :- SlackEventsResponse
  "Respond to activities in Slack"
  [_route-params
   _query-params
   body :- [:multi {:dispatch :type}
            ["url_verification" SlackUrlVerificationEvent]
            ["event_callback"   SlackEventCallbackEvent]
            [::mc/default       [:map [:type :string]]]]
   request]
  (assert-setup-complete)
  (assert-valid-slack-req request)
  ;; all handlers must respond within 3 seconds or slack will retry
  (case (:type body)
    "url_verification" (handle-url-verification body)
    "event_callback" (handle-event-callback body)
    ack-msg))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/slack` routes."
  (api.macros/ns-handler *ns*))

;; -------------- DEV SETUP -------------------

(comment
  ;; Guide to set yourself up for local development
  ;;
  ;; New slack app
  ;; 1. create a tunnel via `cloudflared tunnel --url http://localhost:3000`
  ;; 2. update your site url to the provided tunnel url
  (system/site-url! "https://personal-hear-sugar-graduates.trycloudflare.com")
  ;; 4. visit this url in yoru browser, following the setup flow outlined there
  (str (system/site-url) "/admin/metabot/slackbot")
  ;; 6. verify you've setup your instance correctly
  (setup-complete?)

  ;; Updating an existing slack app
  ;; 1. create a tunnel via `cloudflared tunnel --url http://localhost:3000`
  ;; 2. update your site url to the provided tunnel url
  (system/site-url! "https://frontpage-petite-performed-participated.trycloudflare.com")
  ;; 3. visit the app manifest slack settings page for your slack app (https://app.slack.com/app-settings/.../..../app-manifest)
  ;; 4. execute this form to copy the manifest to clipboard, paste the result in the manifest page
  (do
    (require '[clojure.java.shell :refer [sh]])
    (sh "pbcopy" :in (json/encode (slackbot-manifest (system/site-url)) {:pretty true})))
  ;; 5. there will be a notification at the top of the manifest page to verify your new site url, click verify
  )

;; ----------------- DEV -----------------------

(comment
  (def user-id "XXXXXXXXXXX") ; your slack user id (not the bot's)
  (def channel "XXXXXXXXXXX") ; slack channel id (e.g. bot's dms)
  (def thread-ts "XXXXXXXX.XXXXXXX") ; thread id

  (def client {:token (metabot.settings/metabot-slack-bot-token)})
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
