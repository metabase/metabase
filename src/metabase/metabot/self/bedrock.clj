(ns metabase.metabot.self.bedrock
  "Amazon Bedrock LLM provider adapter.

  Talks to the Bedrock \"mantle\" endpoint (`https://bedrock-mantle.{region}.api.aws`), which
  exposes vendor-compatible API surfaces for models hosted on Bedrock:

    - `GET  /v1/models`              — OpenAI-style catalog of every mantle model
    - `POST /anthropic/v1/messages`  — Anthropic Messages API, for `anthropic.*` models
    - `POST /openai/v1/responses`    — OpenAI Responses API, for `openai.*` models

  Because these are the same wire protocols the direct Anthropic/OpenAI adapters speak, this
  namespace reuses [[claude/claude-request-body]] + [[claude/claude->aisdk-chunks-xf]] and
  [[openai/openai-request-body]] + [[openai/openai->aisdk-chunks-xf]]; the vendor prefix on the
  model id (e.g. `anthropic.claude-haiku-4-5`, `openai.gpt-5.5`) selects the API family.

  Requests are authenticated with AWS Signature Version 4 computed from the `llm-bedrock-*` settings:
  https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html"
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]])
  (:import
   (java.net URI)
   (java.util.function Consumer)
   (software.amazon.awssdk.http ContentStreamProvider SdkHttpMethod SdkHttpRequest SdkHttpRequest$Builder)
   (software.amazon.awssdk.http.auth.aws.signer AwsV4HttpSigner)
   (software.amazon.awssdk.http.auth.spi.signer SignRequest$Builder SignedRequest)
   (software.amazon.awssdk.identity.spi AwsCredentialsIdentity AwsSessionCredentialsIdentity)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ AWS Signature Version 4 ------------------------------------------

(defn- aws-identity
  "An AWS credentials identity, carrying the session token when one is present."
  [{:keys [access-key-id secret-access-key session-token]}]
  (if session-token
    (AwsSessionCredentialsIdentity/create access-key-id secret-access-key session-token)
    (AwsCredentialsIdentity/create access-key-id secret-access-key)))

(defn- unsigned-request
  "The bare `SdkHttpRequest` (method, URL, content-type) the signer signs over. Host is derived from `url`."
  ^SdkHttpRequest [{:keys [method url content-type]}]
  (let [^SdkHttpRequest$Builder b (-> (SdkHttpRequest/builder)
                                      (.method (SdkHttpMethod/fromValue (u/upper-case-en (name method))))
                                      (.uri (URI/create url)))]
    (when content-type
      (.putHeader b "Content-Type" ^String content-type))
    (.build b)))

(defn- signed-headers
  "AWS SigV4 request headers for a Bedrock mantle request, computed by the AWS SDK's [[AwsV4HttpSigner]].

  Returns a `{header-name header-value}` map carrying `Host`, `X-Amz-Date`, `Authorization`,
  `x-amz-content-sha256`, plus `Content-Type` and `X-Amz-Security-Token` when applicable. Additional
  *unsigned* headers (e.g. `anthropic-version`) may be added to the outgoing request freely."
  [{:keys [region body] :as creds}]
  (let [request               (unsigned-request creds)
        payload               (some-> body ContentStreamProvider/fromUtf8String)
        ^SignedRequest signed (.sign (AwsV4HttpSigner/create)
                                     (reify Consumer
                                       (accept [_ b]
                                         (let [^SignRequest$Builder b b]
                                           (.identity b (aws-identity creds))
                                           (.request b request)
                                           (when payload
                                             (.payload b payload))
                                           (.putProperty b AwsV4HttpSigner/SERVICE_SIGNING_NAME "bedrock")
                                           (.putProperty b AwsV4HttpSigner/REGION_NAME region)))))
        ^SdkHttpRequest req   (.request signed)]
    (into {}
          (map (fn [[k vs]] [k (first vs)]))
          (.headers req))))

;;; ------------------------------------------------ HTTP plumbing ----------------------------------------------

(defn- invalid-region-ex [region]
  (ex-info (tru "Invalid AWS Bedrock region {0}" (pr-str region))
           {:api-error   true
            :error-code  :invalid-region
            :status-code 400}))

(defn- validate-region
  "Throw if region is not a known AWS region.

  The region becomes a host label in the mantle URL, so anything outside the AWS SDK's known region set is rejected
  before it can be spliced in. The [[llm/llm-bedrock-region]] setter rejects bad values at write time, but we also
  want to validate caller-provided args."
  [region]
  (when-not (contains? llm/known-aws-regions region)
    (throw (invalid-region-ex region)))
  region)

(defn- settings-credentials
  "AWS credentials and region from the `llm-bedrock-*` settings."
  []
  {:access-key-id     (not-empty (llm/llm-bedrock-access-key-id))
   :secret-access-key (not-empty (llm/llm-bedrock-secret-access-key))
   :session-token     (not-empty (llm/llm-bedrock-session-token))
   :region            (not-empty (llm/llm-bedrock-region))})

(defn- missing-credentials-ex []
  (ex-info (tru "AWS Bedrock credentials are not configured")
           {:api-error   true
            :error-code  :api-key-missing
            :status-code 403}))

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for AWS Bedrock")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- ensure-credentials
  "Validate a Bedrock credentials map, falling back to [[settings-credentials]] when nil.
  Throws when the access key pair is incomplete or the region is unknown; the region defaults to us-east-1."
  [credentials]
  (let [creds (or credentials (settings-credentials))]
    (when-not (metabot.settings/provider-credentials-complete? "bedrock" creds)
      (throw (missing-credentials-ex)))
    (update creds :region #(validate-region (or (not-empty %) "us-east-1")))))

(defn- bedrock-error-msg
  "Canonical, status-specific Bedrock error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      401 (tru "AWS Bedrock rejected our credentials or request signature")
      403 (tru "AWS Bedrock credentials lack permission for this model or action")
      404 (tru "AWS Bedrock model or endpoint is unavailable in the configured region")
      429 (tru "AWS Bedrock has rate limited us")
      500 (tru "AWS Bedrock is not working but not saying why")
      (tru "AWS Bedrock API error (HTTP {0})" status))))

(defn- bedrock-request
  "Perform a SigV4-signed HTTP request against the Bedrock mantle endpoint.
  `headers` are extra *unsigned* headers (e.g. `anthropic-version`). `credentials` is an optional
  AWS credentials map; when nil, the `llm-bedrock-*` settings are used. `ai-proxy?` is accepted
  for parity with the other provider adapters but is not supported: throws when true."
  [{:keys [method path body as headers credentials ai-proxy?]}]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [{:keys [region] :as creds} (ensure-credentials credentials)
        base-url     (str "https://bedrock-mantle." region ".api.aws")
        content-type (when body "application/json")
        sig-headers  (signed-headers (merge creds {:method       method
                                                   :url          (str base-url path)
                                                   :body         body
                                                   :content-type content-type}))
        auth         (core/resolve-auth "bedrock" "AWS Bedrock"
                                        {:url base-url :headers sig-headers}
                                        ai-proxy?)]
    (core/request auth
                  (cond-> {:method  method
                           :url     path
                           :headers headers}
                    as   (assoc :as as)
                    body (assoc :body body)))))

