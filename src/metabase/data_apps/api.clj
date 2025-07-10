(ns metabase.data-apps.api
  "Main API namespace for data apps that exports routes"
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.data-apps.api.app]
   [metabase.data-apps.api.data-app]))

(comment metabase.data-apps.api.app/keep-me
         metabase.data-apps.api.data-app/keep-me)

(def ^{:arglists '([request respond raise])} consumer-routes
  "/api/app routes for consumer-facing data app APIs"
  (api.macros/ns-handler 'metabase.data-apps.api.app))

(def ^{:arglists '([request respond raise])} creator-routes
  "/api/data-app routes for data app CRUD operations"
  (api.macros/ns-handler 'metabase.data-apps.api.data-app))
