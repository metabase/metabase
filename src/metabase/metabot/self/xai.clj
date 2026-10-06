(ns metabase.metabot.self.xai
  "xAI (Grok) / Chat Completions adapter.

  xAI exposes an OpenAI-compatible Chat Completions API.

  https://docs.x.ai/developers/rest-api-reference/inference/chat-completions"
  (:require
   [clojure.set :as set]
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private default-model "grok-4.7")

(def ^:private provider
  (adapter/provider
   {:slug           "xai"
    :display-name   "xAI"
    :error-fallback #(tru "xAI API error (HTTP {0})" %)
    :errors         {401 #(tru "xAI API key expired or invalid")
                     403 #(tru "xAI API key lacks permission, or the team is out of credits")
                     404 #(tru "xAI API endpoint or model was not found")
                     429 #(tru "xAI has rate limited us")
                     500 #(tru "xAI returned an internal server error")}}))

(def supported-models
  "xAI models offered in the Metabot model picker, keyed by model id.
  `list-models` returns the intersection of this map with the `/models` catalog.

  `:lowest-effort` is the lowest `reasoning_effort` the model accepts, `none` where reasoning can be turned off."
  {"grok-4.3" {:display-name "Grok 4.3" :context-window 1000000 :lowest-effort "none"}
   "grok-4.7" {:display-name "Grok 4.7" :context-window 500000 :lowest-effort "low"}})

(mu/defn context-window-tokens :- [:maybe :int]
  "The input context window for `model`, or nil when it isn't one we know."
  [model :- [:maybe :string]]
  (get-in supported-models [model :context-window]))

(mu/defn streams-reasoning? :- :boolean
  "Registry capability. Every xAI model we offer streams summaries of its reasoning as `delta.reasoning_content`."
  [{:keys [model]} :- adapter/ResolvedRef]
  (contains? supported-models model))

(mu/defn list-models :- adapter/ModelListing
  "List the xAI models supported by this adapter (see [[supported-models]]).

  The `/models` catalog it intersects doubles as the credential round trip behind the admin Connect button. Its
  entries carry no display name, so the names come from [[supported-models]].
  `:ai-proxy?` is not supported for xAI and throws when true."
  ([] (list-models {}))
  ([opts :- adapter/ListOpts]
   (adapter/model-listing supported-models (adapter/fetch-catalog provider opts))))

(mu/defn xai-request-body
  "Build the Chat Completions request body for an LLM request.

  xAI's dialect matches what [[chat-completions/request-body]] emits, except:

  - The output cap is sent as `max_completion_tokens`, since xAI deprecates `max_tokens`. It caps visible output
    only, not reasoning or tool calls, so a small cap cannot cut off a forced tool call.
  - The structured path, and a caller opting out of reasoning, get the model's `:lowest-effort` from
    [[supported-models]], which turns reasoning off on Grok 4.3 and lowers it to `low` on Grok 4.7. Chat keeps each
    model's default. Models off the allow-list get no effort at all, since some of them (Grok 4.20) reject the
    parameter.
  - A `:prompt-cache-key`, the conversation id, is forwarded as `prompt_cache_key`, which routes a conversation's
    requests to the same server so its prompt cache hits."
  [{:keys [model prompt-cache-key reasoning? schema] :as opts
    :or   {model default-model reasoning? true}} :- core/LLMRequestOpts]
  (let [lowest-effort (get-in supported-models [model :lowest-effort])]
    (-> (chat-completions/request-body (assoc opts :model model))
        (set/rename-keys {:max_tokens :max_completion_tokens})
        (cond-> (and lowest-effort (or (some? schema) (not reasoning?)))
          (assoc :reasoning_effort lowest-effort)

          prompt-cache-key
          (assoc :prompt_cache_key prompt-cache-key)))))

(mu/defn xai-raw
  "Perform a streaming request to the xAI Chat Completions API.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing.
  `:ai-proxy?` is not supported for xAI and throws when true."
  [{:keys [model] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (let [opts (assoc opts :model model)]
    (adapter/stream! provider opts
                     {:path "/chat/completions"
                      :body (xai-request-body opts)})))

(defn xai->aisdk-chunks-xf
  "Translates xAI Chat Completions streaming chunks into AI SDK v5 protocol chunks.

  Reasoning summaries arrive as `delta.reasoning_content` and are forwarded as reasoning chunks."
  []
  (comp (map chat-completions/count-reasoning-as-output)
        (chat-completions/chat-completions->aisdk-chunks-xf chat-completions/stop-reasons
                                                            {:forward-reasoning? true})))

(defn xai
  "Call the xAI Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply xai-raw args)]
    (eduction (xai->aisdk-chunks-xf) (chat-completions/usage-once raw))))
