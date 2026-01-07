(ns metabase.llm.openai
  "OpenAI API client for OSS LLM integration.

   Provides a simple synchronous chat completions interface for single-shot
   text-to-SQL generation. Does not support streaming or tool execution."
  (:require
   [clj-http.client :as http]
   [metabase.llm.settings :as llm-settings]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private openai-chat-completions-url
  "https://api.openai.com/v1/chat/completions")

(defn- build-request-body
  "Build the request body for OpenAI chat completions API."
  [{:keys [model system messages]}]
  (let [all-messages (cond-> []
                       system   (conj {:role "system" :content system})
                       messages (into messages))]
    {:model    model
     :messages all-messages}))

(defn- extract-response-text
  "Extract the text content from OpenAI chat completions response."
  [response-body]
  (-> response-body
      :choices
      first
      :message
      :content))

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
  "Send a chat completion request to OpenAI. Returns the response text.

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
          (extract-response-text (:body response)))
        (catch Exception e
          (handle-api-error e))))))
