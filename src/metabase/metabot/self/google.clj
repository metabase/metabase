(ns metabase.metabot.self.google
  "Google Gemini Enterprise Agent Platform (formerly Vertex AI) provider.

  Owns everything provider-level — credentials, endpoint URLs, the HTTP calls, error translation,
  and the supported-model catalog. Wire-format translation lives in protocol namespaces under
  `metabase.metabot.self.google.*`; today that is only
  [[metabase.metabot.self.google.stream-generate-content]] (Gemini models). The platform also
  serves Anthropic models via `streamRawPredict` and open-weight models via an OpenAI-compatible
  Chat Completions surface; when those land, [[google-raw]] becomes the model→protocol dispatch
  point and they share the auth/URL plumbing here.

  Auth is a Google Cloud API key sent as `x-goog-api-key`, or a pasted OAuth2 access token (e.g.
  `gcloud auth print-access-token`) sent as a Bearer token — see [[credential-headers]]. Either
  way, requests are scoped to a Google Cloud project: the project ID is required (the platform's
  projectless express mode is deliberately not supported), the location optional (default
  `global`). Proper service-account and application-default-credentials auth (self-refreshing
  tokens) are future work."
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.google.stream-generate-content :as sgc]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(def ^:private default-model
  "Fallback model when the request doesn't carry one."
  "gemini-3.5-flash")

(def ^:private supported-models
  "Gemini chat models offered in the Metabot model picker, in picker order (newest first).
  `list-models` returns the intersection of this list with the project's
  `projects.locations.models/list` catalog. A model ID may carry a publisher qualifier
  (e.g. `google/gemini-3.1-pro-preview`) — see [[model-resource-path]]."
  [["gemini-3.6-flash"              "Gemini 3.6 Flash"]
   ["gemini-3.5-flash"              "Gemini 3.5 Flash"]
   ["google/gemini-3.1-pro-preview" "Gemini 3.1 Pro Preview"]])

;;; Auth / HTTP plumbing

(defn- settings-credentials
  "Google credentials from the `llm-google-*` settings."
  []
  {:api-key    (not-empty (llm/llm-google-api-key))
   :project-id (not-empty (llm/llm-google-project-id))
   :location   (not-empty (llm/llm-google-location))})

(defn- api-key?
  "Whether a credential string is a Google Cloud API key (they all carry the `AIza` prefix)."
  [credential]
  (str/starts-with? credential "AIza"))

(defn- credential-headers
  "Auth headers for a Google credential. API keys travel in `x-goog-api-key`; anything else is
  treated as an OAuth2 access token (e.g. `gcloud auth print-access-token` output, pasted by the
  admin) and sent as a Bearer token — Google rejects an API key in the Bearer header and vice
  versa, so the two schemes cannot share one header."
  [credential]
  (if (api-key? credential)
    {"x-goog-api-key" credential}
    {"Authorization" (str "Bearer " credential)}))

(defn- resolve-google-auth
  "Resolve the `{:auth {:url ... :headers ...} :credentials ...}` pair for a Google request.
  Falls back to [[settings-credentials]] when `credentials` is nil; the returned credentials map is
  the resolved one, so callers can build resource paths from its project/location. Throws when a
  credential is configured without a project ID — every request is project-scoped. `:ai-proxy?` is
  not supported and throws when true (it is accepted only for parity with the other adapters)."
  [credentials ai-proxy?]
  (when ai-proxy?
    (throw (ex-info (tru "AI proxy is not supported for the Google provider")
                    {:api-error  true
                     :error-code :proxy-unsupported})))
  (let [{:keys [api-key project-id] :as creds} (or credentials (settings-credentials))]
    (when (and api-key (not project-id))
      (throw (ex-info (tru "A Google Cloud project ID is required for the Google provider")
                      {:api-error  true
                       :error-code :project-id-required})))
    {:auth        (core/resolve-auth "google" "Google"
                                     (when api-key
                                       {:url     (llm/llm-google-api-base-url)
                                        :headers (credential-headers api-key)})
                                     ai-proxy?)
     :credentials creds}))

(defn- location-path
  "URL path to the project's location resource, the parent of every resource we call."
  [{:keys [project-id location]}]
  (format "/v1/projects/%s/locations/%s" project-id (or location "global")))

