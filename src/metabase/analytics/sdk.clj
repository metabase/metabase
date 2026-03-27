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
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

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

(mu/defn include-sdk-info :- :map
  "Adds the currently bound, or existing `*client*` and `*version*` to the given map, which is usually a row going
   into the `view_log` or `query_execution` table. Falls back to the original value."
  [m :- :map]
  (-> m
      (update :embedding_client (fn [client] (or *client* client)))
      (update :embedding_version (fn [version] (or *version* version)))))

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
   ; TODO Is this the client value that we want?
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
      ; TODO Is it correct to add "-preview" to the route-client-mapping values we're getting from the route URIs?
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
