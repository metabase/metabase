(ns metabase.llm.anthropic
  "Anthropic API client for OSS LLM integration.

   Provides both synchronous and streaming chat completions interfaces
   for text-to-SQL generation using tool_use for structured output."
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [metabase.llm.settings :as llm-settings]
   [metabase.llm.streaming :as streaming]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private anthropic-list-models-url
  "https://api.anthropic.com/v1/models")

(def ^:private anthropic-messages-url
  "https://api.anthropic.com/v1/messages")

(def ^:private anthropic-api-version
  "2023-06-01")

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
   "anthropic-version" anthropic-api-version
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
                   (catch Exception _
                     {:error {:message response-body}}))]
      (throw (ex-info (or (-> parsed :error :message)
                          "Anthropic API request failed")
                      {:type   :anthropic-api-error
                       :status (some-> exception ex-data :status)
                       :body   parsed}
                      exception)))
    (throw exception)))

(defn get-api-key-or-throw
  "Gets Anthropic API key from settings or throws and unconfigured error."
  []
  (let [api-key (llm-settings/llm-anthropic-api-key)]
    (when-not api-key
      (throw (ex-info "LLM is not configured. Please set an Anthropic API key via MB_LLM_ANTHROPIC_API_KEY."
                      {:type :llm-not-configured})))
    api-key))

(defn list-models
  "Send a list models request to Anthropic
   Returns a map with :models"
  []
  (try
    (let [response (http/get anthropic-list-models-url
                             {:headers            {"x-api-key"         (get-api-key-or-throw)
                                                   "anthropic-version" anthropic-api-version}})
          body (json/decode+kw (:body response))
          models (reverse (sort-by :created_at (:data body)))]
      {:models (map #(select-keys % [:id :display_name]) models)})
    (catch Exception e
      (handle-api-error e))))

(defn chat-completion
  "Send a chat completion request to Anthropic.
   Returns a map with :sql and optionally :explanation from the tool response.

   Options:
   - :model    - Model to use (default: configured model or claude-sonnet-4-20250514)
   - :system   - System prompt
   - :messages - Vector of {:role :content} maps for conversation history"
  [{:keys [model system messages]}]
  (let [model   (or model (llm-settings/llm-anthropic-model))
        request {:model    model
                 :system   system
                 :messages messages}]
    (try
      (let [response (http/post anthropic-messages-url
                                {:headers            (build-request-headers (get-api-key-or-throw))
                                 :body               (json/encode (build-request-body request))
                                 :as                 :json
                                 :content-type       :json
                                 :socket-timeout     (llm-settings/llm-request-timeout-ms)
                                 :connection-timeout (llm-settings/llm-connection-timeout-ms)})]
        (extract-tool-input (:body response)))
      (catch Exception e
        (handle-api-error e)))))

;;; ------------------------------------------ Streaming API ------------------------------------------

(defn- build-streaming-request-body
  "Build the request body for Anthropic streaming messages API."
  [{:keys [model system messages]}]
  (-> (build-request-body {:model model :system system :messages messages})
      (assoc :stream true)))

(defn- handle-streaming-error
  "Handle error response from Anthropic streaming API.
   Returns a channel with an error message."
  [status body]
  (let [body-str   (cond
                     (instance? java.io.InputStream body)
                     (try (slurp body) (catch Exception _ nil))

                     (string? body)
                     body

                     :else nil)
        parsed     (when body-str
                     (try (json/decode+kw body-str) (catch Exception _ nil)))
        error-msg  (or (-> parsed :error :message)
                       body-str
                       (str "Anthropic API error: HTTP " status))
        error-chan (a/chan 1)]
    (log/error "Anthropic streaming request failed"
               {:status     status
                :error-body body-str
                :parsed     parsed
                :error-msg  error-msg})
    (a/>!! error-chan {:type :error :error error-msg})
    (a/close! error-chan)
    error-chan))

(defn chat-completion-stream
  "Send a streaming chat completion request to Anthropic.

   Returns a core.async channel that emits AI SDK v5 formatted text delta chunks:
   {:type :text-delta :delta \"text chunk\"}

   The channel closes when the stream completes or on error.

   Options:
   - :model    - Model to use (default: configured model or claude-sonnet-4-20250514)
   - :system   - System prompt
   - :messages - Vector of {:role :content} maps for conversation history"
  [{:keys [model system messages]}]
  (let [api-key (llm-settings/llm-anthropic-api-key)]
    (when-not api-key
      (throw (ex-info "LLM is not configured. Please set an Anthropic API key via MB_LLM_ANTHROPIC_API_KEY."
                      {:type :llm-not-configured})))
    (let [model        (or model (llm-settings/llm-anthropic-model))
          request      {:model model :system system :messages messages}
          request-body (build-streaming-request-body request)]
      (try
        (let [response (http/post anthropic-messages-url
                                  {:as                 :stream
                                   :headers            (build-request-headers api-key)
                                   :body               (json/encode request-body)
                                   :throw-exceptions   false
                                   :socket-timeout     (llm-settings/llm-request-timeout-ms)
                                   :connection-timeout (llm-settings/llm-connection-timeout-ms)})]
          (if (<= 200 (:status response) 299)
            (a/pipe (streaming/anthropic-sse-chan (:body response))
                    (a/chan 64 streaming/anthropic-chat->aisdk-xf))
            (handle-streaming-error (:status response) (:body response))))
        (catch Exception e
          (log/error e "Anthropic streaming request failed with exception")
          (let [error-chan (a/chan 1)]
            (a/>!! error-chan {:type :error :error (ex-message e)})
            (a/close! error-chan)
            error-chan))))))
