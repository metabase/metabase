(ns metabase.server.middleware.request-id
  (:require [metabase.config :refer [*request-id*]]))

(defn wrap-request-id
  "Attach a unique request ID to the request"
  [handler]
  (fn [request response raise]
    (binding [*request-id* (random-uuid)]
      (handler (assoc request :request-id *request-id*) response raise))))