;;; ------------------------------------------------ Model listing ----------------------------------------------

(defn- list-all-models
  "Fetch the full mantle model catalog (`GET /v1/models`), every vendor included."
  [{:keys [credentials ai-proxy?]}]
  (try
    (let [res (bedrock-request {:method      :get
                                :path        "/v1/models"
                                :as          :json
                                :credentials credentials
                                :ai-proxy?   ai-proxy?})]
      (get-in res [:body :data]))
    (catch Exception e
      (core/rethrow-api-error! "bedrock" bedrock-error-msg e))))

(defn- supported-model?
  "Whether a catalog model is supported by this adapter: Anthropic and OpenAI models only.
  Excludes `anthropic.*fable*` pending further testing.
  Excludes `openai.gpt-oss*`, which appear in the catalog but are not invokable through the mantle /openai/v1 routes."
  [{:keys [id]}]
  (boolean
   (and id
        (or (and (str/starts-with? id "anthropic.")
                 (not (str/includes? id "fable")))
            (and (str/starts-with? id "openai.")
                 (not (str/starts-with? id "openai.gpt-oss")))))))

(defn list-models
  "List the Bedrock models supported by this adapter (see [[supported-model?]]).
  No-arg uses the `llm-bedrock-*` settings. The opts map supports `:credentials`, a map of `:access-key-id`,
  `:secret-access-key`, `:region`, and (for temporary credentials) `:session-token`, plus `:ai-proxy?`,
  which is not supported for Bedrock and throws when true."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (filter supported-model?)
                 (sort-by :id)
                 (mapv (fn [{:keys [id]}]
                         {:id id :display_name id})))}))

