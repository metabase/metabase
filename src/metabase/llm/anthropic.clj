(ns metabase.llm.anthropic
  "Anthropic API client for OSS LLM integration.

   Provides both synchronous and streaming chat completions interfaces
   for text-to-SQL generation using tool_use for structured output."
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase.llm.settings :as llm-settings]
   [metabase.llm.streaming :as streaming]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private anthropic-messages-url
  "https://api.anthropic.com/v1/messages")

(def ^:private anthropic-api-version
  "2023-06-01")

(def default-model
  "Default Anthropic model for SQL generation."
  "claude-sonnet-4-5-20250929")

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
  (let [api-key (llm-settings/llm-anthropic-api-key)]
    (when-not api-key
      (throw (ex-info "LLM is not configured. Please set an Anthropic API key via MB_LLM_ANTHROPIC_API_KEY."
                      {:type :llm-not-configured})))
    (let [model      (or model (llm-settings/llm-anthropic-model) default-model)
          request    {:model    model
                      :system   system
                      :messages messages}
          start-time (u/start-timer)]
      (try
        (let [response    (http/post anthropic-messages-url
                                     {:headers            (build-request-headers api-key)
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
          (handle-api-error e))))))

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

   Returns a core.async channel that emits AI SDK v5 formatted chunks:
   - {:type :text-delta :delta \"text chunk\"} for content
   - {:type :usage :id \"anthropic/model\" :usage {:promptTokens N}} from message_start
   - {:type :usage :id \"anthropic/model\" :usage {:completionTokens N}} from message_delta

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
    (let [model              (or model (llm-settings/llm-anthropic-model) default-model)
          ;; Transform the :id field on usage parts to simplified provider model format
          simplify-model-xf (map (fn [chunk]
                                   (if (and (= :usage (:type chunk)) (:id chunk))
                                     (update chunk :id model->simplified-provider-model)
                                     chunk)))
          request            {:model model :system system :messages messages}
          request-body       (build-streaming-request-body request)]
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
                    (a/chan 64 (comp streaming/anthropic-chat->aisdk-xf
                                     simplify-model-xf)))
            (handle-streaming-error (:status response) (:body response))))
        (catch Exception e
          (log/error e "Anthropic streaming request failed with exception")
          (let [error-chan (a/chan 1)]
            (a/>!! error-chan {:type :error :error (ex-message e)})
            (a/close! error-chan)
            error-chan))))))
