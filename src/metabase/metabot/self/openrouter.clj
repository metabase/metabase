(ns metabase.metabot.self.openrouter
  "OpenRouter / Chat Completions adapter.

  OpenRouter exposes an OpenAI-compatible Chat Completions API (`/v1/chat/completions`)
  which is different from the newer OpenAI Responses API (`/v1/responses`) that our
  `openai.clj` adapter speaks.

  The agent loop produces AISDK parts as its canonical message format. This
  adapter converts those directly to Chat Completions messages."
  (:require
   [clojure.string :as str]
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

(def supported-models
  "OpenRouter models offered in the Metabot model picker, keyed by model id.
  `list-models` returns the intersection of this map with the `/v1/models` catalog.
  Mirrors the models whitelisted for the direct anthropic and openai providers; note that
  OpenRouter model IDs use dots in version numbers (`claude-haiku-4.5`), unlike the
  Anthropic API's hyphenated IDs (`claude-haiku-4-5`). Context windows are OpenRouter's
  serving limits, which can differ from the model's direct-provider window; they come from
  https://openrouter.ai/api/v1/models, taking the lower of `context_length` and
  `top_provider.context_length` since a request can be routed to any backing provider.
  OpenAI rows subtract the 128k max output from that total, recording max input like
  the direct openai adapter."
  {"anthropic/claude-fable-5"        {:display-name "Claude Fable 5"          :context-window 1000000}
   "anthropic/claude-opus-5"         {:display-name "Claude Opus 5"           :context-window 1000000}
   "anthropic/claude-opus-4.8"       {:display-name "Claude Opus 4.8"         :context-window 1000000}
   "anthropic/claude-opus-4.7"       {:display-name "Claude Opus 4.7"         :context-window 1000000}
   "anthropic/claude-opus-4.6"       {:display-name "Claude Opus 4.6"         :context-window 1000000}
   "anthropic/claude-opus-4.5"       {:display-name "Claude Opus 4.5"         :context-window  200000}
   "anthropic/claude-opus-4.1"       {:display-name "Claude Opus 4.1"         :context-window  200000}
   "anthropic/claude-sonnet-5"       {:display-name "Claude Sonnet 5"         :context-window 1000000}
   "anthropic/claude-sonnet-4.6"     {:display-name "Claude Sonnet 4.6"       :context-window 1000000}
   "anthropic/claude-sonnet-4.5"     {:display-name "Claude Sonnet 4.5"       :context-window 1000000}
   "anthropic/claude-haiku-4.5"      {:display-name "Claude Haiku 4.5"        :context-window  200000}
   "deepseek/deepseek-v4-pro"        {:display-name "DeepSeek V4 Pro 0423"    :context-window 1048576}
   "deepseek/deepseek-v4-pro-0813"   {:display-name "DeepSeek V4 Pro 0813"    :context-window 1048575}
   "deepseek/deepseek-v4-flash-0731" {:display-name "DeepSeek V4 Flash 0731"  :context-window 1048576}
   "mistralai/mistral-medium-3-5"    {:display-name "Mistral Medium 3.5"      :context-window  262144}
   "moonshotai/kimi-k3"              {:display-name "Kimi K3"                 :context-window 1048576}
   "openai/gpt-5.6-sol"              {:display-name "GPT-5.6 Sol"             :context-window  922000}
   "openai/gpt-5.6-terra"            {:display-name "GPT-5.6 Terra"           :context-window  922000}
   "openai/gpt-5.6-luna"             {:display-name "GPT-5.6 Luna"            :context-window  922000}
   "openai/gpt-5.5"                  {:display-name "GPT-5.5"                 :context-window  922000}
   "openai/gpt-5.5-pro"              {:display-name "GPT-5.5 Pro"             :context-window  922000}
   "openai/gpt-5.4"                  {:display-name "GPT-5.4"                 :context-window  922000}
   "openai/gpt-5.4-pro"              {:display-name "GPT-5.4 Pro"             :context-window  922000}
   "openai/gpt-5.4-mini"             {:display-name "GPT-5.4 Mini"            :context-window  272000}
   "qwen/qwen3.8-max"                {:display-name "Qwen3.8 Max"             :context-window 1000000}
   "z-ai/glm-5.3"                    {:display-name "GLM-5.3"                 :context-window 1048576}
   "z-ai/glm-5.2"                    {:display-name "GLM-5.2"                 :context-window 1048576}})

(defn context-window-tokens
  "The input context window for `model`, or nil when it isn't one we know."
  [model]
  (get-in supported-models [model :context-window]))

(defn model-display-name
  "What the model picker calls `model`, or nil when it is not one of the [[supported-models]] — the caller shows the
  id itself rather than inventing a name for it."
  [model]
  (get supported-models model))

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
                                  (when-let [k (not-empty (:api-key credentials))]
                                    {:url     (:base-url credentials)
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
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request,
  and throws when they are missing. Also supports `:ai-proxy?`.
  `:ai-proxy?` is not supported for OpenRouter and throws when true."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (filter supported-model?)
                 (sort-by :id)
                 (mapv (fn [{:keys [id] :as model}]
                         {:id id :display_name (or (:name model) (get-in supported-models [id :display-name]))})))}))

