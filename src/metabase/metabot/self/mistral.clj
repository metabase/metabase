(ns metabase.metabot.self.mistral
  "Mistral / Chat Completions adapter.

  Mistral exposes an OpenAI-compatible Chat Completions API.

  https://docs.mistral.ai/api/"
  (:require
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private default-model "mistral-medium-3-5")

(def ^:private provider
  (adapter/provider
   {:slug         "mistral"
    :display-name "Mistral"
    :errors       {401 #(tru "Mistral API key expired or invalid")
                   404 #(tru "Mistral API endpoint was not found — check the base URL")
                   429 #(tru "Mistral has rate limited us")
                   500 #(tru "Mistral returned an internal server error")}}))

(def supported-models
  "Mistral models offered in the Metabot model picker, keyed by model id.
  `list-models` returns the intersection of this map with the `/models` catalog."
  {"mistral-medium-3-5" {:display-name "Mistral Medium 3.5" :context-window 262144}})

(defn context-window-tokens
  "The input context window for `model`, or nil when it isn't one we know.
  Catalog aliases (e.g. `mistral-medium-latest`) are not resolved."
  [model]
  (get-in supported-models [model :context-window]))

(defn- whitelisted-id
  "The [[supported-models]] id a `/models` catalog entry resolves to, or nil when unsupported.
  Mistral models have a generic `:id` like `mistral-medium-latest` but `:aliases` contains version specific aliases
  like `mistral-medium-3-5` or `mistral-medium-2604`, so a whitelisted id is matched against the entry's own id and
  its aliases."
  [{:keys [id aliases]}]
  (some #(when (contains? supported-models %) %)
        (cons id aliases)))

(defn list-models
  "List the Mistral models supported by this adapter (see [[supported-models]]).

  Resolves catalog aliases rather than intersecting ids directly (see [[whitelisted-id]]), so this does not use
  the shared [[adapter/listing]].
  `:ai-proxy?` is not supported for Mistral and throws when true."
  ([] (list-models {}))
  ([opts]
   {:models (->> (adapter/fetch-catalog provider opts)
                 (keep whitelisted-id)
                 distinct
                 sort
                 (mapv (fn [id]
                         {:id id :display_name (get-in supported-models [id :display-name])})))}))

(mu/defn mistral-request-body
  "Build the Chat Completions request body for an LLM request.

  Mistral's Chat Completions dialect matches what [[chat-completions/request-body]] emits, except:

  - Mistral's strict request validation 422s (`Extra inputs are not permitted`) on `stream_options`; it is dropped
    here, and Mistral reports usage on the final streamed chunk without it.
  - Prompt caching is opt-in per request via `prompt_cache_key` (cache reads bill at 10% of the input price), so a
    `:prompt-cache-key` — the conversation id — is forwarded when present."
  [{:keys [model prompt-cache-key] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (-> (chat-completions/request-body (assoc opts :model model))
      (dissoc :stream_options)
      (cond-> prompt-cache-key (assoc :prompt_cache_key prompt-cache-key))))

(mu/defn mistral-raw
  "Perform a streaming request to the Mistral Chat Completions API.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing.
  `:ai-proxy?` is not supported for Mistral and throws when true."
  [{:keys [model] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (let [opts (assoc opts :model model)]
    (adapter/stream! provider opts
                     {:path "/chat/completions"
                      :body (mistral-request-body opts)})))

(def ^:private stop-reasons
  "Mistral adds `model_length` — the model's own context limit, a truncation just like `length` — and reports a
  mid-generation failure as a finish reason instead of an error event."
  (assoc chat-completions/stop-reasons
         "model_length" "length"
         "error"        "error"))

(defn mistral->aisdk-chunks-xf
  "Translates Mistral Chat Completions streaming chunks into AI SDK v5 protocol chunks."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf stop-reasons))

(defn mistral
  "Call the Mistral Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply mistral-raw args)]
    (eduction (mistral->aisdk-chunks-xf) raw)))
