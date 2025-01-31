(ns metabase-enterprise.advanced-permissions.api.routes
  (:require
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(def ^:private route-map
  {"/application"   (+auth (handlers/lazy-ns-handler 'metabase-enterprise.advanced-permissions.api.application))
   "/impersonation" (+auth (handlers/lazy-ns-handler 'metabase-enterprise.advanced-permissions.api.impersonation))})

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for advanced permissions API endpoints."
  (handlers/route-map-handler route-map))
