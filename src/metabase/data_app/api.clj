(ns metabase.data-app.api
  "Main API namespace for data apps that exports routes"
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.data-app.api.app]
   [metabase.data-app.api.data-app]))

(comment metabase.data-app.api.app/keep-me
         metabase.data-app.api.data-app/keep-me)

(def ^{:arglists '([request respond raise])} app-routes
  "/api/app routes for consumer-facing data app APIs"
  (api.macros/ns-handler 'metabase.data-app.api.app))

(def ^{:arglists '([request respond raise])} data-app-routes
  "/api/data-app routes for data app CRUD operations"
  (api.macros/ns-handler 'metabase.data-app.api.data-app))
