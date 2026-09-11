(ns metabase.metabot.self.openrouter
  "OpenRouter / Chat Completions adapter.

  OpenRouter exposes an OpenAI-compatible Chat Completions API (`/v1/chat/completions`)
  which is different from the newer OpenAI Responses API (`/v1/responses`) that our
  `openai.clj` adapter speaks.

  The agent loop produces AISDK parts as its canonical message format. This
  adapter converts those directly to Chat Completions messages."
  (:require
   [clojure.string :as str]
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private default-model "anthropic/claude-haiku-4.5")

(def ^:private provider
  (adapter/provider
   {:slug         "openrouter"
    :display-name "OpenRouter"
    ;; attribution headers OpenRouter shows on the account's activity page
    :headers      {"HTTP-Referer" "https://metabase.com"
                   "X-Title"      "Metabase"}
    :errors       {401 #(tru "OpenRouter API key expired or invalid")
                   402 #(tru "OpenRouter has insufficient credits")
                   403 #(tru "OpenRouter API key has insufficient permissions")
                   404 #(tru "OpenRouter model listing endpoint is unavailable")
                   429 #(tru "OpenRouter has rate limited us")
                   500 #(tru "OpenRouter returned an internal server error")
                   502 #(tru "OpenRouter upstream provider returned an error")
                   503 #(tru "OpenRouter service is unavailable")}}))

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
  the direct openai adapter.

  `:reasoning` classifies what each model streams back, probed live against OpenRouter on
  2026-08-31 (all 26 models) and cross-checked with the `reasoning` metadata in
  `GET /v1/models` (https://openrouter.ai/docs/use-cases/reasoning-tokens):
  `:renderable` streams reasoning text under an explicit `reasoning {:enabled true}`;
  `:renderable-default` streams reasoning summaries under the server default but must receive
  NO directive — an explicit enable verifiably suppresses gpt-5.6's reasoning entirely;
  `:budget-only` (`supported_efforts` nil in the catalog) silently ignores the unified enable
  and would need an explicit token budget.
  `:reasoning-mandatory?` marks models where `reasoning {:enabled false}` is rejected with a 400."
  {"anthropic/claude-fable-5"        {:display-name "Claude Fable 5"          :context-window 1000000 :reasoning :renderable :reasoning-mandatory? true}
   "anthropic/claude-opus-5"         {:display-name "Claude Opus 5"           :context-window 1000000 :reasoning :renderable}
   "anthropic/claude-opus-4.8"       {:display-name "Claude Opus 4.8"         :context-window 1000000 :reasoning :renderable}
   "anthropic/claude-opus-4.7"       {:display-name "Claude Opus 4.7"         :context-window 1000000 :reasoning :renderable}
   "anthropic/claude-opus-4.6"       {:display-name "Claude Opus 4.6"         :context-window 1000000 :reasoning :renderable}
   "anthropic/claude-opus-4.5"       {:display-name "Claude Opus 4.5"         :context-window  200000 :reasoning :budget-only}
   "anthropic/claude-opus-4.1"       {:display-name "Claude Opus 4.1"         :context-window  200000 :reasoning :budget-only}
   "anthropic/claude-sonnet-5"       {:display-name "Claude Sonnet 5"         :context-window 1000000 :reasoning :renderable}
   "anthropic/claude-sonnet-4.6"     {:display-name "Claude Sonnet 4.6"       :context-window 1000000 :reasoning :renderable}
   "anthropic/claude-sonnet-4.5"     {:display-name "Claude Sonnet 4.5"       :context-window 1000000 :reasoning :budget-only}
   "anthropic/claude-haiku-4.5"      {:display-name "Claude Haiku 4.5"        :context-window  200000 :reasoning :budget-only}
   "deepseek/deepseek-v4-pro"        {:display-name "DeepSeek V4 Pro 0423"    :context-window 1048576 :reasoning :renderable}
   "deepseek/deepseek-v4-pro-0813"   {:display-name "DeepSeek V4 Pro 0813"    :context-window 1048575 :reasoning :renderable}
   "deepseek/deepseek-v4-flash-0731" {:display-name "DeepSeek V4 Flash 0731"  :context-window 1048576 :reasoning :renderable}
   "mistralai/mistral-medium-3-5"    {:display-name "Mistral Medium 3.5"      :context-window  262144 :reasoning :renderable}
   ;; probed 2026-09-08: OpenRouter honors `reasoning {:enabled false}` for kimi-k3 even though the
   ;; native Moonshot API cannot turn k3's thinking off — a title-shaped forced tool call under the
   ;; disable reports 0 reasoning_tokens in usage and completes within 48 completion tokens, so the
   ;; structured path needs neither a low effort nor the mandatory max_tokens floor
   "moonshotai/kimi-k3"              {:display-name "Kimi K3"                 :context-window 1048576 :reasoning :renderable}
   "openai/gpt-5.6-sol"              {:display-name "GPT-5.6 Sol"             :context-window  922000 :reasoning :renderable-default}
   "openai/gpt-5.6-terra"            {:display-name "GPT-5.6 Terra"           :context-window  922000 :reasoning :renderable-default}
   "openai/gpt-5.6-luna"             {:display-name "GPT-5.6 Luna"            :context-window  922000 :reasoning :renderable-default}
   "openai/gpt-5.5"                  {:display-name "GPT-5.5"                 :context-window  922000 :reasoning :renderable-default}
   "openai/gpt-5.5-pro"              {:display-name "GPT-5.5 Pro"             :context-window  922000 :reasoning :renderable-default :reasoning-mandatory? true}
   ;; re-probed 2026-09-04 (classed :encrypted-only on 2026-08-31): under the explicit enable
   ;; both stream `reasoning.summary` text through the shared xf (~100 deltas on a hard prompt)
   ;; and accept the disable; without a directive OpenAI's default is no reasoning at all —
   ;; 0 reasoning tokens, and the mini answered the probe wrong
   "openai/gpt-5.4"                  {:display-name "GPT-5.4"                 :context-window  922000 :reasoning :renderable}
   "openai/gpt-5.4-mini"             {:display-name "GPT-5.4 Mini"            :context-window  272000 :reasoning :renderable}
   "openai/gpt-5.4-pro"              {:display-name "GPT-5.4 Pro"             :context-window  922000 :reasoning :renderable-default :reasoning-mandatory? true}
   "qwen/qwen3.8-max"                {:display-name "Qwen3.8 Max"             :context-window 1000000 :reasoning :renderable :reasoning-mandatory? true}
   ;; probed 2026-09-04 (post-dating the 2026-08-31 run): the enable streams reasoning, the
   ;; disable is rejected with a 400 (thinking-only upstream, as on native z.ai), and a forced
   ;; tool call at the floored budget completes
   "z-ai/glm-5.3"                    {:display-name "GLM-5.3"                 :context-window 1048576 :reasoning :renderable :reasoning-mandatory? true}
   "z-ai/glm-5.2"                    {:display-name "GLM-5.2"                 :context-window 1048576 :reasoning :renderable}})

(defn context-window-tokens
  "The input context window for `model`, or nil when it isn't one we know."
  [model]
  (get-in supported-models [model :context-window]))

(defn- reasoning-class
  "The `:reasoning` class [[supported-models]] records for `model`, or nil."
  [model]
  (get-in supported-models [(str model) :reasoning]))

(defn reasoning-model?
  "Whether `model` streams renderable reasoning back to us through OpenRouter.

  True for the `:renderable` and `:renderable-default` classes (see [[supported-models]]).
  Excluded: the budget-only Claudes, which silently ignore the unified enable
  (https://openrouter.ai/docs/use-cases/reasoning-tokens)."
  [model]
  (contains? #{:renderable :renderable-default} (reasoning-class model)))

(defn streams-reasoning?
  "Registry capability. OpenRouter answers from the model name."
  [{:keys [model]}]
  (reasoning-model? model))

(defn- reasoning-mandatory?
  "Whether OpenRouter rejects `reasoning {:enabled false}` for `model` with a 400.

  Probed live; the catalog's `mandatory` flag documents the same restriction:
  https://openrouter.ai/docs/use-cases/reasoning-tokens."
  [model]
  (boolean (get-in supported-models [(str model) :reasoning-mandatory?])))

(defn list-models
  "List the OpenRouter models supported by this adapter (see [[supported-models]]).
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request,
  and throws when they are missing.
  `:ai-proxy?` is not supported for OpenRouter and throws when true."
  ([] (list-models {}))
  ([opts]
   (adapter/listing supported-models
                    (adapter/fetch-catalog provider opts "/v1/models")
                    :name)))

;;; Streaming response → AISDK v5 chunks

(def ^:private stop-reasons
  "OpenRouter normalizes each upstream model's reason into the Chat Completions set (the raw value stays in
  `native_finish_reason`), and adds `error` for a mid-generation upstream failure."
  (assoc chat-completions/stop-reasons "error" "error"))

(defn openrouter->aisdk-chunks-xf
  "Translates Chat Completions streaming chunks into AI SDK v5 protocol chunks.

  OpenRouter streams the generic Chat Completions dialect; see
  [[chat-completions/chat-completions->aisdk-chunks-xf]]. Reasoning arrives as a flat
  `delta.reasoning` string (verified identical to the concatenation of the structured
  `reasoning_details` text blocks) and is forwarded as reasoning chunks. A delta carrying both
  `reasoning` and non-empty `content` would drop its reasoning — the shared xf classifies
  content first; accepted, unprobed risk, no such chunk observed. Display-only: the
  structured `reasoning_details` (signatures included) are not captured, so tool rounds
  re-derive their reasoning rather than continuing it — extending that would touch both this
  xf and the dialect-level replay; see the \"Preserving Reasoning\" section of
  https://openrouter.ai/docs/use-cases/reasoning-tokens."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf stop-reasons {:forward-reasoning? true}))

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

(def ^:private forced-tool-call-token-floor
  "Smallest `max_tokens` a forced tool call on a mandatory-reasoning model may be capped at.

  A safety net: in theory the un-disableable reasoning bills against the same `max_tokens` budget as the tool call
  (\"max_tokens must be strictly higher than the reasoning budget\" —
  https://openrouter.ai/docs/use-cases/reasoning-tokens), so a small caller cap (the conversation-title path sends
  512) could hit `length` before the mandatory tool call is emitted. In practice this has not been observed: probed
  2026-09-03, qwen3.8-max reasons only ~150 tokens on title-shaped structured calls and fits the 512 cap, and
  claude-fable-5 emits zero reasoning under a forced tool choice; probed 2026-09-08, gpt-5.4-pro and gpt-5.5-pro
  finish the same calls at the 512 cap with the tool call (242–375 and 22 completion tokens across runs). The floor
  guards against a model update or a longer-thinking mandatory model changing that. Matches vLLM's probe-proven
  floor."
  2048)

(defn- with-reasoning-directive
  "Add OpenRouter's unified `reasoning` directive to a built request `body`.

  `:renderable`-class models get an explicit enable, or an explicit disable for structured
  output and forced tool calls — probed live: forced tool choice yields zero reasoning tokens on
  Anthropic upstreams even when enabled, so the disable mirrors what actually happens
  (https://openrouter.ai/docs/use-cases/reasoning-tokens). Mandatory-reasoning models reject the
  disable with a 400 and get no directive instead. `:renderable-default` models (the gpt-5.5/5.6
  family) never get one either way — they stream summaries under the server default, and an
  explicit enable verifiably suppresses gpt-5.6's reasoning entirely. Other models never get
  one: the server default rules, and the gate answers false. Independently of the class, a
  mandatory-reasoning model's forced tool calls get a `max_tokens` floor (see
  [[forced-tool-call-token-floor]]) — gpt-5.5-pro and gpt-5.4-pro are mandatory but
  `:renderable-default`, so the floor cannot live inside the `:renderable` branch. Reads the
  body's own `:tool_choice` so it sees the [[required-tool-choice->auto]] downgrade, not the
  incoming opts."
  [body {:keys [model reasoning? schema] :or {reasoning? true}}]
  (let [forced? (or (some? schema) (= "required" (:tool_choice body)))
        ;; Safety net: the mandatory tool call must survive the un-disableable thinking spend
        ;; (theory vs practice in [[forced-tool-call-token-floor]]); only an existing cap is
        ;; raised, and only where a tool call is actually forced.
        body    (cond-> body
                  (and (reasoning-mandatory? model) forced? (:max_tokens body))
                  (update :max_tokens max forced-tool-call-token-floor))]
    (if-not (= :renderable (reasoning-class model))
      body
      (let [thinking? (and reasoning? (not forced?))]
        (cond
          thinking?                    (cond-> (assoc body :reasoning {:enabled true})
                                         ;; Anthropic rejects an explicit temperature while
                                         ;; thinking (same interlock as claude.clj); sonnet-4.6
                                         ;; and opus-4.6 keep :temperature past
                                         ;; [[model-supports-temperature?]], so drop it here
                                         (anthropic-model? model) (dissoc :temperature))
          (reasoning-mandatory? model) body
          :else                        (assoc body :reasoning {:enabled false}))))))

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
    :or   {model default-model}} :- core/LLMRequestOpts]
  (-> (cond-> (chat-completions/request-body (assoc opts :model model))
        (and system (anthropic-model? model))
        (update-in [:messages 0 :content] claude/system->cached-content-blocks)

        (not (model-supports-temperature? model))
        (dissoc :temperature)

        (not (supports-required-tool-choice? model))
        required-tool-choice->auto)
      (with-reasoning-directive (assoc opts :model model))))

(mu/defn openrouter-raw
  "Perform a streaming request to the Chat Completions API.

  Works with OpenRouter, or any OpenAI-compatible endpoint that supports
  `/v1/chat/completions` (e.g. vLLM, Ollama, Together, etc.).
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing.
  `:ai-proxy?` is not supported for OpenRouter and throws when true."
  [{:keys [model] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (let [opts (assoc opts :model model)]
    (adapter/stream! provider opts
                     {:path "/v1/chat/completions"
                      :body (openrouter-request-body opts)})))

(defn openrouter
  "Call OpenRouter Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply openrouter-raw args)]
    (eduction (openrouter->aisdk-chunks-xf) raw)))
