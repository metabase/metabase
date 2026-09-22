(ns metabase.metabot.self.moonshot
  "Moonshot AI (Kimi) / Chat Completions adapter.

  Moonshot exposes an OpenAI-compatible Chat Completions API.

  https://platform.kimi.ai/docs"
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

(def ^:private default-model "kimi-k3")

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for Moonshot")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- moonshot-error-msg
  "Canonical, status-specific Moonshot error message.

  Mapping 400 only improves the message text: `metabase.metabot.api`'s `provider-client-error?` renders any 4xx
  `:api-error` under the admin API-key field, so a generic message sends admins hunting a key problem that does not
  exist. 429 covers rate limiting *and* an exhausted account balance, which Moonshot reports with the same status."
  [res]
  (let [status (long (:status res 0))]
    (case status
      400 (tru "Moonshot rejected the request — check the model and request parameters")
      401 (tru "Moonshot API key expired or invalid")
      403 (tru "Moonshot denied access — check the API key''s permissions")
      404 (tru "Moonshot API endpoint or model was not found — check the base URL and model")
      429 (tru "Moonshot has rate limited us, or the account balance is exhausted")
      500 (tru "Moonshot returned an internal server error")
      (tru "Moonshot API error (HTTP {0})" status))))

(def supported-models
  "Moonshot models offered in the Metabot model picker, keyed by model id.
  `list-models` returns the intersection of this map with the `/models` catalog.

  The `kimi-k2.7-code` models the catalog also carries are coding models, not agent models, and are excluded."
  {"kimi-k2.6" {:display-name "Kimi K2.6" :context-window 262144}
   "kimi-k3"   {:display-name "Kimi K3"   :context-window 1048576}})

(defn context-window-tokens
  "The input context window for `model`, or nil when it isn't one we know."
  [model]
  (get-in supported-models [model :context-window]))

(def ^:private thinking-only-models
  "Models whose catalog entry reports `supports_thinking_type: \"only\"`: thinking cannot be turned off, so sending
  `thinking {:type \"disabled\"}` is rejected. k3 does not need it — it accepts `tool_choice \"required\"` with
  thinking on, unlike k2.6."
  #{"kimi-k3"})

(def ^:private reasoning-models
  "Models whose streamed thinking our chain-of-thought UI renders.

  The [[thinking-only-models]] plus the thinking-optional kimi-k2.6. Today this equals the [[supported-models]]
  key set, but deliberately so, not derived: rendering reasoning is a per-model product decision, and a newly
  supported model must opt in here."
  (conj thinking-only-models "kimi-k2.6"))

(defn reasoning-model?
  "Whether `model` streams thinking that our chain-of-thought UI renders.

  True exactly for the [[reasoning-models]] whitelist; off-whitelist models get thinking disabled in the request,
  so the settings gate and the stream agree by construction."
  [model]
  (contains? reasoning-models (str model)))

(defn- supported-model?
  "Whether a `/models` catalog entry is one of the [[supported-models]]."
  [{:keys [id]}]
  (contains? supported-models id))

(defn- list-all-models
  "Fetch the full Moonshot model catalog (`GET /models`).

  The endpoint doubles as the credential round-trip behind the admin Connect button — it 401s on a bad key.
  A 2xx whose body isn't a recognizable catalog throws rather than yielding an empty picker — see
  [[chat-completions/models-catalog]].
  `:ai-proxy?` is not supported for Moonshot and throws when true."
  [{:keys [credentials ai-proxy?]}]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (try
    (let [auth (core/resolve-auth "moonshot" "Moonshot"
                                  (when-let [k (not-empty (:api-key credentials))]
                                    {:url     (:base-url credentials)
                                     :headers {"Authorization" (str "Bearer " k)}})
                                  ai-proxy?)
          res  (core/request auth {:method  :get
                                   :url     "/models"
                                   :as      :json
                                   :headers {"Content-Type" "application/json"}})]
      (chat-completions/models-catalog "Moonshot" res))
    (catch Exception e
      (core/rethrow-api-error! "moonshot" moonshot-error-msg e))))

(defn list-models
  "List the Moonshot models supported by this adapter (see [[supported-models]]).

  Display names come from [[supported-models]] rather than the catalog: Moonshot catalog entries carry no `:name`
  (and no `:aliases`, so there is no Mistral-style alias resolution to do either).
  `:ai-proxy?` is not supported for Moonshot and throws when true."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (filter supported-model?)
                 (sort-by :id)
                 (mapv (fn [{:keys [id]}]
                         {:id id :display_name (get-in supported-models [id :display-name])})))}))

