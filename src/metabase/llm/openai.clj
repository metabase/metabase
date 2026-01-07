(ns metabase.llm.openai
  "OpenAI API client for OSS LLM integration.

   Provides both synchronous and streaming chat completions interfaces
   for text-to-SQL generation. Does not support tool execution."
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [metabase.llm.settings :as llm-settings]
   [metabase.llm.streaming :as streaming]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private openai-chat-completions-url
  "https://api.openai.com/v1/chat/completions")

(def ^:private sql-response-schema
  "JSON schema for structured SQL response output.
   Guarantees the model returns valid JSON with sql field.

   Note: With strict mode, all properties must be in 'required' array,
   or use nullable types (anyOf with null) for optional fields."
  {:type "json_schema"
   :json_schema {:name   "sql_response"
                 :strict true
                 :schema {:type                 "object"
                          :properties           {:sql         {:type "string"
                                                               :description "The generated SQL query"}
                                                 :explanation {:anyOf [{:type "string"} {:type "null"}]
                                                               :description "Brief explanation of the query (optional)"}}
                          :required             ["sql" "explanation"]
                          :additionalProperties false}}})

(defn- build-request-body
  "Build the request body for OpenAI chat completions API."
  [{:keys [model system messages]}]
  (let [all-messages (cond-> []
                       system   (conj {:role "system" :content system})
                       messages (into messages))]
    {:model           model
     :messages        all-messages
     :response_format sql-response-schema}))

(defn- extract-response-content
  "Extract the raw content string from OpenAI chat completions response."
  [response-body]
  (-> response-body :choices first :message :content))

(defn- handle-api-error
  "Handle HTTP errors from OpenAI API."
  [exception]
  (if-let [response-body (some-> exception ex-data :body)]
    (let [parsed (try
                   (json/decode response-body)
                   (catch Exception _
                     {:error {:message response-body}}))]
      (throw (ex-info (or (-> parsed :error :message)
                          "OpenAI API request failed")
                      {:type   :openai-api-error
                       :status (some-> exception ex-data :status)
                       :body   parsed}
                      exception)))
    (throw exception)))

(defn chat-completion
  "Send a chat completion request to OpenAI.
   Returns the raw content string from the response (JSON with structured outputs).

   Options:
   - :model    - Model to use (default: configured model or gpt-4o-mini)
   - :system   - System prompt
   - :messages - Vector of {:role :content} maps for conversation history"
  [{:keys [model system messages]}]
  (let [api-key (llm-settings/llm-openai-api-key)]
    (when-not api-key
      (throw (ex-info "LLM is not configured. Please set an OpenAI API key via MB_LLM_OPENAI_API_KEY."
                      {:type :llm-not-configured})))
    (let [model   (or model (llm-settings/llm-openai-model) "gpt-4o-mini")
          request {:model    model
                   :system   system
                   :messages messages}]
      (try
        (let [response (http/post openai-chat-completions-url
                                  {:headers      {"Authorization" (str "Bearer " api-key)
                                                  "Content-Type"  "application/json"}
                                   :body         (json/encode (build-request-body request))
                                   :as           :json
                                   :content-type :json})]
          (extract-response-content (:body response)))
        (catch Exception e
          (handle-api-error e))))))

;;; ------------------------------------------ Streaming API ------------------------------------------

(defn- build-streaming-request-body
  "Build the request body for OpenAI streaming chat completions API."
  [{:keys [model system messages]}]
  (let [all-messages (cond-> []
                       system   (conj {:role "system" :content system})
                       messages (into messages))]
    {:model           model
     :messages        all-messages
     :stream          true
     :response_format sql-response-schema}))

(defn- handle-streaming-error
  "Handle error response from OpenAI streaming API.
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
                       (str "OpenAI API error: HTTP " status))
        error-chan (a/chan 1)]
    (log/error "OpenAI streaming request failed"
               {:status     status
                :error-body body-str
                :parsed     parsed
                :error-msg  error-msg})
    (a/>!! error-chan {:type :error :error error-msg})
    (a/close! error-chan)
    error-chan))

(defn chat-completion-stream
  "Send a streaming chat completion request to OpenAI.

   Returns a core.async channel that emits AI SDK v5 formatted text delta chunks:
   {:type :text-delta :delta \"text chunk\"}

   The channel closes when the stream completes or on error.

   Options:
   - :model    - Model to use (default: configured model or gpt-4o-mini)
   - :system   - System prompt
   - :messages - Vector of {:role :content} maps for conversation history"
  [{:keys [model system messages]}]
  (let [api-key (llm-settings/llm-openai-api-key)]
    (when-not api-key
      (throw (ex-info "LLM is not configured. Please set an OpenAI API key via MB_LLM_OPENAI_API_KEY."
                      {:type :llm-not-configured})))
    (let [model        (or model (llm-settings/llm-openai-model) "gpt-4o-mini")
          request      {:model model :system system :messages messages}
          request-body (build-streaming-request-body request)]
      (try
        (let [response (http/post openai-chat-completions-url
                                  {:as               :stream
                                   :headers          {"Authorization" (str "Bearer " api-key)
                                                      "Content-Type"  "application/json"}
                                   :body             (json/encode request-body)
                                   :throw-exceptions false})]
          (if (<= 200 (:status response) 299)
            (a/pipe (streaming/sse-chan (:body response))
                    (a/chan 64 streaming/openai-chat->aisdk-xf))
            (handle-streaming-error (:status response) (:body response))))
        (catch Exception e
          (log/error e "OpenAI streaming request failed with exception")
          (let [error-chan (a/chan 1)]
            (a/>!! error-chan {:type :error :error (ex-message e)})
            (a/close! error-chan)
            error-chan))))))
