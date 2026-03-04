(ns metabase-enterprise.metabot-v3.agent.analytics
  "Snowplow and Prometheus analytics and intent-classification helpers for the metabot agent."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.llm.settings :as llm]
   [metabase-enterprise.metabot-v3.self :as self]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; User intent classification

(def ^:private user-intents
  {"create_or_modify_sql_query"
   {:description "User wants to write new SQL from scratch or edit existing SQL"
    :examples    ["Write a SQL query to find all orders from last month."
                  "Edit the query to include customer email addresses (while looking at a SQL query)"]}
   "fix_broken_sql_query"
   {:description "User has broken SQL that needs fixing"
    :examples    ["My SQL query is giving an error, can you fix it?"
                  "Fix this query."]}
   "query_data"
   {:description "User wants to query data to get insights."
    :examples    ["Show me sales by region for Q1."
                  "How many users signed up last week?"]}
   "data_discovery"
   {:description "User looking for relevant tables/data or existing Metabase dashboards/questions"
    :examples    ["Which table has customer information?"
                  "What data can I use to analyze user behavior?"]}
   "editing_visualizations"
   {:description "User wants to build or edit visualizations"
    :examples    ["Create a bar chart for revenue by product."
                  "Turn this into a bar chart."]}
   "interpret_results"
   {:description "User needs help understanding data/charts"
    :examples    ["What does this chart mean?"
                  "Explain the results of this query."]}
   "create_dashboard"
   {:description "User wants to build dashboard"
    :examples    ["Build a dashboard for sales KPIs."
                  "Create a dashboard with multiple visualizations."]}
   "navigation"
   {:description "User wants to navigate to a specific Metabase UI location or feature"
    :examples    ["Take me to the SQL editor."
                  "Show me the admin settings."]}
   "metabase_help"
   {:description "User needs help using Metabase"
    :examples    ["How do I share a dashboard?"
                  "Help me set up a new database connection."
                  "How do I use custom expressions?"]}
   "other"
   {:description "User request doesn't fit standard categories"
    :examples    ["Any other request not covered above."]}})

(defn- render-user-intents-table
  "Render user-intents as a plain-text table."
  []
  (let [header "| Intent Category | Description | Examples |"
        sep    "|-----------------|-------------|----------|"
        rows   (map (fn [[intent {:keys [description examples]}]]
                      (str "| " intent " | " description " | " (str/join "; " examples) " |"))
                    user-intents)]
    (str/join "\n" (concat [header sep] rows))))

(defn- build-intent-prompt [conversation-context]
  (str "You are a user intent classification engine for requests to an AI agent operating on top of Metabase.\n"
       "Given a conversation, classify the user's intent into one of the following categories:\n\n"
       (render-user-intents-table)
       "\n\nThis is the conversation context:\n"
       "<conversation_context>\n"
       conversation-context
       "\n</conversation_context>\n\n"
       "## Output format\n"
       "Return the category wrapped in a <category> tag so that we can easily extract it from the string.\n"
       "Only respond with the <category> tag including the intent category name - nothing else.\n\n"
       "**Example:**\n"
       "User: \"I want to see sales by region for Q1.\"\n"
       "You: \"<category>query_data</category>\"\n\n"
       "Classify the user's intent into one of the Intent Categories above.\n"))

(defn- classify-user-intent!
  "Classify the user's message into one of the [[user-intent]] categories.
  Returns the intent string.
  Raises an exception if the classified intent is not in the known intents.
  Uses plain-text extraction (no tool calls) so it works with models that don't support function calling."
  [messages]
  (let [context (json/encode (take-last 3 messages))
        text    (transduce (keep (fn [{:keys [type text]}] (when (= type :text) text)))
                           str
                           (self/call-llm (llm/ee-ai-metabot-provider-lite)
                                          nil
                                          [{:role "user" :content (build-intent-prompt context)}]
                                          []
                                          ;; Omit :request-id from tracking-opts to skip snowplow token_usage event
                                          ;; since this is for internal usage.
                                          {:tag "user-intent-classification"}))
        intent  (second (re-find #"<category>([^<]+)</category>" text))]
    (when-not (contains? user-intents intent)
      (throw (ex-info (str "Classified intent '" intent "' not in known intents")
                      {:intent        intent
                       :valid-intents (keys user-intents)})))
    intent))

(defn- track-user-intent!
  "Fire user_intent :snowplow/ai_service_event synchronously."
  [intent tracking-opts]
  (analytics/track-event!
   :snowplow/ai_service_event
   {:hashed-metabase-license-token (analytics/hashed-metabase-token-or-uuid)
    :request-id                    (analytics/uuid->ai-service-hex-uuid (:request-id tracking-opts))
    :source                        (:source tracking-opts)
    :event                         "user_intent"
    :user-id                       api/*current-user-id*
    :session-id                    (:session-id tracking-opts)
    :profile                       (some-> (:profile-name tracking-opts) name)
    :event-details                 {"intent" intent}}))

(defn classify-and-track-user-intent-async!
  "Classify and [[track-user-intent!]] in a background future."
  [messages tracking-opts]
  (future
    (try
      (-> messages
          classify-user-intent!
          (track-user-intent! tracking-opts))
      (catch Exception e
        (log/warn e "Failed to track user intent")))))
