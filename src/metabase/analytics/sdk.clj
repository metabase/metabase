(ns metabase.analytics.sdk
  "Middleware, vars, and a reporting helper for tracking analytics information about the Metabase embedding client.

  Here is how we collect analytics information about the embedding client:
  The X-Metabase-Client and X-Metabase-Client-Version headers are sent, and if present bound to *metabase-client* and *metabase-client-version* respectively.

  When we execute a query, or record a view log, we include the *client* and *version* as embedding_client and embedding_version in the view_log or query_execution record.

  then we can use the information on the tables to track information about the embedding client,
  and TODO: send it out in `summarize-execution`."
  (:require [metabase.analytics.prometheus :as prometheus]
            [metabase.util.log :as log]
            [metabase.util.malli :as mu]))

(def ^:dynamic *version* "Used to track information about the metabase embedding client version." nil)
(def ^:dynamic *client* "Used to track information about the metabase embedding client." nil)

(mu/defn include-analytics :- :map
  "Adds the currently bound, or existing `*client*` and `*version*` to the given map, which is usually a row going
   into the `view_log` or `query_execution` table. Falls back to the original value."
  [m :- :map]
  (-> m
      (update :embedding_client (fn [client] (or *client* client)))
      (update :embedding_version (fn [version] (or *version* version)))))

(mu/defn- categorize-response :- [:maybe [:enum :ok :error]]
  [{:keys [status]}]
  (when status
    (cond
      (<= 200 status 299) :ok
      (<= 400 status 599) :error
      ;; ignore other status codes
      :else nil)))

(def ^:private embedding-sdk-client "embedding-sdk-react")
(def ^:private embedding-iframe-client "embedding-iframe")

(defn- track-sdk-response
  "Tabulates the number of ok and erroring requests made by clients of the SDK."
  [sdk-client status]
  (condp = [sdk-client status]
    [embedding-sdk-client :ok]       (prometheus/inc! :metabase-sdk/response-ok)
    [embedding-sdk-client :error]    (prometheus/inc! :metabase-sdk/response-error)
    [embedding-iframe-client :ok]    (prometheus/inc! :metabase-embedding-iframe/response-ok)
    [embedding-iframe-client :error] (prometheus/inc! :metabase-embedding-iframe/response-error)
    (log/infof "Unknown client or status. client: %s status %s" sdk-client status)))

(defn- embedding-context?
  "Should we track this request as being made by an embedding client?"
  [client]
  (or (= client embedding-sdk-client)
      (= client embedding-iframe-client)))

(defn embedding-mw
  "Reads Metabase Client and Version headers and binds them to *metabase-client{-version}*."
  [handler]
  (fn embedding-mw-fn
    [request respond raise]
    (let [sdk-client (get-in request [:headers "x-metabase-client"])
          version (get-in request [:headers "x-metabase-client-version"])]
      (binding [*client* sdk-client
                *version* version]
        (handler request
                 (fn responder [response]
                   (when-let [response-status (and (embedding-context? sdk-client)
                                                   (categorize-response response))]
                     (track-sdk-response sdk-client response-status))
                   (respond response))
                 (fn raiser [response]
                   (when (embedding-context? sdk-client)
                     (track-sdk-response sdk-client :error))
                   (raise response)))))))
