(ns metabase-enterprise.metabot.api.routes
  "Routes for enterprise metabot API endpoints."
  (:require
   [metabase-enterprise.mcp.api.permissions]
   [metabase-enterprise.metabot.api.permissions]
   [metabase-enterprise.metabot.api.usage]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for enterprise metabot API endpoints."
  (handlers/route-map-handler
   {"/mcp-permissions" metabase-enterprise.mcp.api.permissions/routes
    "/permissions"     metabase-enterprise.metabot.api.permissions/routes
    "/usage"           metabase-enterprise.metabot.api.usage/routes}))
