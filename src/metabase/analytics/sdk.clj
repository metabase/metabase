(ns metabase.analytics.sdk
  "Middleware, vars, and a reporting helper for tracking analytics information about the Metabase embedding client.

  Here is how we collect analytics information about the embedding client:
  The X-Metabase-Client and X-Metabase-Client-Version headers are sent, and if present bound to *metabase-client* and *metabase-client-version* respectively.

  When we execute a query, or record a view log, we include the *client* and *version* as embedding_client and embedding_version in the view_log or query_execution record.

  then we can use the information on the tables to track information about the embedding client,
  and TODO: send it out in `summarize-execution`."
  (:require [metabase.analytics.prometheus :as prometheus]
            [metabase.util.malli :as mu]))

(def ^:dynamic *version* "Used to track information about the metabase embedding client version." nil)
(def ^:dynamic *client* "Used to track information about the metabase embedding client." nil)

(mu/defn include-analytics :- :map
  "Adds the currently bound, or existing `*client*` and `version` to the given map, which is usually a row going into
   the `view_log` or `query_execution` table. Falls back to the original value."
  [m :- :map]
  (-> m
      (update :embedding_client (fn [client] (or *client* client)))
      (update :embedding_version (fn [version] (or *version* version)))))

(mu/defn- categorize-request :- [:maybe [:enum :ok :error]]
  [{:keys [status]}]
  (cond
    (<= 200 status 299) :ok
    (<= 400 status 599) :error
    ;; ignre other status codes
    :else nil))

(defn track-sdk-response
  "Tabulates the number of ok and erroring requests made by clients of the SDK."
  [response]
  (case (categorize-request response)
    :ok (prometheus/inc :metabase-sdk/response-ok)
    :error (prometheus/inc :metabase-sdk/response-error)
    nil nil))

(defn embedding-mw
  "Reads Metabase Client and Version headers and binds them to *metabase-client{-version}*."
  [handler]
  (fn bound-embedding
    [request respond raise]
    (let [sdk-client (get-in request [:headers "x-metabase-client"])
          version (get-in request [:headers "x-metabase-client-version"])]
      (binding [*client* sdk-client *version* version]
        (handler request
                 (fn [response]
                   (when sdk-client
                     (track-sdk-response (categorize-request response)))
                   (respond response))
                 (fn [response]
                   (when sdk-client
                     (track-sdk-response :error))
                   (raise response)))))))
