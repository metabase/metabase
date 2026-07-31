(ns metabase.metabot.self.openrouter
  "OpenRouter / Chat Completions adapter.

  OpenRouter exposes an OpenAI-compatible Chat Completions API (`/v1/chat/completions`)
  which is different from the newer OpenAI Responses API (`/v1/responses`) that our
  `openai.clj` adapter speaks.

  The agent loop produces AISDK parts as its canonical message format. This
  adapter converts those directly to Chat Completions messages."
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for OpenRouter")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- openrouter-error-msg
  "Canonical, status-specific OpenRouter error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      401 (tru "OpenRouter API key expired or invalid")
      402 (tru "OpenRouter has insufficient credits")
      403 (tru "OpenRouter API key has insufficient permissions")
      404 (tru "OpenRouter model listing endpoint is unavailable")
      429 (tru "OpenRouter has rate limited us")
      500 (tru "OpenRouter returned an internal server error")
      502 (tru "OpenRouter upstream provider returned an error")
      503 (tru "OpenRouter service is unavailable")
      (tru "OpenRouter API error (HTTP {0})" status))))

(def ^:private supported-models
  "OpenRouter models offered in the Metabot model picker, as a map of model id -> display name.
  `list-models` returns the intersection of this map with the `/v1/models` catalog.
  Mirrors the models whitelisted for the direct anthropic and openai providers; note that
  OpenRouter model IDs use dots in version numbers (`claude-haiku-4.5`), unlike the
  Anthropic API's hyphenated IDs (`claude-haiku-4-5`)."
  {"anthropic/claude-fable-5"     "Claude Fable 5"
   "anthropic/claude-opus-5"      "Claude Opus 5"
   "anthropic/claude-opus-4.8"    "Claude Opus 4.8"
   "anthropic/claude-opus-4.7"    "Claude Opus 4.7"
   "anthropic/claude-opus-4.6"    "Claude Opus 4.6"
   "anthropic/claude-opus-4.5"    "Claude Opus 4.5"
   "anthropic/claude-opus-4.1"    "Claude Opus 4.1"
   "anthropic/claude-sonnet-5"    "Claude Sonnet 5"
   "anthropic/claude-sonnet-4.6"  "Claude Sonnet 4.6"
   "anthropic/claude-sonnet-4.5"  "Claude Sonnet 4.5"
   "anthropic/claude-haiku-4.5"   "Claude Haiku 4.5"
   "deepseek/deepseek-v4-pro"     "DeepSeek V4 Pro"
   "mistralai/mistral-medium-3-5" "Mistral Medium 3.5"
   "openai/gpt-5.6-sol"           "GPT-5.6 Sol"
   "openai/gpt-5.6-terra"         "GPT-5.6 Terra"
   "openai/gpt-5.6-luna"          "GPT-5.6 Luna"
   "openai/gpt-5.5"               "GPT-5.5"
   "openai/gpt-5.5-pro"           "GPT-5.5 Pro"
   "openai/gpt-5.4"               "GPT-5.4"
   "openai/gpt-5.4-pro"           "GPT-5.4 Pro"
   "openai/gpt-5.4-mini"          "GPT-5.4 Mini"
   "z-ai/glm-5.2"                 "GLM-5.2"})

(defn- supported-model?
  "Whether a `/v1/models` catalog entry is one of the [[supported-models]]."
  [{:keys [id]}]
  (contains? supported-models id))

(defn- list-all-models
  "Fetch the full OpenRouter model catalog (`GET /v1/models`).
  `:ai-proxy?` is not supported for OpenRouter and throws when true."
  [{:keys [credentials ai-proxy?]}]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (try
    (let [auth (core/resolve-auth "openrouter" "OpenRouter"
                                  (when-let [k (or (not-empty (:api-key credentials))
                                                   (not-empty (llm/llm-openrouter-api-key)))]
                                    {:url     (llm/llm-openrouter-api-base-url)
                                     :headers {"Authorization" (str "Bearer " k)}})
                                  ai-proxy?)
          res  (core/request auth {:method  :get
                                   :url     "/v1/models"
                                   :as      :json
                                   :headers {"Content-Type" "application/json"
                                             "HTTP-Referer" "https://metabase.com"
                                             "X-Title"      "Metabase"}})]
      (get-in res [:body :data]))
    (catch Exception e
      (core/rethrow-api-error! "openrouter" openrouter-error-msg e))))

