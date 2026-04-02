(ns metabase.analytics.sdk
  "Middleware, vars, and a reporting helper for tracking analytics information about the Metabase embedding client.

  Here is how we collect analytics information about the embedding client:
  The X-Metabase-Client and X-Metabase-Client-Version headers are sent, and if present bound to *metabase-client* and *metabase-client-version* respectively.

  When we execute a query, or record a view log, we include the *client* and *version* as embedding_client and embedding_version in the view_log or query_execution record.

  then we can use the information on the tables to track information about the embedding client,
  and TODO: send it out in `summarize-execution`."
  (:require
   [clojure.string :as str]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.request.current :as request.current]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.net URI)))

(set! *warn-on-reflection* true)

(def ^:dynamic *version* "Used to track information about the metabase embedding client version." nil)

(defmacro with-version! "Used to track information about the metabase embedding client version."
  [[value] & body]
  `(binding [*version* ~value]
     ~@body))

(defn get-version "Returns [[*version*]]." [] *version*)

(def ^:dynamic *client* "Used to track information about the metabase embedding client." nil)

(defmacro with-client! "Used to track information about the metabase embedding client client."
  [[value] & body]
  `(binding [*client* ~value]
     ~@body))

(defn get-client "Returns [[*client*]] dynamic var" [] *client*)

(def ^:dynamic *auth-method* "Used to track the authentication method for the current request (e.g. \"password\", \"jwt\", \"api-key\")." nil)

(defmacro with-auth-method! "Binds [[*auth-method*]] for the duration of `body`."
  [[value] & body]
  `(binding [*auth-method* ~value]
     ~@body))

(defn get-auth-method "Returns [[*auth-method*]]." [] *auth-method*)

(defn extract-hostname
  "Extracts the hostname from a URL string. Returns nil if the URL is nil or unparseable."
  [url]
  (when url
    (try
      (let [host (.getHost (URI. url))]
        (when-not (str/blank? host)
          (subs host 0 (min (count host) 512))))
      (catch Exception _
        nil))))

(defn extract-path
  "Extracts the path from a URL string, stripping query params and fragment.
  Returns nil if the URL is nil or unparseable."
  [url]
  (when url
    (try
      (let [path (.getPath (URI. url))]
        (when-not (str/blank? path)
          (subs path 0 (min (count path) 2048))))
      (catch Exception _
        nil))))

(defn pii-request-info
  "Pure function that computes GDPR-gated request metadata from individual request values.
  Returns a map with `:embedding_hostname`, `:embedding_path`, `:user_agent`, and `:ip_address`."
  [{:keys [origin referer user-agent ip-address]}]
  {:embedding_hostname (extract-hostname origin)
   :embedding_path     (extract-path referer)
   :user_agent         (some-> user-agent (subs 0 (min (count user-agent) 512)))
   :ip_address         ip-address})

(defn- pii-fields
  "Returns PII fields from the current request when the `analytics-pii-retention-enabled` setting is true."
  []
  (when (analytics.settings/analytics-pii-retention-enabled)
    (when-let [request (request.current/current-request)]
      (pii-request-info
       {:origin     (get-in request [:headers "origin"])
        :referer    (get-in request [:headers "referer"])
        :user-agent (get-in request [:headers "user-agent"])
        :ip-address (request.current/ip-address request)}))))

(mu/defn include-sdk-info :- :map
  "Adds the currently bound, or existing `*client*` and `*version*` to the given map, which is usually a row going
   into the `view_log` or `query_execution` table. Falls back to the original value."
  [m :- :map]
  (-> m
      (update :embedding_client (fn [client] (or *client* client)))
      (update :embedding_version (fn [version] (or *version* version)))
      (update :auth_method (fn [method] (or *auth-method* method)))
      (merge (pii-fields))))

(def ^:private embedding-sdk-client "embedding-sdk-react")
(def ^:private embedding-iframe-client "embedding-iframe")

(defn- track-sdk-response
  "Tabulates the number of responses by status code made by clients of the SDK."
  [sdk-client {:keys [status]}]
  (case sdk-client
    "embedding-sdk-react"    (prometheus/inc! :metabase-sdk/response {:status (str status)})
    "embedding-iframe"       (prometheus/inc! :metabase-embedding-iframe/response {:status (str status)})
    (log/infof "Unknown client. client: %s" sdk-client)))

(defn embedding-context?
  "Should we track this request as being made by an embedding client?"
  [client]
  (or (= client embedding-sdk-client)
      (= client embedding-iframe-client)))

(def ^:private route-client-mapping
  [["/api/public/" "public"]
   ["/api/embed/" "guest-embed"]
   ;; preview-embed is guest-embed; the "-preview" suffix is appended separately
   ;; when X-Metabase-Embedded-Preview: true (see embedding-mw below).
   ["/api/preview-embed/" "guest-embed"]
   ["/api/metabot/" "metabot"]
   ["/api/agent/" "agent-api"]])

(defn- derived-client
  [{:keys [uri metabase-client-header]}]
  (let [route-client (first (keep (fn [[prefix client]]
                                    (when (str/starts-with? (or uri "") prefix) client))
                                  route-client-mapping))]
    (or route-client metabase-client-header)))

(defn embedding-mw
  "Reads Metabase Client and Version headers and binds them to *metabase-client{-version}*."
  [handler]
  (fn embedding-mw-fn
    [request respond raise]
    (let [metabase-client-header (get-in request [:headers "x-metabase-client"])
          version (get-in request [:headers "x-metabase-client-version"])
          preview? (= (get-in request [:headers "x-metabase-embedded-preview"]) "true")
          sdk-client (derived-client {:uri (:uri request) :metabase-client-header metabase-client-header})]
      ;; Keep "-preview" suffix so preview requests are distinguishable for auditing
      ;; (admins can query sensitive data via the embed preview wizard). Usage analytics
      ;; views (EMB-1503) will de-emphasize preview but still surface it.
      (binding [*client* (if preview? (str sdk-client "-preview") sdk-client)
                *version* version]
        (handler request
                 (fn responder [response]
                   (when (embedding-context? sdk-client)
                     (track-sdk-response sdk-client response))
                   (respond response))
                 (fn raiser [response]
                   (when (embedding-context? sdk-client)
                     (track-sdk-response sdk-client
                                         (if (:status response)
                                           response
                                           {:status 500})))
                   (raise response)))))))
