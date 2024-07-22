(ns metabase.server.middleware.analytics
  "Middleware for tracking analytics information about the Metabase embedding client.

  The X-Metabase-Client and X-Metabase-Version headers are read and bound to *metabase-client* and *metabase-client-version* respectively.

  The values are then used to track information about the embedding client when executing a query.")

(def ^:dynamic *metabase-client-version* "Used to track information about the metabase embedding client version." nil)
(def ^:dynamic *metabase-client* "Used to track information about the metabase embedding client." nil)

(defn bind-embedding
  "Reads Metabase Client and Version headers and binds them to *metabase-client{-version}*."
  [handler]
  (fn bound-embedding
    [request respond raise]
    (binding [*metabase-client* (get-in request [:headers "x-metabase-client"])
              *metabase-client-version* (get-in request [:headers "x-metabase-client-version"])]
      (handler request respond raise))))
