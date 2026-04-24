(ns metabase.analytics.sdk
  "Middleware, vars, and a reporting helper for tracking analytics information about the Metabase embedding client.

  Here is how we collect analytics information about the embedding client:
  The X-Metabase-Client and X-Metabase-Client-Version headers are sent, and if present bound to *metabase-client* and *metabase-client-version* respectively.

  When we execute a query, or record a view log, we include the *client* and *version* as embedding_client and embedding_sdk_version in the view_log or query_execution record.

  then we can use the information on the tables to track information about the embedding client,
  and TODO: send it out in `summarize-execution`."
  (:require
   [clojure.string :as str]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.config.core :as config]
   [metabase.request.current :as request.current]
   [metabase.request.user-agent :as request.user-agent]
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

(def ^:dynamic *route* "Used to track the API route for the current request (e.g. \"public\", \"guest-embed\")." nil)

(defn get-route "Returns [[*route*]]." [] *route*)

(def ^:dynamic *auth-method* "Used to track the authentication method for the current request (e.g. \"password\", \"jwt\", \"api-key\")." nil)

(defmacro with-auth-method! "Binds [[*auth-method*]] for the duration of `body`."
  [value & body]
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
  {:embedding_hostname    (extract-hostname origin)
   :embedding_path        (extract-path referer)
   :user_agent            (some-> user-agent (subs 0 (min (count user-agent) 512)))
   :sanitized_user_agent  (request.user-agent/describe-user-agent user-agent)
   :ip_address            ip-address})

(defn- hostname-fields
  "Returns embedding_hostname from the current request. Always collected (not PII)."
  []
  (when-let [request (request.current/current-request)]
    {:embedding_hostname (extract-hostname (get-in request [:headers "x-metabase-embed-referrer"]))}))

(defn- pii-fields
  "Returns PII fields from the current request when the `analytics-pii-retention-enabled` setting is true."
  []
  (when (analytics.settings/analytics-pii-retention-enabled)
    (when-let [request (request.current/current-request)]
      {:embedding_path       (extract-path (get-in request [:headers "x-metabase-embed-referrer"]))
       :user_agent           (some-> (get-in request [:headers "user-agent"])
                                     (subs 0 (min (count (get-in request [:headers "user-agent"])) 512)))
       :sanitized_user_agent (request.user-agent/describe-user-agent (get-in request [:headers "user-agent"]))
       :ip_address           (request.current/ip-address request)})))

(mu/defn include-sdk-info :- :map
  "Adds the currently bound, or existing `*client*` and `*version*` to the given map, which is usually a row going
   into the `view_log` or `query_execution` table. Falls back to the original value."
  [m :- :map]
  (-> m
      (update :embedding_client (fn [client] (or *client* client)))
      (update :embedding_route (fn [route] (or *route* route)))
      (update :embedding_sdk_version (fn [version] (or *version* version)))
      (update :auth_method (fn [method] (or *auth-method* method)))
      (assoc :metabase_version (:tag config/mb-version-info))
      (merge (hostname-fields) (pii-fields))))

(def ^:private embedding-clients
  #{"embedding-sdk-react"
    "embedding-iframe"
    "embedding-iframe-full-app"
    "embedding-iframe-static"
    "embedding-public"
    "embedding-simple"})

(defn- track-sdk-response
  "Tabulates the number of responses by status code made by clients of the SDK."
  [sdk-client {:keys [status]}]
  (case sdk-client
    "embedding-sdk-react"       (analytics/inc! :metabase-sdk/response {:status (str status)})
    "embedding-iframe"          (analytics/inc! :metabase-embedding-iframe/response {:status (str status)})
    "embedding-iframe-full-app" (analytics/inc! :metabase-embedding-iframe-full-app/response {:status (str status)})
    "embedding-iframe-static"   (analytics/inc! :metabase-embedding-iframe-static/response {:status (str status)})
    "embedding-public"          (analytics/inc! :metabase-embedding-public/response {:status (str status)})
    "embedding-simple"          (analytics/inc! :metabase-embedding-simple/response {:status (str status)})
    (log/infof "Unknown client. client: %s" sdk-client)))

(defn embedding-context?
  "Should we track this request as being made by an embedding client?"
  [client]
  (contains? embedding-clients client))

(def ^:private embedding-route-mapping
  [["/api/public/"        "public"]
   ["/api/embed/"         "guest-embed"]
   ;; preview_embed is guest-embed; the "-preview" suffix is appended separately
   ;; when X-Metabase-Embedded-Preview: true (see embedding-mw below).
   ["/api/preview_embed/" "guest-embed"]
   ["/api/metabot/"       "metabot"]
   ["/api/agent/"         "agent-api"]])

(defn embedding-route
  "Returns the route surface string for a URI, or nil if no route matches."
  [uri]
  (first (keep (fn [[prefix surface]]
                 (when (str/starts-with? (or uri "") prefix) surface))
               embedding-route-mapping)))

(defn embedding-mw
  "Reads Metabase Client and Version headers and binds them to *metabase-client{-version}*."
  [handler]
  (fn embedding-mw-fn
    [request respond raise]
    (let [metabase-client-header (get-in request [:headers "x-metabase-client"])
          version (get-in request [:headers "x-metabase-client-version"])
          preview? (= (get-in request [:headers "x-metabase-embedded-preview"]) "true")
          route (embedding-route (:uri request))
          ;; *client* is the SDK/client identity from the header, with -preview suffix if applicable
          client (cond-> metabase-client-header
                   preview? (some-> (str "-preview")))]
      (binding [*client*  client
                *route*   route
                *version* version]
        (handler request
                 (fn responder [response]
                   ;; Only track prometheus when NO route match AND header is an embedding context
                   (when (and (nil? route) (embedding-context? metabase-client-header))
                     (track-sdk-response metabase-client-header response))
                   (respond response))
                 (fn raiser [response]
                   (when (and (nil? route) (embedding-context? metabase-client-header))
                     (track-sdk-response metabase-client-header
                                         (if (:status response)
                                           response
                                           {:status 500})))
                   (raise response)))))))
