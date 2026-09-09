(ns metabase.metabot.self.deepseek
  "DeepSeek adapter, speaking DeepSeek's Anthropic-compatible Messages surface.

  Both surfaces DeepSeek serves hang off one host, so a single base URL covers them:

    - `POST {base-url}/anthropic/v1/messages` — Anthropic Messages API, the chat surface
    - `GET  {base-url}/models`                — OpenAI-style catalog, also the admin Connect round trip

  The Anthropic dialect is used rather than DeepSeek's Chat Completions surface because it is the
  only one that can carry reasoning back to us: [[metabase.metabot.self.claude]] already captures
  thinking blocks with their signatures and replays them, while the shared Chat Completions
  translation drops `reasoning_content` on the floor. Request bodies and stream translation are
  therefore delegated to `claude.clj`; this namespace owns auth, the catalog, errors, and the
  thinking directive.

  https://api-docs.deepseek.com/guides/anthropic_api"
  (:require
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

(def ^:private default-model "deepseek-v4-pro")

(def ^:private anthropic-version "2023-06-01")

(def ^:private messages-path "/anthropic/v1/messages")

(def supported-models
  "DeepSeek models offered in the Metabot model picker, as a map of model id -> display name.
  `list-models` returns the intersection of this map with the `/models` catalog."
  {"deepseek-v4-flash" "DeepSeek V4 Flash"
   "deepseek-v4-pro"   "DeepSeek V4 Pro"})

(def ^:private thinking-enabled-payload
  "Sent whenever thinking is allowed. Explicit rather than omitted: DeepSeek ignores an
  unrecognized `thinking.type` and leaves thinking on, so only the exact disable payload turns
  it off and an omitted directive is indistinguishable from a typo."
  {:type "enabled"})

(def ^:private thinking-disabled-payload
  {:type "disabled"})

(defn reasoning-model?
  "Whether `model` streams reasoning back to us. Every DeepSeek model we offer does, subject to the
  per-request suppression in [[thinking-enabled?]]."
  [model]
  (contains? supported-models model))

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for DeepSeek")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- deepseek-error-msg
  "Canonical, status-specific DeepSeek error message.

  `metabase.metabot.api`'s `provider-client-error?` renders any 4xx `:api-error` under the admin
  API-key field, so the request-rejected statuses (400, 422) need messages that do not send admins
  hunting a key problem that does not exist. 402 is an exhausted account balance, which DeepSeek
  reports separately from rate limiting."
  [res]
  (let [status (long (:status res 0))]
    (case status
      400 (tru "DeepSeek rejected the request — check the model and request parameters")
      401 (tru "DeepSeek API key expired or invalid")
      402 (tru "DeepSeek account balance is exhausted")
      403 (tru "DeepSeek denied access — check the API key permissions")
      404 (tru "DeepSeek API endpoint or model was not found — check the base URL and model")
      422 (tru "DeepSeek rejected the request parameters")
      429 (tru "DeepSeek has rate limited us")
      500 (tru "DeepSeek returned an internal server error")
      503 (tru "DeepSeek is overloaded and is asking us to wait")
      (tru "DeepSeek API error (HTTP {0})" status))))

(defn- supported-model?
  "Whether a `/models` catalog entry is one of the [[supported-models]]."
  [{:keys [id]}]
  (contains? supported-models id))

(defn- list-all-models
  "Fetch the full DeepSeek model catalog (`GET /models`).

  The catalog is OpenAI-style even though the chat surface is not, so the fail-closed extraction in
  [[chat-completions/models-catalog]] applies. It doubles as the credential round-trip behind the
  admin Connect button — it 401s on a bad key.
  `:ai-proxy?` is not supported for DeepSeek and throws when true."
  [{:keys [credentials ai-proxy?]}]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (try
    (let [auth (core/resolve-auth "deepseek" "DeepSeek"
                                  (when-let [k (not-empty (:api-key credentials))]
                                    {:url     (:base-url credentials)
                                     :headers {"Authorization" (str "Bearer " k)}})
                                  ai-proxy?)
          res  (core/request auth {:method  :get
                                   :url     "/models"
                                   :as      :json
                                   :headers {"Content-Type" "application/json"}})]
      (chat-completions/models-catalog "DeepSeek" res))
    (catch Exception e
      (core/rethrow-api-error! "deepseek" deepseek-error-msg e))))

(defn list-models
  "List the DeepSeek models supported by this adapter (see [[supported-models]]).

  Display names come from [[supported-models]]: DeepSeek catalog entries carry no `:name`.
  `:ai-proxy?` is not supported for DeepSeek and throws when true."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (filter supported-model?)
                 (sort-by :id)
                 (mapv (fn [{:keys [id]}]
                         {:id id :display_name (supported-models id)})))}))

;;; --------------------------------------------- The thinking contract ------------------------------------------
;;;
;;; DeepSeek validates thinking provenance over the *currently open turn* — everything after the
;;; last plain user message. Every assistant message there carrying a `tool_use` must also carry a
;;; thinking block, or hold a tool-call id minted by a thinking-enabled generation; one offending
;;; message 400s the whole request. `thinking {:type "disabled"}` bypasses the check entirely.

