(ns metabase.metabot.self.mistral
  "Mistral / Chat Completions adapter.

  Mistral exposes an OpenAI-compatible Chat Completions API.

  https://docs.mistral.ai/api/"
  (:require
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(def ^:private default-model "mistral-medium-3-5")

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for Mistral")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- mistral-error-msg
  "Canonical, status-specific Mistral error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      401 (tru "Mistral API key expired or invalid")
      404 (tru "Mistral API endpoint was not found — check the base URL")
      429 (tru "Mistral has rate limited us")
      500 (tru "Mistral returned an internal server error")
      (tru "Mistral API error (HTTP {0})" status))))

(def supported-models
  "Mistral models offered in the Metabot model picker, keyed by model id.
  `list-models` returns the intersection of this map with the `/models` catalog."
  {"mistral-medium-3-5" {:display-name "Mistral Medium 3.5" :context-window 262144}})

(defn context-window-tokens
  "The input context window for `model`, or nil when it isn't one we know.
  Catalog aliases (e.g. `mistral-medium-latest`) are not resolved."
  [model]
  (get-in supported-models [model :context-window]))

(defn reasoning-model?
  "Whether `model` streams thinking that our chain-of-thought UI renders.

  True exactly for the [[supported-models]] whitelist. Off-catalog models — including
  catalog aliases like `mistral-medium-latest`, which are not resolved, as with
  [[context-window-tokens]] — get no reasoning directive and the settings gate answers
  false for them; the server default sends no thinking either way."
  [model]
  (contains? supported-models (str model)))

(defn- whitelisted-id
  "The [[supported-models]] id a `/models` catalog entry resolves to, or nil when unsupported.
  Mistral models have a generic `:id` like `mistral-medium-latest` but `:aliases` contains version specific aliases
  like `mistral-medium-3-5` or `mistral-medium-2604`, so a whitelisted id is matched against the entry's own id and
  its aliases."
  [{:keys [id aliases]}]
  (some #(when (contains? supported-models %) %)
        (cons id aliases)))

(defn- list-all-models
  "Fetch the full Mistral model catalog (`GET /models`).
  A 2xx whose body isn't a recognizable catalog throws rather than yielding an empty picker — see
  [[chat-completions/models-catalog]].
  `:ai-proxy?` is not supported for Mistral and throws when true."
  [{:keys [credentials ai-proxy?]}]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (try
    (let [auth (core/resolve-auth "mistral" "Mistral"
                                  (when-let [k (not-empty (:api-key credentials))]
                                    {:url     (:base-url credentials)
                                     :headers {"Authorization" (str "Bearer " k)}})
                                  ai-proxy?)
          res  (core/request auth {:method  :get
                                   :url     "/models"
                                   :as      :json
                                   :headers {"Content-Type" "application/json"}})]
      (chat-completions/models-catalog "Mistral" res))
    (catch Exception e
      (core/rethrow-api-error! "mistral" mistral-error-msg e))))

(defn list-models
  "List the Mistral models supported by this adapter (see [[supported-models]]).
  `:ai-proxy?` is not supported for Mistral and throws when true."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (keep whitelisted-id)
                 distinct
                 sort
                 (mapv (fn [id]
                         {:id id :display_name (get-in supported-models [id :display-name])})))}))

(defn- think-message
  "The replayed assistant message for a coalesced in-turn :reasoning part.

  Mistral's reasoning docs instruct replaying think chunks with the assistant message —
  the \"Multi-turn conversations\" section of
  https://docs.mistral.ai/studio/conversations/reasoning: \"always replay the full assistant
  message (including ThinkChunk)\"; stripping them \"significantly degrades output quality\".
  The reconstructed chunk deliberately carries neither :closed — `closed false` is rejected
  on replay (error 3240; omission means closed) — nor the captured :signature: the model
  rejects any signature today (\"Signature is not supported for this model\", error 3051,
  probed 2026-09-01), so emission waits for Mistral to accept one; the capture side already
  delivers it in :provider-metadata when that day comes."
  [part]
  {:role    "assistant"
   :content [{:type "thinking" :thinking [{:type "text" :text (:text part)}]}]})

(mu/defn mistral-request-body
  "Build the Chat Completions request body for an LLM request.

  Mistral's Chat Completions dialect matches what [[chat-completions/request-body]] emits, except:

  - Mistral's strict request validation 422s (`Extra inputs are not permitted`) on `stream_options`; it is dropped
    here, and Mistral reports usage on the final streamed chunk without it.
  - Prompt caching is opt-in per request via `prompt_cache_key` (cache reads bill at 10% of the input price), so a
    `:prompt-cache-key` — the conversation id — is forwarded when present.
  - Whitelisted models get a `reasoning_effort` directive and replay their in-turn reasoning as think chunks
    (see [[think-message]])."
  [{:keys [model prompt-cache-key reasoning? schema] :as opts
    :or   {model default-model reasoning? true}} :- core/LLMRequestOpts]
  ;; mistral-medium-3-5 accepts exactly "high" and "none" — the server 400s the other four
  ;; enum values, enumerating these two (probed 2026-09-01) — and its server default sends NO
  ;; thinking, so "high" is what makes reasoning exist at all: net-new completion tokens on
  ;; every chat turn (a trivial prompt went from 4 to 247). "none" on the structured path is
  ;; forward-protection should the server default ever change, not a change to today's
  ;; behavior. https://docs.mistral.ai/studio/conversations/reasoning
  (let [whitelisted? (reasoning-model? model)
        ;; One binding gates both the "high" directive and the replay hook, so
        ;; they cannot desynchronize: with :reasoning? false or on the
        ;; structured path the hook is nil, which also strips :reasoning parts
        ;; from the replayed input, honoring the LLMRequestOpts contract.
        thinking?    (and whitelisted? reasoning? (not schema))]
    (-> (chat-completions/request-body
         (assoc opts :model model)
         (when thinking? {:reasoning-part->message think-message}))
        (dissoc :stream_options)
        (cond-> prompt-cache-key (assoc :prompt_cache_key prompt-cache-key)
                whitelisted?     (assoc :reasoning_effort (if thinking? "high" "none"))))))