;;; --------------------------------------------- API family dispatch -------------------------------------------

(def ^:private default-model "anthropic.claude-opus-4-8")

(def ^:private anthropic-version "2023-06-01")

(defn- model->family
  "Which mantle API family serves `model`, by vendor prefix: `:anthropic` or `:openai`."
  [model]
  (cond
    (str/starts-with? model "anthropic.") :anthropic
    (str/starts-with? model "openai.")    :openai
    :else
    (throw (ex-info (tru "Unsupported Bedrock model {0}. Only anthropic.* and openai.* models are supported." model)
                    {:api-error  true
                     :error-code :unsupported-model
                     :model      model}))))

(defn ->mantle-anthropic-body
  "Adapt a canonical Anthropic Messages request body for the mantle endpoint.

  Bedrock mantle rejects the top-level `cache_control` key. Content-block-level `cache_control` markers are accepted
  and left alone."
  [body]
  (dissoc body :cache_control))

(mu/defn bedrock-raw
  "Perform a streaming request to the Bedrock mantle endpoint.
  `:ai-proxy?` is not supported for Bedrock and throws when true."
  [{:keys [model input tools ai-proxy?] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (let [opts   (assoc opts :model model)
        family (model->family model)
        {:keys [path headers req]}
        (case family
          :anthropic {:path    "/anthropic/v1/messages"
                      :headers {"anthropic-version" anthropic-version}
                      :req     (->mantle-anthropic-body (claude/claude-request-body opts))}
          :openai    {:path    "/openai/v1/responses"
                      :req     (openai/openai-request-body opts)})]
    (with-span :info {:name       :metabot.bedrock/request
                      :model      model
                      :family     family
                      :msg-count  (count input)
                      :tool-count (count tools)}
      (try
        (let [response (bedrock-request {:method    :post
                                         :path      path
                                         :as        :stream
                                         :headers   headers
                                         :body      (json/encode req)
                                         :ai-proxy? ai-proxy?})]
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "bedrock"
                                     :model    model
                                     :url      path
                                     :request  req})))
        (catch Exception e
          (core/rethrow-api-error! "bedrock" bedrock-error-msg e))))))

(defn- model->aisdk-chunks-xf
  "The SSE->AISDK translating transducer for a Bedrock model id.
  Claude's for `anthropic.*` models, OpenAI's for `openai.*` models."
  [model]
  (case (model->family model)
    :anthropic (claude/claude->aisdk-chunks-xf)
    :openai    (openai/openai->aisdk-chunks-xf)))

(defn bedrock
  "Call AWS Bedrock (mantle endpoint), return AISDK stream."
  [& [{:keys [model] :or {model default-model}} :as args]]
  (let [raw (apply bedrock-raw args)]
    (eduction (model->aisdk-chunks-xf model) raw)))
