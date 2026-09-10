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
  `list-models` returns the intersection of this map with the `/models` catalog."
  {"glm-5.3" {:display-name "GLM-5.3" :context-window 1048576}
   "glm-5.2" {:display-name "GLM-5.2" :context-window 1048576}})

(defn context-window-tokens
  "The input context window for `model`, or nil when it isn't one we know."
  [model]
  (get-in supported-models [model :context-window]))

(defn list-models
  "List the Z.AI models supported by this adapter (see [[supported-models]]).

  The `/models` catalog it intersects is OpenAI-compatible but undocumented; it doubles as the credential
  round-trip behind the admin Connect button (auth is checked before routing, so a 2xx proves the key and
  base URL reach an authenticated surface).
  `:ai-proxy?` is not supported for Z.AI and throws when true."
  ([] (list-models {}))
  ([opts]
   (adapter/listing supported-models (adapter/fetch-catalog provider opts) true)))

(mu/defn zai-request-body
  "Build the Chat Completions request body for an LLM request.

  Z.AI's Chat Completions dialect matches what [[chat-completions/request-body]] emits, so this delegates to it. Z.AI
  documents only `tool_choice \"auto\"`, but `\"required\"` — which the structured-output path relies on — is accepted
  and honored in practice."
  [{:keys [model] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (chat-completions/request-body (assoc opts :model model)))

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
  "Translates Z.AI Chat Completions streaming chunks into AI SDK v5 protocol chunks."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf stop-reasons))

(defn zai
  "Call the Z.AI Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply zai-raw args)]
    (eduction (zai->aisdk-chunks-xf) raw)))
