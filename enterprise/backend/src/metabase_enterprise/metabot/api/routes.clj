(ns metabase-enterprise.metabot.api.routes
  "Routes for enterprise metabot API endpoints."
  (:require
   [metabase-enterprise.metabot.api.permissions]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for enterprise metabot API endpoints."
  (handlers/route-map-handler
   {"/permissions" metabase-enterprise.metabot.api.permissions/routes}))
