(ns metabase.server.middleware.metadata-provider-cache
  (:require
   [metabase.lib-be.core :as lib-be]))

(defn wrap-metadata-provider-cache
  "Async Ring middleware that initializes a Lib-BE metadata provider cache for the duration of the request, so we can
  re-use Lib/QP metadata providers for the same database."
  [handler]
  (fn [request respond raise]
    (lib-be/with-metadata-provider-cache
      (handler request respond raise))))
