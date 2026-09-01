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
  "Translates Moonshot Chat Completions streaming chunks into AI SDK v5 protocol chunks."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf))

(defn moonshot
  "Call the Moonshot Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply moonshot-raw args)]
    (eduction (moonshot->aisdk-chunks-xf) raw)))
