(ns metabase.metabot.self.google
  "Google Gemini Enterprise Agent Platform (formerly Vertex AI) provider.

  This namespace handles credentials, endpoint URLs, HTTP calls, error translation, and connect-time model validation.
  Wire-format translation is in [[metabase.metabot.self.google.stream-generate-content]]
  and [[metabase.metabot.self.google.raw-predict]].

  Like openrouter and azure, models for this provider must specify the sub-provider in the `llm-metabot-provider`
  setting. For example `MB_LLM_METABOT_PROVIDER=google/google/gemini-3.6-flash`. Gemini models are served by
  `streamGenerateContent`; Anthropic partner models (e.g. `google/anthropic/claude-sonnet-4-6`) are served by
  `streamRawPredict`, whose payload is Anthropic's Messages API.

  Credentials can be supplied via either a service account key JSON or an OAuth access token.

  Service account key JSON is the same auth method supported by the BigQuery driver and should be preferred for
  production deployments. Short-lived OAuth access tokens can be generated via `gcloud auth print-access-token` and
  are useful for local testing. If both are configured, then the service account key is used.

  A project id is also required. This can either be extracted from the service account key JSON or provided
  explicitly by the connection (required when using an OAuth token).

  You can also specify which Google Cloud location requests should be served from. The default is `global`, but we
  also support the multi-region `us` and `eu` locations, as well as specific locations like `us-east1` or
  `europe-west2` etc.

  The effective endpoint URL depends on the connection's location, but the connection can also name one outright.
  See [[api-base-url]] for details."
  (:require
   [clojure.string :as str]
   [metabase.llm.provider :as llm.provider]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.google.raw-predict :as raw-predict]
   [metabase.metabot.self.google.stream-generate-content :as stream-generate-content]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.memoize :as u.memoize]
   [metabase.util.o11y :refer [with-span]])
  (:import
   (com.google.auth.oauth2 GoogleCredentials ServiceAccountCredentials)
   (java.io ByteArrayInputStream IOException)
   (java.nio.charset StandardCharsets)
   (java.util Collections)))

(set! *warn-on-reflection* true)

(def ^:private default-model
  "The model to use when the request does not name one."
  "google/gemini-3.5-flash")

;;; Auth / HTTP plumbing

(def ^:private cloud-platform-scope
  "The OAuth2 scope for access tokens made from the service account key.
  There is also a `cloud-platform.read-only` scope, but inference calls made with the read-only scope are rejected."
  "https://www.googleapis.com/auth/cloud-platform")

(defn- parse-service-account-credentials
  "Parses a service account key JSON string into scoped `ServiceAccountCredentials`."
  ^ServiceAccountCredentials [^String sa-key]
  (let [creds (try
                (GoogleCredentials/fromStream (ByteArrayInputStream. (.getBytes sa-key StandardCharsets/UTF_8)))
                (catch Exception e
                  (throw (ex-info (if-let [reason (not-empty (ex-message e))]
                                    (tru "Invalid Google service account key: {0}" reason)
                                    (tru "Invalid Google service account key"))
                                  {:api-error   true
                                   :status-code 400
                                   :error-code  :invalid-service-account-key}
                                  e))))]
    (when-not (instance? ServiceAccountCredentials creds)
      (throw (ex-info (tru "This Google credential JSON is not a service account key.")
                      {:api-error   true
                       :status-code 400
                       :error-code  :not-a-service-account-key})))
    (.createScoped ^ServiceAccountCredentials creds (Collections/singletonList cloud-platform-scope))))

