(ns metabase-enterprise.audit-app.api.routes
  "API endpoints that are only enabled if we have a premium token with the `:audit-app` feature. These live under
  `/api/ee/audit-app/`. Feature-flagging for these routes happens in [[metabase-enterprise.api.routes/routes]]."
  (:require
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for /api/mt/audit-app/ API endpoints."
  (handlers/route-map-handler
   {"/user" (+auth (handlers/lazy-ns-handler 'metabase-enterprise.audit-app.api.user))}))
