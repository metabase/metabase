(ns metabase.server.middleware.content-gate-cache
  (:require
   [metabase.documents.content-gate-cache :as documents.gate-cache]))

(defn wrap-content-gate-cache
  "Async Ring middleware that scopes a document content-gate cache to the request, so every check of a document's
  content within it shares one verdict."
  [handler]
  (fn [request respond raise]
    (documents.gate-cache/do-with-content-gate-cache
     #(handler request respond raise))))