(mu/defn mistral-raw
  "Perform a streaming request to the Mistral Chat Completions API.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing.
  `:ai-proxy?` is not supported for Mistral and throws when true."
  [{:keys [model tools credentials ai-proxy?] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [req (mistral-request-body (assoc opts :model model))]
    (log/debug "Mistral request" {:model model :msg-count (count (:messages req)) :tools (count (or tools []))})
    (with-span :info {:name       :metabot.mistral/request
                      :model      model
                      :msg-count  (count (:messages req))
                      :tool-count (count (or tools []))}
      (try
        (let [api-key  (not-empty (:api-key credentials))
              auth     (core/resolve-auth "mistral" "Mistral"
                                          (when api-key
                                            {:url     (:base-url credentials)
                                             :headers {"Authorization" (str "Bearer " api-key)}})
                                          ai-proxy?)
              response (core/request auth
                                     {:method  :post
                                      :url     "/chat/completions"
                                      :as      :stream
                                      :headers {"Content-Type" "application/json"}
                                      :body    (json/encode req)})]
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "mistral"
                                     :model    model
                                     :url      "/chat/completions"
                                     :request  req})))
        (catch Exception e
          (core/rethrow-api-error! "mistral" mistral-error-msg e))))))

(def ^:private stop-reasons
  "Mistral adds `model_length` — the model's own context limit, a truncation just like `length` — and reports a
  mid-generation failure as a finish reason instead of an error event."
  (assoc chat-completions/stop-reasons
         "model_length" "length"
         "error"        "error"))

(defn- flatten-content-chunks
  "Splits a chunked-content SSE event into the flat events the shared translation understands.

  With reasoning on, Mistral streams `delta.content` as a vector of typed chunks — thinking
  deltas, then one transition event carrying both the closing think chunk and the first text
  chunk, then plain strings (probed 2026-09-01; `:closed` rides most mid-stream think deltas
  too, so chunk STRUCTURE, not flags, decides). The shared xf reads only flat
  `:reasoning`/`:content` strings and classifies content first, so the transition event must
  become two events, reasoning first. The synthetic reasoning event keeps the top-level
  :id/:model — :start is emitted from them — and carries nothing else; usage, finish_reason,
  and tool_calls stay on the content event.

  A think chunk's `signature` — defined for replay (ThinkChunk.signature in
  https://docs.mistral.ai/openapi.yaml) but never emitted by mistral-medium-3-5 today (probed
  2026-09-01) — is lifted out as ready-namespaced :reasoning_metadata for the shared xf to ride
  into provider metadata, ready for the day it appears; a signature-only think chunk still gets
  its synthetic event, since the closing chunk of a block is where a signature would ride.

  Chunk `:type` is optional in Mistral's OpenAPI spec, so dispatch is structural on the
  :thinking/:text keys; chunk kinds carrying neither (references, files, audio — at either
  nesting level) are dropped deliberately, like the parts the other adapters do not translate."
  [event]
  (let [content (get-in event [:choices 0 :delta :content])]
    (if-not (vector? content)
      [event]
      (let [thinking  (apply str (mapcat #(keep :text (:thinking %)) content))
            text      (apply str (keep :text content))
            signature (some :signature (filter :thinking content))]
        (cond-> []
          (or (seq thinking) signature)
          (conj (cond-> {:choices [{:delta (cond-> {}
                                             (seq thinking) (assoc :reasoning thinking)
                                             signature      (assoc :reasoning_metadata
                                                                   {:mistral {:signature signature}}))}]}
                  (:id event)    (assoc :id (:id event))
                  (:model event) (assoc :model (:model event))))

          true
          (conj (assoc-in event [:choices 0 :delta :content] text)))))))

(defn mistral->aisdk-chunks-xf
  "Translates Mistral Chat Completions streaming chunks into AI SDK v5 protocol chunks."
  []
  (comp (mapcat flatten-content-chunks)
        (chat-completions/chat-completions->aisdk-chunks-xf stop-reasons {:forward-reasoning? true})))

(defn mistral
  "Call the Mistral Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply mistral-raw args)]
    (eduction (mistral->aisdk-chunks-xf) raw)))
