(ns metabase.llm.anthropic
  "Anthropic API client for OSS LLM integration.

   Provides synchronous chat completions for text-to-SQL generation
   using tool_use for structured output."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.llm.settings :as llm-settings]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (com.fasterxml.jackson.core JsonParseException)))

(set! *warn-on-reflection* true)

(defn- model->simplified-provider-model
  "Given a precise model name, return a simplified name with the provider prefixed.

  E.g. \"claude-sonnet-4-5-20250929\" -> \"anthropic/claude-sonnet-4-5\"

  Useful when we don't care to distinguish between minor model differences, like for telemetry or cost estimation."
  [model]
  (when model
    (str "anthropic/" (str/replace model #"-\d{8}$" ""))))

(def ^:private generate-sql-tool
  "Tool definition for structured SQL output.
   Forces the model to return a JSON object with sql and optional explanation."
  {:name        "generate_sql"
   :description "Generate SQL query from the user's request. Always use this tool to return your response."
   :input_schema {:type       "object"
                  :properties {:sql         {:type        "string"
                                             :description "The generated SQL query"}
                               :explanation {:type        "string"
                                             :description "Brief explanation of the query"}}
                  :required   ["sql"]}})

(defn- build-request-headers
  "Build headers for Anthropic API request."
  [api-key]
  {"x-api-key"         api-key
   "anthropic-version" (llm-settings/llm-anthropic-api-version)
   "content-type"      "application/json"})

(defn- build-request-body
  "Build the request body for Anthropic messages API."
  [{:keys [model system messages]}]
  (cond-> {:model       model
           :max_tokens  (llm-settings/llm-max-tokens)
           :messages    messages
           :tools       [generate-sql-tool]
           :tool_choice {:type "tool" :name "generate_sql"}}
    system (assoc :system system)))

(defn- extract-tool-input
  "Extract the tool input from Anthropic messages response.
   Returns the parsed JSON input from the tool_use content block."
  [response-body]
  (let [content (:content response-body)]
    (->> content
         (filter #(= "tool_use" (:type %)))
         first
         :input)))

(defn- handle-api-error
  "Handle HTTP errors from Anthropic API."
  [exception]
  (if-let [response-body (some-> exception ex-data :body)]
    (let [parsed (try
                   (json/decode response-body)
                   (catch JsonParseException _
                     {:error {:message response-body}}))]
      (throw (ex-info (or (-> parsed :error :message)
                          "Anthropic API request failed")
                      {:type   :anthropic-api-error
                       :status (some-> exception ex-data :status)
                       :body   parsed}
                      exception)))
    (throw exception)))

(defn- get-api-key-or-throw
  "Gets Anthropic API key from settings or throws an unconfigured error."
  []
  (let [api-key (llm-settings/llm-anthropic-api-key)]
    (when (str/blank? api-key)
      (throw (ex-info "LLM is not configured. Please set an Anthropic API key via MB_LLM_ANTHROPIC_API_KEY."
                      {:type :llm-not-configured})))
    api-key))

(defn list-models
  "Send a list models request to Anthropic
   Returns a map with :models"
  []
  (try
    (let [url (str (llm-settings/llm-anthropic-api-url) "/v1/models")
          response (http/get url
                             {:headers            {"x-api-key"         (get-api-key-or-throw)
                                                   "anthropic-version" (llm-settings/llm-anthropic-api-version)}})
          body (json/decode+kw (:body response))
          models (reverse (sort-by :created_at (:data body)))]
      {:models (map #(select-keys % [:id :display_name]) models)})
    (catch Exception e
      (handle-api-error e))))

(defn chat-completion
  "Send a chat completion request to Anthropic.
   Returns a map with:
   - :result      - Map with :sql and optionally :explanation from the tool response
   - :usage       - Map with :model, :prompt (input tokens), :completion (output tokens)
   - :duration-ms - Request duration in milliseconds

   Options:
   - :model    - Model to use (default: configured model or claude-sonnet-4-20250514)
   - :system   - System prompt
   - :messages - Vector of {:role :content} maps for conversation history"
  [{:keys [model system messages]}]
  (let [model      (or model (llm-settings/llm-anthropic-model))
        request    {:model    model
                    :system   system
                    :messages messages}
        start-time (u/start-timer)]
    (try
      (let [url (str (llm-settings/llm-anthropic-api-url) "/v1/messages")
            response    (http/post url
                                   {:headers            (build-request-headers (get-api-key-or-throw))
                                    :body               (json/encode (build-request-body request))
                                    :as                 :json
                                    :content-type       :json
                                    :socket-timeout     (llm-settings/llm-request-timeout-ms)
                                    :connection-timeout (llm-settings/llm-connection-timeout-ms)})
            duration-ms (u/since-ms start-time)
            body        (:body response)
            usage       (:usage body)]
        {:result      (extract-tool-input body)
         :duration-ms duration-ms
         :usage       {:model      (model->simplified-provider-model model)
                       :prompt     (:input_tokens usage)
                       :completion (:output_tokens usage)}})
      (catch Exception e
        (handle-api-error e)))))