(defn- plain-user-message?
  "Whether `part` is a plain user message — the only thing that closes a turn. Tool results are
  user-role on the wire but do not close it."
  [part]
  (and (nil? (:type part))
       (contains? #{nil :user "user"} (:role part))))

(defn- open-turn-parts
  "The parts after the last plain user message."
  [input]
  (if-let [i (->> input
                  (keep-indexed (fn [i part] (when (plain-user-message? part) i)))
                  last)]
    (drop (inc i) input)
    input))

(def ^:private assistant-part-type?
  "Part types [[claude/parts->claude-messages]] renders as assistant-role content, and so merges
  into one message."
  #{:reasoning :text :tool-input})

(defn- signed-reasoning?
  "Whether `part` is a thinking block DeepSeek will accept back. A signature is the only
  provenance it recognizes: [[claude/parts->claude-messages]] also vouches for a part carrying
  `:redactedData`, but `redacted_thinking` is one of the block types DeepSeek does not support, and
  DeepSeek never emits one for us to replay."
  [part]
  (and (= :reasoning (:type part))
       (some? (get-in part [:provider-metadata :anthropic :signature]))))

(defn- unsigned-tool-call-in-open-turn?
  "Whether the open turn holds a tool call we cannot vouch for. Parts are grouped the way they merge
  onto the wire: a run of assistant-role parts becomes one message, and a run holding a `:tool-input`
  with no signed `:reasoning` is a message DeepSeek rejects. Metabot's synthetic dialect preload
  (`skill_preload_*`, injected for SQL-editor sessions) is exactly that shape."
  [input]
  (->> (open-turn-parts input)
       (partition-by (comp boolean assistant-part-type? :type))
       (some (fn [run]
               (and (some #(= :tool-input (:type %)) run)
                    (not-any? signed-reasoning? run))))
       boolean))

(defn- thinking-enabled?
  "Thinking is on unless the caller opted out, we are forcing a single structured-output tool call
  (`tool_choice {:type \"tool\"}` is rejected in thinking mode, unlike `{:type \"any\"}`), or the
  open turn carries a tool call with no signed reasoning to vouch for it."
  [{:keys [schema reasoning? input] :or {reasoning? true}}]
  (cond
    (not reasoning?)                         false
    (some? schema)                           false
    (unsigned-tool-call-in-open-turn? input) (do (log/debug "DeepSeek thinking disabled: unsigned tool call in the open turn")
                                                 false)
    :else                                    true))

(mu/defn deepseek-request-body
  "Build the Anthropic Messages request body for an LLM request.

  DeepSeek's Anthropic surface accepts what [[claude/claude-request-body]] emits as-is, so the only
  DeepSeek-specific work is the thinking directive, which must always be present: an omitted
  directive leaves thinking on.

  The three `cache_control` markers are inert here: DeepSeek lists the field among those it ignores
  and caches input prefixes on its own, with no request parameter to set. Hits are still reported,
  on the Anthropic-shaped `cache_read_input_tokens`.

  Where thinking is allowed this diverges from `claude-request-body` deliberately: DeepSeek accepts
  `tool_choice {:type \"any\"}` with thinking on, so the profiles that force a tool call keep their
  reasoning."
  [{:keys [model] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (let [thinking? (thinking-enabled? opts)]
    (cond-> (claude/claude-request-body
             (assoc opts
                    :model            model
                    :reasoning?       thinking?
                    :reasoning-config (when thinking? thinking-enabled-payload)))
      (not thinking?) (assoc :thinking thinking-disabled-payload))))

(mu/defn deepseek-raw
  "Perform a streaming request to the DeepSeek Anthropic Messages API.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing.
  `:ai-proxy?` is not supported for DeepSeek and throws when true."
  [{:keys [model tools credentials ai-proxy?] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [req (deepseek-request-body (assoc opts :model model))]
    (log/debug "DeepSeek request" {:model model :msg-count (count (:messages req)) :tools (count (or tools []))})
    (with-span :info {:name       :metabot.deepseek/request
                      :model      model
                      :msg-count  (count (:messages req))
                      :tool-count (count (or tools []))}
      (try
        (let [api-key  (not-empty (:api-key credentials))
              auth     (core/resolve-auth "deepseek" "DeepSeek"
                                          (when api-key
                                            {:url     (:base-url credentials)
                                             :headers {"Authorization" (str "Bearer " api-key)}})
                                          ai-proxy?)
              response (core/request auth
                                     {:method  :post
                                      :url     messages-path
                                      :as      :stream
                                      :headers {"anthropic-version" anthropic-version
                                                "Content-Type"      "application/json"}
                                      :body    (json/encode req)})]
          ;; The SSE body is consumed lazily, after this `try` has exited — wrap
          ;; the reducible so mid-stream IO/timeout failures get the same
          ;; provider-friendly translation as request-time errors.
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "deepseek"
                                     :model    model
                                     :url      messages-path
                                     :request  req})
              (core/reducible-with-api-errors "deepseek" deepseek-error-msg)))
        (catch Exception e
          (core/rethrow-api-error! "deepseek" deepseek-error-msg e))))))

(defn deepseek->aisdk-chunks-xf
  "Translates DeepSeek Anthropic Messages streaming events into AI SDK v5 protocol chunks."
  []
  (claude/claude->aisdk-chunks-xf))

(defn deepseek
  "Call the DeepSeek Anthropic Messages API, return AISDK stream."
  [& args]
  (let [raw (apply deepseek-raw args)]
    (eduction (deepseek->aisdk-chunks-xf) raw)))