(defn- model-resource-path
  "URL path to a publisher model resource, without the trailing `:method` verb.
  A model ID may carry an explicit publisher qualifier (`{publisher}/{model}`, e.g.
  `google/gemini-3.1-pro-preview`, matching the ID the catalog lists it under); a bare ID
  defaults to the `google` publisher."
  [credentials model]
  (let [[publisher model] (if (str/includes? model "/")
                            (str/split model #"/" 2)
                            ["google" model])]
    (format "%s/publishers/%s/models/%s" (location-path credentials) publisher model)))

(defn- google-error-msg
  "Canonical, status-specific Google API error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      ;; Google reports an invalid API key as 400 INVALID_ARGUMENT, not 401
      400 (tru "Google API rejected the request — the API key may be invalid")
      401 (tru "Google API credentials expired or invalid")
      403 (tru "Google API key has insufficient permissions or the API is not enabled for this project")
      404 (tru "Google API endpoint is unavailable or the model was not found")
      429 (tru "Google API has rate limited us")
      500 (tru "Google API returned an internal server error")
      503 (tru "Google API is temporarily unavailable")
      (tru "Google API error (HTTP {0})" status))))

(defn- catalog-model-ids
  "The IDs of every model in the project's catalog, via `projects.locations.models/list`
  (following `nextPageToken` pagination).

  https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/projects.locations.models/list

  A model's ID is its resource name's tail after `/models/`, which may itself carry a publisher
  qualifier (e.g. `google/gemini-3.1-pro-preview`)."
  [auth credentials]
  (loop [ids #{} page-token nil]
    (let [res  (core/request auth
                             {:method       :get
                              :url          (str (location-path credentials) "/models")
                              :query-params (when page-token {"pageToken" page-token})})
          body (json/decode+kw (:body res))
          ids  (into ids
                     (keep #(second (str/split (str (:name %)) #"/models/" 2)))
                     (:models body))]
      (if-let [token (not-empty (:nextPageToken body))]
        (recur ids token)
        ids))))

(defn list-models
  "List the Gemini chat models supported by this adapter: the intersection of
  [[supported-models]] with the project's `projects.locations.models/list` catalog, in picker
  order. Doubles as the connect-time credential check — the list call proves the key, project,
  location, and base URL reach an authenticated surface. No-arg uses the configured settings.
  Opts map supports `:credentials` (`{:api-key ... :project-id ... :location ...}`) and
  `:ai-proxy?`; `:ai-proxy?` is not supported and throws when true."
  ([] (list-models {}))
  ([{:keys [credentials ai-proxy?]}]
   (try
     (let [{:keys [auth credentials]} (resolve-google-auth credentials ai-proxy?)
           available                  (catalog-model-ids auth credentials)]
       {:models (into []
                      (comp (filter (comp available first))
                            (map (fn [[id display-name]]
                                   {:id id :display_name display-name})))
                      supported-models)})
     (catch Exception e
       (core/rethrow-api-error! "google" google-error-msg e)))))

(mu/defn google-raw
  "Perform a streaming `streamGenerateContent` request to the Gemini Enterprise Agent Platform.

  All whitelisted models are Gemini models today; this is where model→protocol dispatch will live
  once the platform's other surfaces (Anthropic via `streamRawPredict`, open-weight models via Chat
  Completions) are supported. `:ai-proxy?` is not supported and throws when true."
  [{:keys [model input tools credentials ai-proxy?] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (let [req (sgc/request-body opts)]
    (with-span :info {:name       :metabot.google/request
                      :model      model
                      :msg-count  (count input)
                      :tool-count (count tools)}
      (try
        (let [{:keys [auth credentials]} (resolve-google-auth credentials ai-proxy?)
              url      (str (model-resource-path credentials model) ":streamGenerateContent?alt=sse")
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
                                     :request  req})))
        (catch Exception e
          (core/rethrow-api-error! "google" google-error-msg e))))))

(defn google
  "Call the Gemini Enterprise Agent Platform, return AISDK stream."
  [& args]
  (let [raw (apply google-raw args)]
    (eduction (sgc/->aisdk-chunks-xf) raw)))
