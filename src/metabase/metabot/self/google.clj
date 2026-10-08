(ns metabase.metabot.self.google
  "Google Gemini Enterprise Agent Platform (formerly Vertex AI) provider.

  This namespace handles credentials, endpoint URLs, HTTP calls, error translation, and connect-time model validation.
  Wire-format translation is in [[metabase.metabot.self.google.stream-generate-content]],
  [[metabase.metabot.self.google.raw-predict]] and, for Model Garden endpoints, [[metabase.metabot.self.vllm]].

  Like openrouter and azure, models for this provider must specify the sub-provider in the `llm-metabot-provider`
  setting. For example `MB_LLM_METABOT_PROVIDER=google/google/gemini-3.6-flash`. Gemini models are served by
  `streamGenerateContent`; Anthropic partner models (e.g. `google/anthropic/claude-sonnet-4-6`) are served by
  `streamRawPredict`, whose payload is Anthropic's Messages API. An open model deployed from Model Garden is named by
  the endpoint the deployment created (e.g. `google/endpoints/1234567890123456789`) and served by that endpoint's
  `chat/completions` route, whose payload is the OpenAI-compatible Chat Completions API of the vLLM or SGLang server
  behind it.

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
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.google.models :as models]
   [metabase.metabot.self.google.raw-predict :as raw-predict]
   [metabase.metabot.self.google.stream-generate-content :as stream-generate-content]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.memoize :as u.memoize])
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

(def ^:private google-token-uris
  "The complete `token_uri` values a service account key may carry: Google's current OAuth token endpoint and the
  legacy one older keys still name. Whole URIs rather than hosts, because the transport posts whatever the key
  says: a port, a query string, or another path on the same origin is not one of these endpoints."
  #{"https://oauth2.googleapis.com/token"
    "https://accounts.google.com/o/oauth2/token"})

(defn- check-token-uri!
  "Refuse a key whose `token_uri` is not one of Google's.
  The credential library posts to that URL to mint an access token, before any request our own network policy
  guards, so an admin-supplied key could otherwise point it at an internal host."
  [^ServiceAccountCredentials creds]
  (let [uri (.getTokenServerUri creds)]
    (when-not (contains? google-token-uris (u/lower-case-en (str uri)))
      (throw (ex-info (tru "Invalid Google service account key: token_uri must be a Google OAuth endpoint.")
                      {:api-error   true
                       :status-code 400
                       :error-code  :invalid-service-account-key})))))

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
    (check-token-uri! creds)
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

(defn- auth-method
  "Which credential a connection authenticates with, or nil when it carries neither.
  A service account key has precedence over an OAuth access token."
  [{:keys [service-account-key oauth-access-token]}]
  (cond
    (not-empty service-account-key) :service-account
    (not-empty oauth-access-token)  :oauth-token))

(defn- resolve-credentials
  "Resolve a connection's credentials into the form the rest of this namespace reads: blanks removed, and the
  project ID derived from the service account key when the admin did not set one.

  Google is the one provider whose *request path* is built from its credentials — the project and the location are
  URL segments (see [[model-resource-path]]) — so resolution happens before a request is composed rather than inside
  [[google-auth]]. Idempotent, so re-resolving an already-resolved map is harmless."
  [credentials]
  ;; blank credentials count as absent — the environment can hand a setting an empty string, and one credential
  ;; left blank must not shadow the other or the project ID a service account key carries
  (let [creds      (merge credentials
                          {:service-account-key (u/trimmed-string (:service-account-key credentials))
                           :oauth-access-token  (u/trimmed-string (:oauth-access-token credentials))
                           :project-id          (u/trimmed-string (:project-id credentials))})
        project-id (or (:project-id creds)
                       (some-> (:service-account-key creds)
                               cached-service-account-credentials
                               service-account-project-id))]
    ;; a connection with no credential at all fails here rather than several steps later: the project and the
    ;; location are URL segments, so without this the missing project ID would be reported before the missing
    ;; credential that was the actual problem
    (when-not (auth-method creds)
      (throw (core/missing-api-key-ex "Google")))
    (when-not project-id
      (throw (ex-info (tru "A Google Cloud project ID is required for the Google provider")
                      {:api-error   true
                       :status-code 400
                       :error-code  :project-id-required})))
    (assoc creds :project-id project-id)))