(defn list-models
  "List the OpenRouter models supported by this adapter (see [[supported-models]]).
  No-arg uses the configured API key. Opts map supports `:credentials` (`{:api-key ...}`) and `:ai-proxy?`.
  `:ai-proxy?` is not supported for OpenRouter and throws when true."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (filter supported-model?)
                 (sort-by :id)
                 (mapv (fn [{:keys [id] :as model}]
                         {:id id :display_name (or (:name model) (supported-models id))})))}))

;;; Streaming response → AISDK v5 chunks

(defn openrouter->aisdk-chunks-xf
  "Translates Chat Completions streaming chunks into AI SDK v5 protocol chunks.
  OpenRouter streams the generic Chat Completions dialect; see
  [[chat-completions/chat-completions->aisdk-chunks-xf]]."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf))

;;; HTTP request

(defn- anthropic-model?
  "Whether an OpenRouter model id routes to Anthropic (e.g. `anthropic/claude-haiku-4.5`)."
  [model]
  (str/starts-with? (str model) "anthropic/"))

(mu/defn openrouter-request-body
  "Build the Chat Completions request body for an LLM request.

  Delegates to the shared [[chat-completions/request-body]]. Anthropic models get explicit prompt-cache breakpoints
  [[claude/system->cached-content-blocks]].  OpenRouter doesn't document `cache_control` on tool definitions, so
  unlike claude.clj we don't put a separate breakpoint there.

  Other models (OpenAI) keep the generic plain string system message: OpenAI prompt caching is automatic server-side
  and takes no request markup."
  [{:keys [model system] :as opts
    :or   {model "anthropic/claude-haiku-4.5"}} :- core/LLMRequestOpts]
  (cond-> (chat-completions/request-body (assoc opts :model model))
    (and system (anthropic-model? model))
    (update-in [:messages 0 :content] claude/system->cached-content-blocks)))

(mu/defn openrouter-raw
  "Perform a streaming request to the Chat Completions API.

  Works with OpenRouter, or any OpenAI-compatible endpoint that supports
  `/v1/chat/completions` (e.g. vLLM, Ollama, Together, etc.).
  `:ai-proxy?` is not supported for OpenRouter and throws when true."
  [{:keys [model tools ai-proxy?] :as opts
    :or   {model "anthropic/claude-haiku-4.5"}} :- core/LLMRequestOpts]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [req (openrouter-request-body opts)]
    (log/debug "OpenRouter request" {:model model :msg-count (count (:messages req)) :tools (count (or tools []))})
    (with-span :info {:name       :metabot.openrouter/request
                      :model      model
                      :msg-count  (count (:messages req))
                      :tool-count (count (or tools []))}
      (try
        (let [api-key  (not-empty (llm/llm-openrouter-api-key))
              auth     (core/resolve-auth "openrouter" "OpenRouter"
                                          (when api-key
                                            {:url     (llm/llm-openrouter-api-base-url)
                                             :headers {"Authorization" (str "Bearer " api-key)}})
                                          ai-proxy?)
              response (core/request auth
                                     {:method  :post
                                      :url     "/v1/chat/completions"
                                      :as      :stream
                                      :headers {"Content-Type" "application/json"
                                                "HTTP-Referer" "https://metabase.com"
                                                "X-Title"      "Metabase"}
                                      :body    (json/encode req)})]
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "openrouter"
                                     :model    model
                                     :url      "/v1/chat/completions"
                                     :request  req})))
        (catch Exception e
          (core/rethrow-api-error! "openrouter" openrouter-error-msg e))))))

(defn openrouter
  "Call OpenRouter Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply openrouter-raw args)]
    (eduction (openrouter->aisdk-chunks-xf) raw)))
