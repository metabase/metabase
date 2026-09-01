(ns metabase.metabot.self.azure
  "Microsoft Azure LLM provider adapter.

  Talks to the OpenAI- and Anthropic-compatible \"v1\" surfaces of a customer's Azure resource
  (`https://<resource>.services.ai.azure.com/{openai|anthropic}`, or the `*.openai.azure.com`
  equivalent), authenticating with `Authorization: Bearer {llm-azure-api-key}`:

    - `POST {base-url}/v1/messages`  — Anthropic Messages API, for `anthropic/*` models
    - `POST {base-url}/v1/responses` — OpenAI Responses API, for `openai/*` models

  Azure serves admin-named *deployments*, not a callable catalog, so the model string is
  `{family}/{deployment-name}`: the first segment selects the wire protocol and the rest is the
  deployment name sent as the body's `model`. These are the same protocols the direct
  Anthropic/OpenAI adapters speak, so this namespace reuses their request-body and chunks-xf fns,
  exactly like the Bedrock adapter. Only the v1 surfaces are supported (no classic
  deployment-scoped endpoints or Entra ID auth)."
  (:require
   [clojure.string :as str]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(def ^:private anthropic-version "2023-06-01")

;;; --------------------------------------------- API family dispatch -------------------------------------------

(defn- model->family
  "Which wire-protocol family serves `model`, by its explicit first segment: `:anthropic` or `:openai`."
  [model]
  (cond
    (str/starts-with? (str model) "anthropic/") :anthropic
    (str/starts-with? (str model) "openai/")    :openai
    :else
    (throw (ex-info (tru "Unsupported Azure model {0}. Only anthropic/* and openai/* models are supported." (pr-str model))
                    {:api-error   true
                     :error-code  :unsupported-model
                     ;; a deployment the admin typed, so this is a bad request rather than an outage
                     :status-code 400
                     :model       model}))))

(defn- model->deployment
  "The Azure deployment name carried by a `{family}/{deployment-name}` model string."
  [model]
  (second (str/split (str model) #"/" 2)))

(def ^:private model-context-windows
  "Input context windows for the models Azure sells, keyed by model id.
  GPT values are max input tokens (Microsoft's listed windows are input + output totals):
  https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure"
  {"claude-fable-5"    1000000
   "claude-opus-5"     1000000
   "claude-opus-4-8"   1000000
   "claude-opus-4-7"   1000000
   "claude-opus-4-6"   1000000
   "claude-opus-4-5"    200000
   "claude-opus-4-1"    200000
   "claude-sonnet-5"   1000000
   "claude-sonnet-4-6" 1000000
   "claude-sonnet-4-5"  200000
   "claude-haiku-4-5"   200000
   "gpt-5.6-sol"        922000
   "gpt-5.6-terra"      922000
   "gpt-5.6-luna"       922000
   "gpt-5.6"            922000
   "gpt-5.5-pro"        922000
   "gpt-5.5"            922000
   "gpt-5.4-pro"        922000
   "gpt-5.4-mini"       272000
   "gpt-5.4-nano"       272000
   "gpt-5.4"            922000})

(defn context-window-tokens
  "The input context window for a `{family}/{deployment}` model string. Deployment names
  default to the model id at deploy time, so the longest model id prefixing the deployment
  name decides (tolerating date/custom suffixes like `gpt-5.4-2026-03-05`); nil when the
  deployment name matches no known model."
  [model]
  (let [deployment (u/lower-case-en (str (model->deployment model)))]
    (some->> (keys model-context-windows)
             (filter #(str/starts-with? deployment %))
             seq
             (apply max-key count)
             model-context-windows)))

;;; ------------------------------------------------ HTTP plumbing ----------------------------------------------

(defn- missing-credentials-ex []
  (ex-info (tru "Azure credentials are not configured")
           {:api-error   true
            :error-code  :api-key-missing
            :status-code 403}))

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for Azure")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- ensure-credentials
  "Validate the credentials of the connection serving this request.
  Throws when the API key or base URL is missing."
  [credentials]
  (when-not (llm.provider/credentials-complete? "azure" credentials)
    (throw (missing-credentials-ex)))
  credentials)

(defn- azure-error-msg
  "Canonical, status-specific Azure error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      401 (tru "Azure rejected the API key for this resource")
      403 (tru "Azure API key lacks permission for this resource or deployment")
      404 (tru "Azure API endpoint or deployment was not found — check the base URL and deployment name")
      429 (tru "Azure has rate limited us")
      500 (tru "Azure is not working but not saying why")
      (tru "Azure API error (HTTP {0})" status))))

(defn- azure-request
  "Perform an HTTP request against the Azure resource's compatible surface.
  `credentials` is the `{:api-key ... :base-url ...}` map of the connection serving this request.
  `headers` are extra headers (e.g. `anthropic-version`).
  `ai-proxy?` is accepted for parity with the other provider adapters but is not supported:
  throws when true. Auth is resolved through [[core/resolve-auth]]/[[core/request]] so proxy
  redirection is already wired up should Azure proxying ever be supported."
  [{:keys [method path body as headers credentials ai-proxy?]}]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [{:keys [api-key base-url]} (ensure-credentials credentials)
        auth (core/resolve-auth "azure" "Azure"
                                {:url     base-url
                                 :headers {"Authorization" (str "Bearer " api-key)}}
                                ai-proxy?)]
    (core/request auth
                  (cond-> {:method  method
                           :url     path
                           :headers headers}
                    as   (assoc :as as)
                    body (-> (assoc :body body)
                             (assoc-in [:headers "Content-Type"] "application/json"))))))

;;; ---------------------------------------------- Connect validation -------------------------------------------

(defn- validate-openai-surface!
  "Round-trip the `/openai` surface: `GET /v1/models` succeeds (with the regional catalog,
  which we discard) iff the key and base URL reach an authenticated OpenAI-compatible surface."
  [credentials ai-proxy?]
  (azure-request {:method :get :path "/v1/models" :as :json :credentials credentials :ai-proxy? ai-proxy?}))

(defn- validate-anthropic-surface!
  "Round-trip the `/anthropic` surface, which exposes no GET routes (they 404 with
  `api_not_supported` even when authenticated). `POST /v1/messages` with an empty body
  returns 400 `no_model_name` from the messages route itself — auth is checked before
  routing (bad keys 401, wrong paths 404) — so a 400 proves surface + auth without
  invoking a model."
  [credentials ai-proxy?]
  (try
    (azure-request {:method      :post
                    :path        "/v1/messages"
                    :body        "{}"
                    :headers     {"anthropic-version" anthropic-version}
                    :credentials credentials
                    :ai-proxy?   ai-proxy?})
    (catch Exception e
      (when-not (= 400 (:status (ex-data e)))
        (throw e)))))

(defn- configured-azure-model
  "The saved `{family}/{deployment}` model string when the connection Metabot is pointed at is an Azure one."
  []
  (let [{:keys [type model]} (llm.provider/resolve-model-ref (metabot.settings/llm-metabot-provider))]
    (when (= type "azure")
      model)))

(defn list-models
  "Validate Azure credentials with a model-free round trip and return an empty model list.

  There is never a dropdown to populate (Azure's listing returns the regional catalog, not the
  customer's deployments — deployment names are free text), so the round trip only proves the
  credentials reach an authenticated surface of the right family (see [[validate-openai-surface!]]
  and [[validate-anthropic-surface!]]); deployment existence is not validated and first fails at
  chat time with `DeploymentNotFound`.

  Opts: `:credentials` (`{:api-key ... :base-url ...}`), `:model` (the `{family}/{deployment}`
  string selecting which surface family to validate; defaults to the saved Azure model), and
  `:ai-proxy?`, which is not supported for Azure and throws when true."
  ([] (list-models {}))
  ([{:keys [credentials model ai-proxy?]}]
   (when-let [model (or (not-empty model) (configured-azure-model))]
     (try
       (case (model->family model)
         :anthropic (validate-anthropic-surface! credentials ai-proxy?)
         :openai    (validate-openai-surface! credentials ai-proxy?))
       (catch Exception e
         (core/rethrow-api-error! "azure" azure-error-msg e))))
   {:models []}))

;;; --------------------------------------------------- Streaming -----------------------------------------------

(mu/defn azure-raw
  "Perform a streaming request to an Azure-hosted model deployment.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing. `:ai-proxy?` is not supported for Azure and throws when true."
  [{:keys [model input tools credentials ai-proxy?] :as opts} :- core/LLMRequestOpts]
  (let [family (model->family model)
        opts   (assoc opts :model (model->deployment model) :reasoning? false :fast? false)
        {:keys [path headers req]}
        (case family
          :anthropic {:path    "/v1/messages"
                      :headers {"anthropic-version" anthropic-version}
                      :req     (claude/claude-request-body opts)}
          :openai    {:path "/v1/responses"
                      :req  (openai/openai-request-body opts)})]
    (with-span :info {:name       :metabot.azure/request
                      :model      model
                      :family     family
                      :msg-count  (count input)
                      :tool-count (count tools)}
      (try
        (let [response (azure-request {:method      :post
                                       :path        path
                                       :as          :stream
                                       :headers     headers
                                       :body        (json/encode req)
                                       :credentials credentials
                                       :ai-proxy?   ai-proxy?})]
          ;; The SSE body is consumed lazily, after this `try` has exited — wrap
          ;; the reducible so mid-stream IO/timeout failures get the same
          ;; provider-friendly translation as request-time errors.
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "azure"
                                     :model    model
                                     :url      path
                                     :request  req})
              (core/reducible-with-api-errors "azure" azure-error-msg)))
        (catch Exception e
          (core/rethrow-api-error! "azure" azure-error-msg e))))))

(defn- model->aisdk-chunks-xf
  "The SSE->AISDK translating transducer for an Azure model string.
  Claude's for `anthropic/*` models, OpenAI's for `openai/*` models."
  [model]
  (case (model->family model)
    :anthropic (claude/claude->aisdk-chunks-xf)
    :openai    (openai/openai->aisdk-chunks-xf)))

(defn azure
  "Call an Azure-hosted model deployment, return AISDK stream."
  [& [{:keys [model]} :as args]]
  (let [raw (apply azure-raw args)]
    (eduction (model->aisdk-chunks-xf model) raw)))