(def ^:private cached-service-account-credentials
  "Bounded memoization of [[parse-service-account-credentials]]
  Cached so that we fetch an access token once per token lifetime (normally 1 hour), and not once per request."
  (u.memoize/bounded #'parse-service-account-credentials :bounded/threshold 8))

(defn- oauth-bearer-headers
  "Returns Bearer auth headers for an OAuth2 access token."
  [token]
  {"Authorization" (str "Bearer " token)})

(defn- fresh-bearer-headers
  "Returns an Authorization header with a current OAuth2 access token for `creds`.
  `refreshIfExpired` is thread-safe: it gives the cached token until it is near its expiry, then gets a new one."
  [^GoogleCredentials creds]
  (try
    (.refreshIfExpired creds)
    (oauth-bearer-headers (.getTokenValue (.getAccessToken creds)))
    (catch IOException e
      ;; :status-code 400 so that a connect attempt with e.g. a disabled service account surfaces the message as a
      ;; credentials error rather than a raw 500.
      (throw (ex-info (tru "Could not obtain a Google access token: {0}" (ex-message e))
                      {:api-error   true
                       :status-code 400
                       :error-code  :google-token-refresh-failed}
                      e)))))

(defn- service-account-project-id
  "Returns the project ID from a service account credential's key JSON."
  [^ServiceAccountCredentials creds]
  (not-empty (.getProjectId creds)))

(def ^:private global-location
  "The only location that Google's global endpoint serves.
  This is also the default location."
  "global")

(def ^:private multi-region-locations
  "The locations that a multi-region endpoint serves.
  They keep the data in the US or in the EU, across the regions of that jurisdiction. The regional
  `{location}-aiplatform` form is not an endpoint for them; their hosts have the form
  `https://aiplatform.{location}.rep.googleapis.com`.

  https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations"
  #{"us" "eu"})

(defn- effective-location
  "Returns the location for a credential's requests.
  If the credential does not set one, returns [[global-location]].
  Throws if [[metabase.llm.settings/valid-google-location?]] rejects `location`."
  [{:keys [location]}]
  (cond
    (nil? location)
    global-location

    (llm/valid-google-location? location)
    location

    :else
    (throw (ex-info (tru (str "\"{0}\" is not a valid Google Cloud location. Use a location ID like \"us-central1\", "
                              "or leave it blank to use the global location.")
                         location)
                    {:api-error   true
                     :status-code 400
                     :error-code  :invalid-location}))))

(defn- location-host
  "Returns the API host for a non-global `location`.
  Multi-region locations use the `rep` host. All other locations use the regional host."
  [location]
  (if (contains? multi-region-locations location)
    (format "https://aiplatform.%s.rep.googleapis.com" location)
    (format "https://%s-aiplatform.googleapis.com" location)))

(defn- api-base-url
  "Returns the base URL for requests in the location of `credentials`.

  The API host must agree with the location. The global host serves only `locations/global` and rejects all other
  locations. Thus a non-global location gets its host from [[location-host]], and the admin does not have to set a
  second setting. If the admin set a base URL, for example a proxy or a test double, this function returns it without
  a change."
  [{:keys [base-url] :as credentials}]
  (let [configured (or (not-empty base-url) llm/google-global-api-base-url)
        location   (effective-location credentials)]
    (if (and (not= location global-location)
             (= configured llm/google-global-api-base-url))
      (location-host location)
      configured)))

(defn- resolve-google-auth
  "Resolves the `{:auth {:url ... :headers ...} :credentials ...}` pair for a Google request.

  The credentials in the result are the resolved ones, so that callers can build resource paths from the project and
  the location. A service account key has precedence over an OAuth access token. Throws if no project ID resolves, or
  if `ai-proxy?` is true."
  [credentials ai-proxy?]
  (when ai-proxy?
    (throw (ex-info (tru "AI proxy is not supported for the Google provider")
                    {:api-error  true
                     :error-code :proxy-unsupported})))
  ;; blank credentials count as absent — the environment can hand a setting an empty string, and one credential
  ;; left blank must not shadow the other or the project ID a service account key carries
  (let [{:keys [service-account-key oauth-access-token project-id]
         :as   creds}      (merge credentials
                                  {:service-account-key (u/trimmed-string (:service-account-key credentials))
                                   :oauth-access-token  (u/trimmed-string (:oauth-access-token credentials))
                                   :project-id          (u/trimmed-string (:project-id credentials))})
        sa-creds    (when service-account-key
                      (cached-service-account-credentials service-account-key))
        project-id  (or project-id (some-> sa-creds service-account-project-id))
        auth-method (cond
                      sa-creds           :service-account
                      oauth-access-token :oauth-token)]
    (when (and auth-method (not project-id))
      (throw (ex-info (tru "A Google Cloud project ID is required for the Google provider")
                      {:api-error   true
                       :status-code 400
                       :error-code  :project-id-required})))
    {:auth        (core/resolve-auth "google" "Google"
                                     (when auth-method
                                       {:url     (api-base-url creds)
                                        :headers (case auth-method
                                                   :service-account (fresh-bearer-headers sa-creds)
                                                   :oauth-token     (oauth-bearer-headers oauth-access-token))})
                                     ai-proxy?)
     :credentials (assoc creds :project-id project-id)}))

(defn- effective-project-id
  "Returns the project ID for a credential's requests.
  Throws if [[metabase.llm.settings/valid-google-project-id?]] rejects it."
  [{:keys [project-id]}]
  (if (llm/valid-google-project-id? project-id)
    project-id
    (throw (ex-info (tru (str "\"{0}\" is not a valid Google Cloud project ID. Use the project ID — 6 to 30 lowercase "
                              "letters, digits and hyphens — rather than the project name or number.")
                         project-id)
                    {:api-error   true
                     :status-code 400
                     :error-code  :invalid-project-id}))))

(defn- location-path
  "Returns the URL path to the project's location resource.
  This is the parent of every resource that we call."
  [credentials]
  (format "/v1/projects/%s/locations/%s" (effective-project-id credentials) (effective-location credentials)))

(def ^:private max-model-segment-length
  "The longest publisher or model ID that belongs in a request path.
  Real IDs are far shorter; this only bounds what a mistyped setting can splice in."
  128)

(def ^:private publisher-pattern
  "Matches a publisher ID, e.g. `google` or `anthropic`."
  #"[a-z][a-z0-9-]*")

(def ^:private model-id-pattern
  "Matches a publisher model ID, e.g. `gemini-3.5-flash` or `claude-sonnet-4-5@20250929`."
  #"[a-zA-Z0-9][a-zA-Z0-9._@-]*")

(defn- valid-model-segment?
  "True if `segment` is a path segment that `pattern` accepts and that is short enough to be one."
  [pattern segment]
  (boolean (and (string? segment)
                (<= (count segment) max-model-segment-length)
                (re-matches pattern segment))))

(defn- model-publisher
  "The publisher segment of a publisher-qualified model ID, e.g. `google` or `anthropic`."
  [model]
  (llm.provider/model-ref->connection-key model))

(defn- model-id
  "The model segment of a publisher-qualified model ID, or nil when there is none."
  [model]
  (llm.provider/model-ref->model model))

(def ^:private model-families
  "Map from supported model publishers to their API format."
  {"google"    :google
   "anthropic" :anthropic})

(def model-publishers
  "The publishers whose models this adapter serves."
  (set (keys model-families)))

(defn- unqualified-model-ex
  "The error for a `model` that does not name both a publisher and a model."
  [model]
  (ex-info (tru "Invalid Google model {0} — expected a publisher-qualified ID like \"google/gemini-3.5-flash\""
                (pr-str model))
           {:api-error   true
            :status-code 400
            :error-code  :invalid-model}))

(defn- model->family
  "Return the model family for the given `model`.
  Throws for a publisher this adapter cannot speak to."
  [model]
  (or (model-families (model-publisher model))
      (throw (if (str/blank? (model-id model))
               (unqualified-model-ex model)
               (ex-info (tru "Unsupported Google model {0}. Only google/* and anthropic/* models are supported."
                             (pr-str model))
                        {:api-error   true
                         :status-code 400
                         :error-code  :unsupported-model
                         :model       model})))))

(def ^:private raw-predict-method
  "The verb that serves Anthropic partner models."
  ":streamRawPredict")

(def ^:private generate-content-method
  "The verb that serves Gemini models, asking for its stream as SSE rather than a JSON array."
  ":streamGenerateContent?alt=sse")

(def ^:private gemini-context-windows
  "Input context windows for known Google Gemini models, keyed by publisher-qualified model id.
  Values:
  - https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash
  - https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-6-flash
  - https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-7-flash"
  {"google/gemini-3.5-flash" 1048576
   "google/gemini-3.6-flash" 1048576
   "google/gemini-3.7-flash" 1048576})

(defn reasoning-model?
  "Whether a publisher-qualified `model` streams its reasoning back to us.

  Answers false for a model this adapter cannot serve rather than throwing the way [[model->family]] does: the
  `llm-metabot-supports-reasoning?` setting reads this, and a provider setting Metabot cannot use must not take the
  public settings endpoint down with it. The request path rejects the same model soon enough."
  [model]
  (case (model-families (model-publisher model))
    :anthropic (raw-predict/reasoning-model? (model-id model))
    :google    (stream-generate-content/reasoning-model? model)
    false))

(defn context-window-tokens
  "The input context window for a publisher-qualified `model`, or nil when it isn't one we know.

  Answers nil for a model this adapter cannot serve rather than throwing the way [[model->family]] does, for the
  same reason [[reasoning-model?]] does."
  [model]
  (case (model-families (model-publisher model))
    :anthropic (raw-predict/context-window-tokens (model-id model))
    :google    (get gemini-context-windows model)
    nil))

(defn- model-resource-path
  "Returns the URL path to a publisher model resource, without the `:method` verb at the end.
  The `model` must include its `{publisher}/{model}` qualifier, e.g. `google/gemini-3.5-flash`.

  Both segments become path segments of the request URL, so a character that does not belong in one is rejected here.
  [[model->family]] has already settled the publisher by this point; the model ID is still free text."
  [credentials model]
  (let [publisher (model-publisher model)
        model-id  (model-id model)]
    (when (str/blank? model-id)
      (throw (unqualified-model-ex model)))
    (when-not (and (valid-model-segment? publisher-pattern publisher)
                   (valid-model-segment? model-id-pattern model-id))
      (throw (ex-info (tru (str "Invalid Google model {0} — a publisher and model ID can hold only letters, digits, "
                                "and the characters \".\", \"_\", \"-\" and \"@\"")
                           (pr-str model))
                      {:api-error   true
                       :status-code 400
                       :error-code  :invalid-model})))
    (format "%s/publishers/%s/models/%s" (location-path credentials) publisher model-id)))

(defn- google-error-msg
  "Returns the Google API error message for the status of `res`."
  [res]
  (let [status (long (:status res 0))]
    (case status
      400 (tru "Google API rejected the request as invalid")
      401 (tru "Google API credentials expired or invalid")
      403 (tru "Google API credentials have insufficient permissions or the API is not enabled for this project")
      404 (tru "Google API endpoint is unavailable or the model was not found")
      429 (tru "Google API has rate limited us")
      500 (tru "Google API returned an internal server error")
      501 (tru "Google API is not available in this location")
      503 (tru "Google API is temporarily unavailable")
      (tru "Google API error (HTTP {0})" status))))

(defn- json-content?
  "Returns true if an HTTP response has a JSON content type."
  [{:keys [headers]}]
  (str/includes? (str (or (get headers "content-type") (get headers "Content-Type")))
                 "application/json"))

(defn- include-endpoint-in-msg?
  "Should an error with the given `status` include the endpoint URL in its error message?"
  [status]
  ;; A 404 means that this location does not serve the model, or that the host is not an endpoint. A 501 means that
  ;; the API is not available in this location.
  (contains? #{404 501} status))

(defn- google-res->msg
  "The `res->message` callback for [[core/rethrow-api-error!]] and [[core/reducible-with-api-errors]]."
  [credentials]
  (let [endpoint (delay (try (api-base-url credentials) (catch Exception _ nil)))]
    (fn [res]
      (cond-> (google-error-msg res)
        (and (include-endpoint-in-msg? (:status res)) @endpoint)
        (str " " (tru "(endpoint: {0})" @endpoint))))))

(defn- rethrow-google-api-error!
  "Rethrows a Google HTTP exception like [[core/rethrow-api-error!]], with two changes:

  - For a status that satisfies [[include-endpoint-in-msg?]], the message includes the endpoint URL.
  - For 404s include a hint to check that the provided location is correct."
  [credentials e]
  (let [data     (ex-data e)
        location (:location credentials)
        known?   (conj multi-region-locations global-location)]
    (core/rethrow-api-error!
     "google"
     (google-res->msg credentials)
     (if (and location
              (= 404 (:status data))
              (not (known? location))
              (not (json-content? data)))
       ;; A wrong location gives a host that is not an API endpoint, hence the 404 check. If the body is json it
       ;; usually contains a helpful error message (e.g. model not served by this endpoint), whereas an html body is
       ;; usually a generic 404 message with html boilerplate that looks ugly and gets truncated when displayed to the
       ;; user. Replace it with a hint to check that the location is valid.
       (ex-info (ex-message e)
                (assoc data :body (str (tru "check that \"{0}\" is a valid location" location)))
                e)
       e))))

(def ^:private count-tokens-probe-body
  "The smallest `countTokens` request body for the connect-time probe."
  {:contents [{:role "user" :parts [{:text "hi"}]}]})

(defn- validate-google-surface!
  "Validate `credentials` and `model` for a google model.

  Round-trip a Gemini model's `countTokens` route, which is free and names the model in the URL, so a 2xx proves the
  credential, the project, the location, and the model all resolve.

  https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/projects.locations.publishers.models/countTokens"
  [auth credentials model]
  (core/request auth
                {:method  :post
                 :url     (str (model-resource-path credentials model) ":countTokens")
                 :headers {"Content-Type" "application/json"}
                 :body    (json/encode count-tokens-probe-body)}))

(defn- anthropic-error-body?
  "Whether an error `body` shape matches an Anthropic error rather than Google's.

  Anthropic: `{\"type\": \"error\", \"error\": {...}}`
  Google:    `{\"error\": {\"code\": ..., \"status\": ...}}`"
  [body]
  (= "error" (:type (try (json/decode+kw body) (catch Exception _ nil)))))

(defn- validate-anthropic-surface!
  "Validate `credentials` and `model` for an Anthropic model.

  Round-trip an Anthropic partner model's `streamRawPredict` route with an empty body in order to check whether the
  provided credentials and model are valid without consuming any tokens. This is similar to the approach taken by the
  azure provider in [[metabase.metabot.self.azure/validate-anthropic-surface!]].

  Google resolves the credential, the project, the location, and the model from the URL before it hands the body to
  Anthropic, so a reply matching Anthropic's error shape proves all four while spending no tokens. Anything Google
  answers itself is rethrown: a 404 for a model this project or location cannot reach, a 403 for a publisher whose
  data-sharing terms are not accepted, a 401 for a stale credential.

  We do not use Anthropic's count-tokens endpoint here because, unlike the corresponding :countTokens for Gemini
  models, Anthropic's count-tokens will accept any valid anthropic model, even ones that are not actually available in
  the given location.

  Unlike [[metabase.metabot.self.azure/validate-anthropic-surface!]], the status code alone cannot settle it. Google
  rejects a model that the location does not serve with a `400 FAILED_PRECONDITION` of its own — the same status
  Anthropic uses for the validation error that means the model *is* servable."
  [auth credentials model]
  (try
    (core/request auth
                  {:method  :post
                   :url     (str (model-resource-path credentials model) raw-predict-method)
                   :headers {"Content-Type" "application/json"}
                   :body    "{}"})
    (catch Exception e
      (let [{:keys [status body]} (ex-data e)]
        (when-not (and (= 400 status) (anthropic-error-body? body))
          (throw e))))))

(defn- validate-model!
  "Validates `model` against the surface that serves it, and discards the response."
  [auth credentials model]
  (case (model->family model)
    :anthropic (validate-anthropic-surface! auth credentials model)
    :google    (validate-google-surface! auth credentials model))
  nil)

(defn list-models
  "Validates the Google credentials and the candidate model with a probe, and returns an empty model list.

  Similar to the Azure provider, there is no list-models call that we can use to whitelist models for the Gemini
  Enterprise Agent Platform. An endpoint does exist, but it sometimes returns models that are not really available and
  sometimes omits models that are available, hence we can't rely on it. See
  https://github.com/googleapis/python-genai/issues/679

  `:probe?` reports the model the probe verified as `:learned-config` `:probed-model`, for the connect and edit paths
  to record on the connection and re-verify against later passing it in as the `proposed-model` on future attempts."
  ([] (list-models {}))
  ([{:keys [credentials model proposed-model ai-proxy? probe?]}]
   (if-let [model (or (not-empty model) (not-empty proposed-model))]
     (do
       (try
         (let [{:keys [auth credentials]} (resolve-google-auth credentials ai-proxy?)]
           (validate-model! auth credentials model))
         (catch Exception e
           (rethrow-google-api-error! credentials e)))
       (cond-> {:models []}
         probe? (assoc :learned-config {:probed-model model})))
     {:models []})))

(mu/defn google-raw
  "Makes a streaming request to the Gemini Enterprise Agent Platform.
  Gemini models stream through `streamGenerateContent`; Anthropic partner models through `streamRawPredict`.
  `:ai-proxy?` is not supported and throws when it is true."
  [{:keys [model input tools credentials ai-proxy?] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (let [family   (model->family model)
        req      (case family
                   :anthropic (raw-predict/request-body (model-id model) opts)
                   ;; pass the defaulted model down: the thinking directive keys off it
                   :google    (stream-generate-content/request-body (assoc opts :model model)))
        method   (case family
                   :anthropic raw-predict-method
                   :google    generate-content-method)
        res->msg (google-res->msg credentials)]
    (with-span :info {:name       :metabot.google/request
                      :model      model
                      :msg-count  (count input)
                      :tool-count (count tools)}
      (try
        (let [{:keys [auth credentials]} (resolve-google-auth credentials ai-proxy?)
              url      (str (model-resource-path credentials model) method)
              response (core/request auth
                                     {:method  :post
                                      :url     url
                                      :as      :stream
                                      :headers {"Content-Type" "application/json"}
                                      :body    (json/encode req)})]
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "google"
                                     :model    model
                                     :url      url
                                     :request  req})
              (core/reducible-with-api-errors "google" res->msg)))
        (catch Exception e
          (rethrow-google-api-error! credentials e))))))

(defn google
  "Call the Gemini Enterprise Agent Platform, return AISDK stream."
  [& args]
  (let [{:keys [model] :or {model default-model}} (first args)
        raw (apply google-raw args)]
    ;; Keep this dispatch in sync with `google-raw`, which independently uses
    ;; `model->family` to select the request protocol.
    (eduction (case (model->family model)
                :anthropic (raw-predict/->aisdk-chunks-xf)
                :google    (stream-generate-content/->aisdk-chunks-xf))
              raw)))