(def ^:private forced-tool-call-token-floor
  "Smallest `max_tokens` a forced tool call on a thinking-only model may be capped at.

  kimi-k3 cannot stop thinking and Chat Completions bills thinking and the tool call against one budget, so a small
  caller cap (the conversation-title path sends 512) risks a `length` finish before the tool call is emitted.
  Matches vLLM's probe-proven floor."
  2048)

(defn- floor-max-tokens
  "Raises an existing `max_tokens` cap to [[forced-tool-call-token-floor]]; an uncapped body stays uncapped."
  [body]
  (cond-> body (:max_tokens body) (update :max_tokens max forced-tool-call-token-floor)))

(defn- reasoning-message
  "The replayed assistant message for a coalesced in-turn :reasoning part.

  Kimi thinking models require replaying reasoning with the assistant message it came with — \"pass the complete
  assistant message returned by the API back to messages as-is (including reasoning_content)\"
  (https://platform.kimi.ai/docs/guide/use-thinking-models). It rides as a top-level sibling of
  `content`/`tool_calls`, so this message relies on [[chat-completions/parts->cc-messages]] merging it into the
  round's assistant message; `:content \"\"` matches Moonshot's own emission shape and joins invisibly."
  [part]
  {:role "assistant" :content "" :reasoning_content (:text part)})

(mu/defn moonshot-request-body
  "Build the Chat Completions request body for an LLM request.

  Moonshot's Chat Completions dialect matches what [[chat-completions/request-body]] emits — including
  `stream_options`, unlike Mistral — except:

  - **No `temperature`.** Moonshot 400s on any value but the one its thinking mode allows (0.6 off, 1.0 on), so
    there is no safe value to pass and it is dropped unconditionally.
  - **`thinking`** on models that can switch it (today kimi-k2.6): `{:type \"enabled\"}` when the chat path
    renders reasoning; `{:type \"disabled\"}` on the structured path, under a forced tool choice — k2.6 rejects
    `tool_choice \"required\"` while thinking is on, which the structured-output path and the `:sql` and
    `:document-generate-content` profiles all depend on — and for off-whitelist models. `thinking.keep` stays at
    its default null, so k2.6 does not replay reasoning (see the hook note in the body).
    [[thinking-only-models]] cannot disable thinking and are sent no `thinking` at all.
  - **`reasoning_effort`** for [[thinking-only-models]] (kimi-k3, which explicitly does not support `thinking`
    and is the only model accepting `reasoning_effort`): \"max\" when the chat path renders reasoning, \"low\"
    otherwise; their in-turn reasoning is replayed (see [[reasoning-message]]) and forced tool calls get a
    `max_tokens` floor (see [[forced-tool-call-token-floor]]).
  - **`prompt_cache_key`.** Moonshot caching is automatic and hits without it, but a `:prompt-cache-key` — the
    conversation id — is forwarded when present."
  [{:keys [model prompt-cache-key reasoning? schema tool_choice] :as opts
    :or   {model default-model reasoning? true}} :- core/LLMRequestOpts]
  ;; kimi-k3 always thinks — there is no off switch, so `reasoning_effort` ("low" | "high" | "max", server default
  ;; "max") is the only knob (https://platform.kimi.ai/docs/guide/kimi-k3-quickstart). "max" on the chat path pins
  ;; the documented default explicitly; "low" is the floor on the structured path and under :reasoning? false — a
  ;; best-effort floor, not an off switch: the model thinks, bills, and streams regardless.
  (let [whitelisted?   (reasoning-model? model)
        thinking-only? (contains? thinking-only-models (str model))
        ;; k2.6 rejects `tool_choice "required"` while thinking is on (probe-derived, BOT-1929; no doc
        ;; statement — unre-verified), so a forced tool choice turns k2.6's thinking off. k3 accepts the
        ;; combination, so on thinking-only models only the schema call — a forced structured_output tool
        ;; call whose stream no user ever sees (conversation titles and the like) — drops to the cheapest
        ;; effort.
        forced?        (or (some? schema) (= "required" (some-> tool_choice name)))
        ;; thinking? = "we want renderable thinking", not "the model will think" — k3 thinks regardless,
        ;; which is why the floor arm below is keyed on the model class instead. One binding gates the
        ;; effort level, the thinking switch, and the replay hook, so they cannot desynchronize; when it
        ;; is false the nil hook also strips :reasoning parts from the replayed input, honoring the
        ;; LLMRequestOpts contract.
        thinking?      (and whitelisted? reasoning?
                            (if thinking-only? (not schema) (not forced?)))]
    (-> (chat-completions/request-body
         (assoc opts :model model)
         ;; Replay only where the dialect mandates it: k3's Preserved Thinking. k2.6 cannot use
         ;; `thinking.keep "all"` — that mode obliges the caller to send back EVERY historical assistant
         ;; message's reasoning_content, but reasoning parts are never persisted across turns, so we could
         ;; honor it only within the current turn and would breach it on every turn after the first. k2.6
         ;; therefore runs with keep at its default null, under which the server ignores replayed
         ;; reasoning_content — a replay hook there would only burn prompt tokens.
         ;; https://platform.kimi.ai/docs/guide/use-kimi-k2-thinking-model
         (when (and thinking? thinking-only?) {:reasoning-part->message reasoning-message}))
        (dissoc :temperature)
        (cond-> thinking-only?               (assoc :reasoning_effort (if thinking? "max" "low"))
                ;; Every forced tool call — schema or tool_choice "required" — must survive the
                ;; thinking spend: reasoning and the tool call share one max_tokens budget ("the
                ;; sum of tokens in reasoning_content and content must be <= max_tokens", and the
                ;; guide recommends >= 16000 for tool calls —
                ;; https://platform.kimi.ai/docs/guide/use-thinking-models). A tool call cut off
                ;; at `length` fails the whole turn.
                (and thinking-only? forced?) floor-max-tokens
                (not thinking-only?)         (assoc :thinking {:type (if thinking? "enabled" "disabled")})
                prompt-cache-key             (assoc :prompt_cache_key prompt-cache-key)))))

(mu/defn moonshot-raw
  "Perform a streaming request to the Moonshot Chat Completions API.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing.
  `:ai-proxy?` is not supported for Moonshot and throws when true."
  [{:keys [model tools credentials ai-proxy?] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [req (moonshot-request-body (assoc opts :model model))]
    (log/debug "Moonshot request" {:model model :msg-count (count (:messages req)) :tools (count (or tools []))})
    (with-span :info {:name       :metabot.moonshot/request
                      :model      model
                      :msg-count  (count (:messages req))
                      :tool-count (count (or tools []))}
      (try
        (let [api-key  (not-empty (:api-key credentials))
              auth     (core/resolve-auth "moonshot" "Moonshot"
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
              (debug/capture-stream {:provider "moonshot"
                                     :model    model
                                     :url      "/chat/completions"
                                     :request  req})))
        (catch Exception e
          (core/rethrow-api-error! "moonshot" moonshot-error-msg e))))))

(defn moonshot->aisdk-chunks-xf
  "Translates Moonshot Chat Completions streaming chunks into AI SDK v5 protocol chunks.

  Reasoning arrives as flat `delta.reasoning_content` strings, documented to always precede content deltas
  (https://platform.kimi.ai/docs/guide/use-thinking-models). A delta carrying both `reasoning_content` and
  non-empty `content` would drop its reasoning — the shared xf classifies content first. Accepted, unprobed risk:
  no such chunk is documented or has been observed."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf chat-completions/stop-reasons
                                                      {:forward-reasoning? true}))

(defn moonshot
  "Call the Moonshot Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply moonshot-raw args)]
    (eduction (moonshot->aisdk-chunks-xf) raw)))
