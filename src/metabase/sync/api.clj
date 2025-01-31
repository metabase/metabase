(ns metabase.sync.api
  "REST API routes related to sync."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.sync.api.notify]))

(comment metabase.sync.api.notify/keep-me)

(def ^{:arglists '([request respond raise])} notify-routes
  "/api/notify routes."
  (api.macros/ns-handler 'metabase.sync.api.notify))
