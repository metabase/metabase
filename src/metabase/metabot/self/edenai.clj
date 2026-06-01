(ns metabase.metabot.self.edenai
  "Eden AI adapter.

  Eden AI V3 exposes an OpenAI-compatible Chat Completions API at
  `https://api.edenai.run/v3/chat/completions`, with model names in the
  form `<provider>/<model>` (e.g. `openai/gpt-4o`,
  `anthropic/claude-3-5-sonnet-latest`, `google/gemini-2.5-flash`).
  Models are listed at `GET /v3/models`.

  Because the wire format matches `openrouter.clj`, we delegate the
  AISDK<->ChatCompletions translation to that adapter and only customize
  authentication, error mapping, and the model-listing endpoint."
  (:require
   [clojure.string :as str]
   [malli.json-schema :as mjs]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.schema :as schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(defn- tool->edenai-chat
  "Convert a tool definition map to Chat Completions tool format.
  Accepts a ToolEntry map with :tool-name, :doc, :schema, :fn."
  [{:keys [tool-name doc schema]}]
  (let [[_:=> [_:cat params] _out] schema
        params (schema/filter-schema-by-features params)
        doc    (if (str/starts-with? (or doc "") "Inputs: ")
                 (second (str/split doc #"\n\n  " 2))
                 doc)]
    {:type     "function"
     :function {:name        tool-name
                :description doc
                :parameters  (mjs/transform params {:additionalProperties false})}}))

(defn- edenai-error-msg
  "Canonical, status-specific Eden AI error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      401 (tru "Eden AI API key expired or invalid")
      402 (tru "Eden AI has insufficient credits")
      403 (tru "Eden AI API key has insufficient permissions")
      404 (tru "Eden AI endpoint or model is unavailable")
      429 (tru "Eden AI has rate limited us")
      500 (tru "Eden AI returned an internal server error")
      502 (tru "Eden AI upstream provider returned an error")
      503 (tru "Eden AI service is unavailable")
      (tru "Eden AI API error (HTTP {0})" status))))

(defn list-models
  "List available Eden AI models.
  No-arg uses the configured API key. Opts map supports `:api-key` and `:ai-proxy?`."
  ([] (list-models {}))
  ([{:keys [api-key ai-proxy?]}]
   (when (and api-key (str/blank? api-key))
     (throw (core/missing-api-key-ex "Eden AI")))
   (try
     (let [auth (core/resolve-auth "edenai" "Eden AI"
                                   (when-let [k (or (not-empty api-key) (not-empty (llm/llm-edenai-api-key)))]
                                     {:url     (llm/llm-edenai-api-base-url)
                                      :headers {"Authorization" (str "Bearer " k)}})
                                   ai-proxy?)
           res  (core/request auth {:method  :get
                                    :url     "/models"
                                    :as      :json
                                    :headers {"Content-Type" "application/json"}})]
       {:models (mapv (fn [model]
                        {:id           (:id model)
                         :display_name (or (:name model) (:id model))})
                      (sort-by :id (get-in res [:body :data])))})
     (catch Exception e
       (core/rethrow-api-error! "edenai" edenai-error-msg e)))))

(mu/defn edenai-raw
  "Perform a streaming request to Eden AI's OpenAI-compatible Chat Completions endpoint."
  [{:keys [model system input tools temperature max-tokens tool_choice schema ai-proxy?]
    :or   {model "openai/gpt-4o-mini"}} :- core/LLMRequestOpts]
  (let [messages  (cond-> (openrouter/parts->cc-messages input)
                    system (as-> msgs (into [{:role "system" :content system}] msgs)))
        all-tools (or (when schema
                        ;; Structured output: force a tool call with the given JSON schema
                        [{:type     "function"
                          :function {:name        "structured_output"
                                     :description "Output structured data"
                                     :parameters  schema}}])
                      (seq (mapv tool->edenai-chat tools)))
        req       (cond-> {:model          model
                           :stream         true
                           :stream_options {:include_usage true}
                           :messages       messages}
                    all-tools   (assoc :tools       (vec all-tools)
                                       :tool_choice (cond
                                                      schema      "required"
                                                      tool_choice tool_choice
                                                      :else       "auto"))
                    temperature (assoc :temperature temperature)
                    max-tokens  (assoc :max_tokens max-tokens))]
    (log/debug "Eden AI request" {:model model :msg-count (count messages) :tools (count (or tools []))})
    (with-span :info {:name       :metabot.edenai/request
                      :model      model
                      :msg-count  (count messages)
                      :tool-count (count (or tools []))}
      (try
        (let [api-key  (not-empty (llm/llm-edenai-api-key))
              auth     (core/resolve-auth "edenai" "Eden AI"
                                          (when api-key
                                            {:url     (llm/llm-edenai-api-base-url)
                                             :headers {"Authorization" (str "Bearer " api-key)}})
                                          ai-proxy?)
              response (core/request auth
                                     {:method  :post
                                      :url     "/chat/completions"
                                      :as      :stream
                                      :headers {"Content-Type" "application/json"}
                                      :body    (json/encode req)})]
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "edenai"
                                     :model    model
                                     :url      "/chat/completions"
                                     :request  req})))
        (catch Exception e
          (core/rethrow-api-error! "edenai" edenai-error-msg e))))))

(defn edenai
  "Call Eden AI's OpenAI-compatible Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply edenai-raw args)]
    (eduction (openrouter/openrouter->aisdk-chunks-xf) raw)))
