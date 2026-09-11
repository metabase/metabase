(ns metabase.metabot.self.zai
  "Z.AI (GLM) / Chat Completions adapter.

  Z.AI exposes an OpenAI-compatible Chat Completions API.

  https://docs.z.ai/api-reference/llm/chat-completion"
  (:require
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private default-model "glm-5.2")

(def ^:private provider
  (adapter/provider
   {:slug         "zai"
    :display-name "Z.AI"
    :errors       {401 #(tru "Z.AI API key expired or invalid")
                   404 #(tru "Z.AI API endpoint was not found — check the base URL")
                   429 #(tru "Z.AI has rate limited us")
                   500 #(tru "Z.AI returned an internal server error")}}))

(def supported-models
  "Z.AI models offered in the Metabot model picker, keyed by model id.
  `list-models` returns the intersection of this map with the `/models` catalog.

  `:thinking-only?` marks a model that rejects `thinking {:type \"disabled\"}` — see
  [[thinking-only-model?]]."
  {"glm-5.3" {:display-name "GLM-5.3" :context-window 1048576 :thinking-only? true}
   "glm-5.2" {:display-name "GLM-5.2" :context-window 1048576}})

(defn context-window-tokens
  "The input context window for `model`, or nil when it isn't one we know."
  [model]
  (get-in supported-models [model :context-window]))

(defn reasoning-model?
  "Whether `model` streams reasoning back to us.

  True only for the whitelisted GLM models, which think by default — thinking defaults to enabled
  server-side (https://docs.z.ai/api-reference/llm/chat-completion)."
  [model]
  (contains? supported-models (str model)))

(defn streams-reasoning?
  "Registry capability. Z.AI answers from the model name."
  [{:keys [model]}]
  (reasoning-model? model))

(defn- thinking-only-model?
  "Whether `model` rejects `thinking {:type \"disabled\"}` outright.

  Z.AI answers error 1210 \"always engages in thinking\" for these and takes `reasoning_effort`
  low|high|max instead (https://docs.z.ai/api-reference/llm/chat-completion, probed on glm-5.3
  2026-09-03). Reading the flag off a [[supported-models]] row keeps it from ever disagreeing with
  [[reasoning-model?]]: a model can only be thinking-only if we serve it."
  [model]
  (boolean (get-in supported-models [(str model) :thinking-only?])))

(defn list-models
  "List the Z.AI models supported by this adapter (see [[supported-models]]).

  The `/models` catalog it intersects is OpenAI-compatible but undocumented; it doubles as the credential
  round-trip behind the admin Connect button (auth is checked before routing, so a 2xx proves the key and
  base URL reach an authenticated surface).
  `:ai-proxy?` is not supported for Z.AI and throws when true."
  ([] (list-models {}))
  ([opts]
   (adapter/listing supported-models (adapter/fetch-catalog provider opts) :name)))

(def ^:private forced-tool-call-token-floor
  "Smallest `max_tokens` a forced tool call on a thinking-only model may be capped at.

  glm-5.3 cannot stop thinking, and its thinking and tool call draw on one `max_tokens` budget — undocumented by
  Z.AI, but probed 2026-09-08: a title-shaped structured call capped at 16 finished `length` on reasoning alone, with
  no tool call. A small caller cap (the conversation-title path sends 512) therefore risks a `length` finish before
  the tool call is emitted. At effort max the same calls spent 102–173 completion tokens, so 512 holds today but
  leaves no margin for longer session content. Same floor as Moonshot (which documents the shared budget for
  kimi-k3, https://platform.kimi.ai/docs/guide/use-thinking-models), vLLM and Google."
  2048)

(mu/defn zai-request-body
  "Build the Chat Completions request body for an LLM request.

  Z.AI's Chat Completions dialect matches what [[chat-completions/request-body]] emits, so this delegates to it,
  adding Z.AI's `thinking` directive: enabled only where a whitelisted model's reasoning renders, disabled
  otherwise. A [[thinking-only-model?]] rejects the directive and gets `reasoning_effort` instead — \"max\"
  where reasoning renders, \"low\" otherwise — plus a `max_tokens` floor on forced tool calls (see
  [[forced-tool-call-token-floor]]). Z.AI documents only `tool_choice \"auto\"`, but `\"required\"` — which the
  structured-output path relies on — is accepted and honored in practice, with thinking on."
  [{:keys [model reasoning? schema tool_choice] :as opts
    :or   {model default-model reasoning? true}} :- core/LLMRequestOpts]
  ;; Thinking is on by default server-side, at reasoning_effort "max"
  ;; (https://docs.z.ai/api-reference/llm/chat-completion), so "enabled" only makes the default
  ;; explicit; "disabled" is the real change — it protects structured output's small budget (see
  ;; [[metabase.metabot.conversation-title]]'s title-max-tokens) and, off the whitelist, keeps the
  ;; stream matching the settings gate answering false: glm-4.7 "will think compulsorily" by
  ;; default and the xf forwards reasoning unconditionally. Probed 2026-09-03: the disable is
  ;; accepted and honored on glm-4.7, tolerated by pre-4.5 models (which do not think), and
  ;; rejected only by a [[thinking-only-model?]]. Those take `reasoning_effort` low|high|max only
  ;; (same docs page), so "low" is a best-effort floor on their spend, not an off switch — the
  ;; docs say thinking cannot be turned off, though probed 2026-09-08 a title-shaped call at "low"
  ;; streamed no reasoning at all (16 completion tokens, the tool call only) against 102–173 at "max".
  (let [thinking-only? (thinking-only-model? model)
        forced?        (or (some? schema) (= "required" (some-> tool_choice name)))
        thinking?      (and (reasoning-model? model) reasoning? (not schema))
        body           (chat-completions/request-body (assoc opts :model model))]
    (cond-> body
      thinking-only?
      (assoc :reasoning_effort (if thinking? "max" "low"))

      (and thinking-only? forced? (:max_tokens body))
      (update :max_tokens max forced-tool-call-token-floor)

      (not thinking-only?)
      (assoc :thinking {:type (if thinking? "enabled" "disabled")}))))

(mu/defn zai-raw
  "Perform a streaming request to the Z.AI Chat Completions API.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing.
  `:ai-proxy?` is not supported for Z.AI and throws when true."
  [{:keys [model] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (let [opts (assoc opts :model model)]
    (adapter/stream! provider opts
                     {:path "/chat/completions"
                      :body (zai-request-body opts)})))

(def ^:private stop-reasons
  "Z.AI signals a filtered response with `sensitive` rather than OpenAI's `content_filter`, and reports an upstream
  failure as a finish reason instead of an error event."
  (assoc chat-completions/stop-reasons
         "sensitive"     "content-filter"
         "network_error" "error"))

(defn zai->aisdk-chunks-xf
  "Translates Z.AI Chat Completions streaming chunks into AI SDK v5 protocol chunks.

  Thinking arrives as `delta.reasoning_content` and is forwarded as reasoning chunks. A delta
  carrying both `reasoning_content` and non-empty `content` would drop its reasoning — the
  shared xf classifies content first. Accepted, unprobed risk: no such chunk has been observed."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf stop-reasons {:forward-reasoning? true}))

(defn zai
  "Call the Z.AI Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply zai-raw args)]
    (eduction (zai->aisdk-chunks-xf) raw)))
