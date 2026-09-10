(ns metabase.metabot.self.moonshot
  "Moonshot AI (Kimi) / Chat Completions adapter.

  Moonshot exposes an OpenAI-compatible Chat Completions API.

  https://platform.kimi.ai/docs"
  (:require
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private default-model "kimi-k3")

(def ^:private provider
  "Mapping 400 only improves the message text: `metabase.metabot.api`'s `provider-client-error?` renders any 4xx
  `:api-error` under the admin API-key field, so a generic message sends admins hunting a key problem that does not
  exist. 429 covers rate limiting *and* an exhausted account balance, which Moonshot reports with the same status."
  (adapter/provider
   {:slug         "moonshot"
    :display-name "Moonshot"
    :errors       {400 #(tru "Moonshot rejected the request — check the model and request parameters")
                   401 #(tru "Moonshot API key expired or invalid")
                   403 #(tru "Moonshot denied access — check the API key''s permissions")
                   404 #(tru "Moonshot API endpoint or model was not found — check the base URL and model")
                   429 #(tru "Moonshot has rate limited us, or the account balance is exhausted")
                   500 #(tru "Moonshot returned an internal server error")}}))

(def supported-models
  "Moonshot models offered in the Metabot model picker, keyed by model id.
  `list-models` returns the intersection of this map with the `/models` catalog.

  The `kimi-k2.7-code` models the catalog also carries are coding models, not agent models, and are excluded."
  {"kimi-k2.6" {:display-name "Kimi K2.6" :context-window 262144}
   "kimi-k3"   {:display-name "Kimi K3"   :context-window 1048576}})

(def context-window-tokens
  "The input context window for `model`, or nil when it isn't one we know."
  (adapter/context-window-fn supported-models))

(def ^:private thinking-only-models
  "Models whose catalog entry reports `supports_thinking_type: \"only\"`: thinking cannot be turned off, so sending
  `thinking {:type \"disabled\"}` is rejected. k3 does not need it — it accepts `tool_choice \"required\"` with
  thinking on, unlike k2.6."
  #{"kimi-k3"})

(defn list-models
  "List the Moonshot models supported by this adapter (see [[supported-models]]).

  The `/models` catalog it intersects doubles as the credential round-trip behind the admin Connect button —
  it 401s on a bad key. Display names come from [[supported-models]] rather than the catalog: Moonshot catalog
  entries carry no `:name` (and no `:aliases`, so there is no Mistral-style alias resolution to do either).
  `:ai-proxy?` is not supported for Moonshot and throws when true."
  ([] (list-models {}))
  ([opts]
   (adapter/listing supported-models (adapter/fetch-catalog provider opts))))

(mu/defn moonshot-request-body
  "Build the Chat Completions request body for an LLM request.

  Moonshot's Chat Completions dialect matches what [[chat-completions/request-body]] emits — including
  `stream_options`, unlike Mistral — except:

  - **No `temperature`.** Moonshot 400s on any value but the one its thinking mode allows (0.6 off, 1.0 on), so
    there is no safe value to pass and it is dropped unconditionally.
  - **`thinking {:type \"disabled\"}`.** Thinking is on by default on every Kimi model, and `tool_choice
    \"required\"` — which the structured-output path and the `:sql` and `:document-generate-content` profiles all
    depend on — is rejected while it is on. We drop `reasoning_content` anyway, so thinking is pure cost
    (~12x the completion tokens for the same conversation title). [[thinking-only-models]] cannot disable it and
    does not need to, so they are sent no `thinking` at all and the model default applies.
  - **`prompt_cache_key`.** Moonshot caching is automatic and hits without it, but a `:prompt-cache-key` — the
    conversation id — is forwarded when present."
  [{:keys [model prompt-cache-key] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (-> (chat-completions/request-body (assoc opts :model model))
      (dissoc :temperature)
      (cond-> (not (thinking-only-models model)) (assoc :thinking {:type "disabled"})
              prompt-cache-key                   (assoc :prompt_cache_key prompt-cache-key))))

(mu/defn moonshot-raw
  "Perform a streaming request to the Moonshot Chat Completions API.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing.
  `:ai-proxy?` is not supported for Moonshot and throws when true."
  [{:keys [model] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (let [opts (assoc opts :model model)]
    (adapter/stream! provider opts
                     {:path "/chat/completions"
                      :body (moonshot-request-body opts)})))

(defn moonshot->aisdk-chunks-xf
  "Translates Moonshot Chat Completions streaming chunks into AI SDK v5 protocol chunks."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf))

(defn moonshot
  "Call the Moonshot Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply moonshot-raw args)]
    (eduction (moonshot->aisdk-chunks-xf) raw)))