(defn- google-auth
  "Google's `:auth`. Reads the host from the credentials: the API host has to agree with the location, so it is not a
  fixed base URL the way it is for every other provider.

  Resolves them itself rather than trusting the caller to have done it. [[resolve-credentials]] is idempotent and the
  service-account parse is cached, so the [[adapter/request!]] callers that resolve first pay nothing, and the chat
  path can hand over the raw map — which is what puts a missing credential, a bad project ID or a malformed key
  inside the request span. Because resolution raises the missing-credential error itself, [[core/resolve-auth]] never
  reaches its own `missing-api-key-ex` branch here."
  [{:keys [slug display-name]} {:keys [credentials ai-proxy?]}]
  (let [credentials (resolve-credentials credentials)]
    (core/resolve-auth slug display-name
                       (when-let [method (auth-method credentials)]
                         {:url     (api-base-url credentials)
                          :headers (case method
                                     :service-account (fresh-bearer-headers
                                                       (cached-service-account-credentials
                                                        (:service-account-key credentials)))
                                     :oauth-token     (oauth-bearer-headers (:oauth-access-token credentials)))})
                       ai-proxy?)))

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
  "Returns the URL path to the project's location resource in API version `api-version`.
  This is the parent of every resource that we call."
  [credentials api-version]
  (format "/%s/projects/%s/locations/%s"
          api-version (effective-project-id credentials) (effective-location credentials)))

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
  "Map from supported model publishers to their API format.
  `endpoints` is not a publisher but the resource collection a Model Garden deployment lands in, so a model reads as
  the tail of its endpoint's resource name."
  {"google"    :google
   "anthropic" :anthropic
   "endpoints" :chat-completions})

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
               (ex-info (tru "Unsupported Google model {0}. Only google/*, anthropic/* and endpoints/* models are supported."
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

(defn reasoning-model?
  "Whether a publisher-qualified `model` streams its reasoning back to us.

  A Model Garden endpoint serves whatever the admin deployed on it, which its name does not say, so it answers false.
  Answers false for a model this adapter cannot serve rather than throwing the way [[model->family]] does: the
  `llm-metabot-supports-reasoning?` setting reads this, and a provider setting Metabot cannot use must not take the
  public settings endpoint down with it. The request path rejects the same model soon enough."
  [model]
  (case (model-families (model-publisher model))
    :anthropic        (raw-predict/reasoning-model? (model-id model))
    :google           (stream-generate-content/reasoning-model? model)
    :chat-completions false
    false))

(mu/defn streams-reasoning? :- :boolean
  "Registry capability. Google answers from the model name, per wire family."
  [{:keys [model]} :- adapter/ResolvedRef]
  (reasoning-model? model))

(mu/defn context-window-tokens :- [:maybe :int]
  "The input context window for a publisher-qualified `model`, or nil when it isn't one we know.

  Gemini windows come from the [[models/catalog]], the same rows that drive the reasoning gate. A Model Garden
  endpoint's window is whatever the admin deployed with, so it is not known here.
  Answers nil for a model this adapter cannot serve rather than throwing the way [[model->family]] does, for the
  same reason [[reasoning-model?]] does."
  [model :- [:maybe :string]]
  (case (model-families (model-publisher model))
    :anthropic        (raw-predict/context-window-tokens (model-id model))
    :google           (get-in models/catalog [model :context-window])
    :chat-completions nil
    nil))

(defn- model-resource-path
  "Returns the URL path to a publisher model or endpoint resource, without the `:method` verb at the end.
  The `model` must include its `{publisher}/{model}` qualifier, e.g. `google/gemini-3.5-flash` or
  `endpoints/1234567890123456789`. The path is in API version `v1` unless `api-version` names another.

  Both segments become path segments of the request URL, so a character that does not belong in one is rejected here.
  [[model->family]] has already settled the publisher by this point; the model ID is still free text."
  [credentials model & {:keys [api-version] :or {api-version "v1"}}]
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
    (if (= :chat-completions (model-families publisher))
      (format "%s/endpoints/%s" (location-path credentials api-version) model-id)
      (format "%s/publishers/%s/models/%s" (location-path credentials api-version) publisher model-id))))

(defn- chat-completions-path
  "Returns the URL path of the `chat/completions` route of the endpoint `model` names.
  Google defines the route in `v1beta1` only, while the endpoint resource itself is read from `v1`."
  [credentials model]
  (str (model-resource-path credentials model :api-version "v1beta1") "/chat/completions"))

(def ^:private provider
  "Google is the only adapter whose request path is derived from its credentials rather than fixed, so the path it
  hands [[adapter/stream!]] is a thunk and [[google-auth]] resolves the credentials itself (see
  [[resolve-credentials]]) — both inside the request span."
  (adapter/provider
   {:slug              "google"
    :display-name      "Google"
    :auth              google-auth
    :error-fallback    #(tru "Google API error (HTTP {0})" %)
    :errors            {400 #(tru "Google API rejected the request as invalid")
                        401 #(tru "Google API credentials expired or invalid")
                        403 #(tru "Google API credentials have insufficient permissions or the API is not enabled for this project")
                        404 #(tru "Google API endpoint is unavailable or the model was not found")
                        429 #(tru "Google API has rate limited us")
                        500 #(tru "Google API returned an internal server error")
                        501 #(tru "Google API is not available in this location")
                        503 #(tru "Google API is temporarily unavailable")}}))

(defn- fetch-endpoint
  "Returns the Endpoint resource at `endpoint-path`.
  https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/projects.locations.endpoints/get"
  [credentials endpoint-path]
  (:body (adapter/request! provider {:method      :get
                                     :path        endpoint-path
                                     :as          :json
                                     :credentials credentials})))

(defn- admin-base-url
  "Returns the base URL the admin set outright, say a proxy, or nil when the connection uses Google's own hosts."
  [{:keys [base-url] :as credentials}]
  (when-let [configured (not-empty base-url)]
    (when-not (#{llm/google-global-api-base-url (location-host (effective-location credentials))} configured)
      configured)))

(defn- endpoint-host
  "Returns the host that serves requests to the endpoint whose resource is `endpoint`.

  A dedicated endpoint answers only on the DNS name its resource reports; the shared regional host refuses it.
  Google's reference spells that name with a scheme and its samples without one, so either is accepted. A base URL
  the admin set outright is kept, as it is for every other route: only Google's own hosts are looked past. A shared
  endpoint is served by the location's host."
  [credentials endpoint]
  (let [dns (not-empty (:dedicatedEndpointDns endpoint))]
    (or (admin-base-url credentials)
        (when dns (str "https://" (str/replace-first dns #"^https://" "")))
        (api-base-url credentials))))

(defn- lookup-endpoint-host
  "Reads the endpoint at `endpoint-path` with `credentials` and returns its [[endpoint-host]]."
  [credentials endpoint-path]
  (endpoint-host credentials (fetch-endpoint credentials endpoint-path)))

(def ^:private cached-endpoint-host
  "Bounded memoization of [[lookup-endpoint-host]].
  Cached so that the endpoint resource is read once per connection and endpoint, and not once per request. The
  connection's credentials are the key, which a refreshed access token does not change."
  (u.memoize/bounded #'lookup-endpoint-host :bounded/threshold 8))

(defn- endpoint-auth
  "Google's `:auth` for a request to the Model Garden endpoint `model` names: [[google-auth]], sent to the host that
  serves the endpoint. The host is looked up here, inside the request span like the credentials, and recorded in the
  volatile `host` for errors to name."
  [model host]
  (fn [p {:keys [credentials] :as req}]
    (let [credentials (resolve-credentials credentials)]
      (assoc (google-auth p req)
             :url (vreset! host (cached-endpoint-host credentials (model-resource-path credentials model)))))))

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
  "The `res->message` callback for [[core/rethrow-api-error!]] and [[adapter/stream!]]'s `:error-msg`.

  Wraps the descriptor's own message rather than restating it: a status whose message should name the host it was
  sent to (see [[include-endpoint-in-msg?]]) gets the endpoint appended, and the endpoint is known only per
  connection, which is why this cannot live on the descriptor. The message names `host` when given, and
  [[api-base-url]] otherwise."
  [credentials host]
  (let [endpoint (delay (or host (try (api-base-url credentials) (catch Exception _ nil))))]
    (fn [res]
      (cond-> ((:error-msg provider) res)
        (and (include-endpoint-in-msg? (:status res)) @endpoint)
        (str " " (tru "(endpoint: {0})" @endpoint))))))

(defn- rethrow-google-api-error!
  "Rethrows a Google HTTP exception like [[core/rethrow-api-error!]], with two changes:

  - For a status that satisfies [[include-endpoint-in-msg?]], the message includes the endpoint URL.
  - For 404s include a hint to check that the provided location is correct.

  `host` is the host an endpoint's resource named, for a request that failed there. The message names it, and there is
  no hint, since the resource resolved in that location. An exception that is already translated is left as it is."
  [credentials host e]
  (let [data     (ex-data e)
        location (:location credentials)
        known?   (conj multi-region-locations global-location)]
    (core/rethrow-api-error!
     (:slug provider)
     (google-res->msg credentials host)
     (if (and location
              (not host)
              (not (:api-error data))
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
  [credentials model]
  (adapter/request! provider {:method      :post
                              :path        (str (model-resource-path credentials model) ":countTokens")
                              :body        (json/encode count-tokens-probe-body)
                              :credentials credentials}))

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
  [credentials model]
  (try
    (adapter/request! provider {:method      :post
                                :path        (str (model-resource-path credentials model) raw-predict-method)
                                :body        "{}"
                                :credentials credentials})
    (catch Exception e
      (let [{:keys [status body]} (ex-data e)]
        (when-not (and (= 400 status) (anthropic-error-body? body))
          (throw e))))))

(def ^:private endpoint-probe-body
  "The smallest Chat Completions request for the connect-time check of an endpoint: one token, no stream."
  {:model      ""
   :messages   [{:role "user" :content "hi"}]
   :max_tokens 1})

(defn- validate-endpoint-surface!
  "Validate `credentials` and `model` for a Model Garden endpoint.

  Read the endpoint resource, which is free and names the endpoint in the URL, so a 2xx proves the credential, the
  project, the location and the endpoint all resolve. An endpoint still resolves after its model is undeployed, which
  is how its compute is stopped, so that is checked as well.

  Reading the resource takes only `aiplatform.endpoints.get`, which a viewer role carries without
  `aiplatform.endpoints.predict`, so with `probe?` a one-token completion on the route conversations use, on the host
  they use, is what proves the credential can run one. Without `probe?` nothing is generated."
  [credentials model probe?]
  (let [endpoint (fetch-endpoint credentials (model-resource-path credentials model))]
    (when (empty? (:deployedModels endpoint))
      (throw (ex-info (tru "Nothing is deployed on Google endpoint {0}" (pr-str (model-id model)))
                      {:api-error   true
                       :status-code 400
                       :error-code  :endpoint-has-no-model})))
    (when probe?
      (let [host (endpoint-host credentials endpoint)]
        (try
          (adapter/request! provider {:method      :post
                                      :path        (chat-completions-path credentials model)
                                      :body        (json/encode endpoint-probe-body)
                                      :credentials (assoc credentials :base-url host)})
          (catch Exception e
            (rethrow-google-api-error! credentials host e)))))))

(defn- validate-model!
  "Validates `model` against the surface that serves it, and discards the response."
  [credentials model probe?]
  (case (model->family model)
    :anthropic        (validate-anthropic-surface! credentials model)
    :google           (validate-google-surface! credentials model)
    :chat-completions (validate-endpoint-surface! credentials model probe?))
  nil)

(mu/defn list-models :- adapter/ModelListing
  "Validates the Google credentials and the candidate model with a probe, and returns an empty model list.

  Similar to the Azure provider, there is no list-models call that we can use to whitelist models for the Gemini
  Enterprise Agent Platform. An endpoint does exist, but it sometimes returns models that are not really available and
  sometimes omits models that are available, hence we can't rely on it. See
  https://github.com/googleapis/python-genai/issues/679

  `:probe?` reports the model the probe verified as `:connection-info` `:probed-model`, for the connect and edit paths
  to record on the connection and re-verify against later passing it in as the `proposed-model` on future attempts.
  For an endpoint it also runs a one-token completion, where a plain listing only reads the endpoint's resource."
  ([] (list-models {}))
  ([{:keys [credentials model proposed-model ai-proxy? probe?]} :- adapter/ListOpts]
   (adapter/reject-ai-proxy! provider ai-proxy?)
   (if-let [model (or (not-empty model) (not-empty proposed-model))]
     (do
       (try
         (validate-model! (resolve-credentials credentials) model probe?)
         (catch Exception e
           (rethrow-google-api-error! credentials nil e)))
       (cond-> {:models []}
         probe? (assoc :connection-info {:probed-model model})))
     {:models []})))

(mu/defn google-raw
  "Makes a streaming request to the Gemini Enterprise Agent Platform.
  Returns `[family stream]`, where `stream` is a reducible over raw events.
  Gemini models stream through `streamGenerateContent`; Anthropic partner models through `streamRawPredict`; Model
  Garden endpoints through their `chat/completions` route.
  `:ai-proxy?` is not supported and throws when it is true."
  [{:keys [model credentials] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (let [family (model->family model)
        opts   (assoc opts :model model)
        host   (volatile! nil)]
    [family
     (adapter/stream! (cond-> provider
                        (= :chat-completions family) (assoc :auth (endpoint-auth model host)))
                      opts
                      {;; a thunk, not a string: the project and the location are URL segments, so the path cannot be
                       ;; built until the credentials resolve, and that resolution is the only one in the fleet that
                       ;; can fail. [[adapter/stream!]] calls it inside the span and behind the proxy refusal, so a
                       ;; bad project ID lands on the trace and a proxied request still hears about the proxy first.
                       :path             #(let [credentials (resolve-credentials credentials)]
                                            (if (= :chat-completions family)
                                              (chat-completions-path credentials model)
                                              (str (model-resource-path credentials model)
                                                   (case family
                                                     :anthropic raw-predict-method
                                                     :google    generate-content-method))))
                       :body             (case family
                                           :anthropic        (raw-predict/request-body (model-id model) opts)
                                           ;; `opts` carries the defaulted model: the thinking directive keys off it
                                           :google           (stream-generate-content/request-body opts)
                                           ;; the endpoint serves one model, and Model Garden's OpenAI client samples
                                           ;; send an empty `model`
                                           :chat-completions (assoc (vllm/vllm-request-body opts) :model ""))
                       :span-attrs       {:family (name family)}
                       ;; both read only `:location`, which resolution does not touch, so the raw map serves and
                       ;; neither can mask a resolution failure with one of its own
                       :error-msg        #((google-res->msg credentials @host) %)
                       :on-request-error #(rethrow-google-api-error! credentials @host %)})]))

(defn google
  "Call the Gemini Enterprise Agent Platform, return AISDK stream."
  [& args]
  (let [[family raw] (apply google-raw args)]
    (eduction (case family
                :anthropic        (raw-predict/->aisdk-chunks-xf)
                :google           (stream-generate-content/->aisdk-chunks-xf)
                :chat-completions (vllm/vllm->aisdk-chunks-xf))
              raw)))
