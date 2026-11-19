(ns metabase.sync.api
  "REST API routes related to sync."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.sync.api.metadata-sync]
   [metabase.sync.api.notify]))

(comment metabase.sync.api.metadata-sync/keep-me
         metabase.sync.api.notify/keep-me)

(def ^{:arglists '([request respond raise])} notify-routes
  "/api/notify routes."
  (api.macros/ns-handler 'metabase.sync.api.notify))

(def ^{:arglists '([request respond raise])} warehouse-routes
  "/api/warehouse routes."
  (api.macros/ns-handler 'metabase.sync.api.metadata-sync))