;;; Streaming response → AISDK v5 chunks

(def ^:private stop-reasons
  "OpenRouter normalizes each upstream model's reason into the Chat Completions set (the raw value stays in
  `native_finish_reason`), and adds `error` for a mid-generation upstream failure."
  (assoc chat-completions/stop-reasons "error" "error"))

(defn openrouter->aisdk-chunks-xf
  "Translates Chat Completions streaming chunks into AI SDK v5 protocol chunks.
  OpenRouter streams the generic Chat Completions dialect; see
  [[chat-completions/chat-completions->aisdk-chunks-xf]]."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf stop-reasons))

;;; HTTP request

(defn- anthropic-model?
  "Whether an OpenRouter model id routes to Anthropic (e.g. `anthropic/claude-haiku-4.5`)."
  [model]
  (str/starts-with? (str model) "anthropic/"))

(defn- anthropic-current-gen?
  "Current-generation Claude on OpenRouter: Fable, Opus >= 4.7, Sonnet >= 5."
  [model]
  (or (str/starts-with? model "anthropic/claude-fable")
      (when-let [[_ family major minor] (re-find #"^anthropic/claude-(opus|sonnet)-(\d+)(?:\.(\d+))?" model)]
        (let [major (parse-long major)
              minor (or (some-> minor parse-long) 0)]
          (case family
            "opus"   (or (> major 4) (and (= major 4) (>= minor 7)))
            "sonnet" (>= major 5))))))

(defn- model-supports-temperature?
  "Whether an OpenRouter model id accepts an explicit `temperature`. Two families reject it: OpenAI's
  GPT-5 and o-series, and current-generation Claude. Neither `openai.clj`'s nor `claude.clj`'s
  predicate can be reused — both are keyed to their own provider's id shape, and would silently
  return true for OpenRouter's `vendor/model` ids with dotted versions."
  [model]
  (let [model (str model)]
    (not (or (str/starts-with? model "openai/gpt-5")
             (re-find #"^openai/o\d" model)
             (anthropic-current-gen? model)))))

(def ^:private required-tool-choice-unsupported-models
  "Models that don't support `:tool_choice \"required\"`"
  #{"qwen/qwen3.8-max"})

(defn- supports-required-tool-choice?
  "Whether `model` accepts `:tool_choice \"required\"`."
  [model]
  (not (contains? required-tool-choice-unsupported-models model)))

(defn- required-tool-choice->auto
  "Downgrade `:tool_choice \"required\"` to `\"auto\"`."
  [req]
  (cond-> req
    (= "required" (:tool_choice req)) (assoc :tool_choice "auto")))

(mu/defn openrouter-request-body
  "Build the Chat Completions request body for an LLM request.

  Delegates to the shared [[chat-completions/request-body]]. Anthropic models get explicit prompt-cache breakpoints
  [[claude/system->cached-content-blocks]].  OpenRouter doesn't document `cache_control` on tool definitions, so
  unlike claude.clj we don't put a separate breakpoint there.

  Other models (OpenAI) keep the generic plain string system message: OpenAI prompt caching is automatic server-side
  and takes no request markup.

  `:temperature` is dropped for models that reject it (see [[model-supports-temperature?]]). Gating it in the shared
  builder instead would apply these OpenRouter-specific rules to every Chat Completions adapter, including vLLM,
  whose model names are customer-chosen free text."
  [{:keys [model system] :as opts
    :or   {model "anthropic/claude-haiku-4.5"}} :- core/LLMRequestOpts]
  (cond-> (chat-completions/request-body (assoc opts :model model))
    (and system (anthropic-model? model))
    (update-in [:messages 0 :content] claude/system->cached-content-blocks)

    (not (model-supports-temperature? model))
    (dissoc :temperature)

    (not (supports-required-tool-choice? model))
    required-tool-choice->auto))

(mu/defn openrouter-raw
  "Perform a streaming request to the Chat Completions API.

  Works with OpenRouter, or any OpenAI-compatible endpoint that supports
  `/v1/chat/completions` (e.g. vLLM, Ollama, Together, etc.).
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing.
  `:ai-proxy?` is not supported for OpenRouter and throws when true."
  [{:keys [model tools credentials ai-proxy?] :as opts
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
        (let [api-key  (not-empty (:api-key credentials))
              auth     (core/resolve-auth "openrouter" "OpenRouter"
                                          (when api-key
                                            {:url     (:base-url credentials)
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
          ;; The SSE body is consumed lazily, after this `try` has exited — wrap
          ;; the reducible so mid-stream IO/timeout failures get the same
          ;; provider-friendly translation as request-time errors.
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "openrouter"
                                     :model    model
                                     :url      "/v1/chat/completions"
                                     :request  req})
              (core/reducible-with-api-errors "openrouter" openrouter-error-msg)))
        (catch Exception e
          (core/rethrow-api-error! "openrouter" openrouter-error-msg e))))))

(defn openrouter
  "Call OpenRouter Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply openrouter-raw args)]
    (eduction (openrouter->aisdk-chunks-xf) raw)))
