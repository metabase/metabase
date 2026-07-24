(ns metabase.metabot.self.zai
  "Z.AI (GLM) / Chat Completions adapter.

  Z.AI exposes an OpenAI-compatible Chat Completions API serving the GLM model family. Its wire format — request body,
  SSE streaming chunks, and usage reporting — matches the Chat Completions dialect the OpenRouter adapter speaks, so
  this namespace reuses openrouter's request-body builder and chunk translation, the same way the Azure and Bedrock
  adapters reuse claude.clj/openai.clj.

  The base URL includes Z.AI's version segment (`https://api.z.ai/api/paas/v4`); this adapter appends
  `/chat/completions` and `/models`.

  https://docs.z.ai/api-reference/llm/chat-completion"
  (:require
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(def ^:private default-model "glm-5.2")

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for Z.AI")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- zai-error-msg
  "Canonical, status-specific Z.AI error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      401 (tru "Z.AI API key expired or invalid")
      404 (tru "Z.AI API endpoint was not found — check the base URL")
      429 (tru "Z.AI has rate limited us")
      500 (tru "Z.AI returned an internal server error")
      (tru "Z.AI API error (HTTP {0})" status))))

(def ^:private supported-models
  "Z.AI models offered in the Metabot model picker, as a map of model id -> display name.
  `list-models` returns the intersection of this map with the `/models` catalog."
  {"glm-5.2" "GLM-5.2"})

(defn- supported-model?
  "Whether a `/models` catalog entry is one of the [[supported-models]]."
  [{:keys [id]}]
  (contains? supported-models id))

(defn- list-all-models
  "Fetch the full Z.AI model catalog (`GET /models`).

  The endpoint is OpenAI-compatible but undocumented; it doubles as the credential
  round-trip behind the admin Connect button (auth is checked before routing, so a 2xx
  proves the key and base URL reach an authenticated surface).
  `:ai-proxy?` is not supported for Z.AI and throws when true."
  [{:keys [credentials ai-proxy?]}]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (try
    (let [auth (core/resolve-auth "zai" "Z.AI"
                                  (when-let [k (or (not-empty (:api-key credentials))
                                                   (not-empty (llm/llm-zai-api-key)))]
                                    {:url     (llm/llm-zai-api-base-url)
                                     :headers {"Authorization" (str "Bearer " k)}})
                                  ai-proxy?)
          res  (core/request auth {:method  :get
                                   :url     "/models"
                                   :as      :json
                                   :headers {"Content-Type" "application/json"}})]
      (get-in res [:body :data]))
    (catch Exception e
      (core/rethrow-api-error! "zai" zai-error-msg e))))

(defn list-models
  "List the Z.AI models supported by this adapter (see [[supported-models]]).
  No-arg uses the configured API key. Opts map supports `:credentials` (`{:api-key ...}`)
  and `:ai-proxy?`. `:ai-proxy?` is not supported for Z.AI and throws when true."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (filter supported-model?)
                 (sort-by :id)
                 (mapv (fn [{:keys [id] :as model}]
                         {:id id :display_name (or (:name model) (supported-models id))})))}))

(mu/defn zai-request-body
  "Build the Chat Completions request body for an LLM request.

  Z.AI's Chat Completions dialect matches what [[openrouter/openrouter-request-body]]
  emits for non-Anthropic models (plain string system message, OpenAI tool format,
  `stream_options` usage reporting), so this delegates to it. Z.AI documents only
  `tool_choice \"auto\"`, but `\"required\"` — which the structured-output path
  relies on — is accepted and honored in practice."
  [{:keys [model] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (openrouter/openrouter-request-body (assoc opts :model model)))

(mu/defn zai-raw
  "Perform a streaming request to the Z.AI Chat Completions API.
  `:ai-proxy?` is not supported for Z.AI and throws when true."
  [{:keys [model tools ai-proxy?] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [req (zai-request-body (assoc opts :model model))]
    (log/debug "Z.AI request" {:model model :msg-count (count (:messages req)) :tools (count (or tools []))})
    (with-span :info {:name       :metabot.zai/request
                      :model      model
                      :msg-count  (count (:messages req))
                      :tool-count (count (or tools []))}
      (try
        (let [api-key  (not-empty (llm/llm-zai-api-key))
              auth     (core/resolve-auth "zai" "Z.AI"
                                          (when api-key
                                            {:url     (llm/llm-zai-api-base-url)
                                             :headers {"Authorization" (str "Bearer " api-key)}})
                                          ai-proxy?)
              response (core/request auth
                                     {:method  :post
                                      :url     "/chat/completions"
                                      :as      :stream
                                      :headers {"Content-Type" "application/json"}
                                      :body    (json/encode req)})]
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "zai"
                                     :model    model
                                     :url      "/chat/completions"
                                     :request  req})))
        (catch Exception e
          (core/rethrow-api-error! "zai" zai-error-msg e))))))

(defn zai->aisdk-chunks-xf
  "Translates Z.AI Chat Completions streaming chunks into AI SDK v5 protocol chunks.
  Z.AI speaks the same streaming dialect the OpenRouter adapter translates (thinking-mode
  `reasoning_content` deltas carry no `content`, so they pass through without emitting
  text blocks); see [[openrouter/openrouter->aisdk-chunks-xf]]."
  []
  (openrouter/openrouter->aisdk-chunks-xf))

(defn zai
  "Call the Z.AI Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply zai-raw args)]
    (eduction (zai->aisdk-chunks-xf) raw)))
