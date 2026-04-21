(ns metabase-enterprise.audit-app.api.routes
  "API endpoints that are only enabled if we have a premium token with the `:audit-app` feature. These live under
  `/api/ee/audit-app/`. Feature-flagging for these routes happens
  in [[metabase-enterprise.api-routes.routes/routes]]."
  (:require
   [metabase-enterprise.audit-app.api.analytics-dev]
   [metabase-enterprise.audit-app.api.user]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(comment metabase-enterprise.audit-app.api.analytics-dev/keep-me
         metabase-enterprise.audit-app.api.user/keep-me)

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for /api/mt/audit-app/ API endpoints."
  (handlers/route-map-handler
   {"/user"          (+auth (api.macros/ns-handler 'metabase-enterprise.audit-app.api.user))
    "/analytics-dev" (+auth (api.macros/ns-handler 'metabase-enterprise.audit-app.api.analytics-dev))}))
