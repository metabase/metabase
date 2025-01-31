(ns metabase.sync.api
  "REST API routes related to sync."
  (:require
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} notify-routes
  "/api/notify routes."
  (handlers/lazy-ns-handler 'metabase.sync.api.notify))
