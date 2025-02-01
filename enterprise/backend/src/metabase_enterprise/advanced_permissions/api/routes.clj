(ns metabase-enterprise.advanced-permissions.api.routes
  (:require
   [metabase-enterprise.advanced-permissions.api.application]
   [metabase-enterprise.advanced-permissions.api.impersonation]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(comment metabase-enterprise.advanced-permissions.api.application/keep-me
         metabase-enterprise.advanced-permissions.api.impersonation/keep-me)

(def ^:private route-map
  {"/application"   (+auth (api.macros/ns-handler 'metabase-enterprise.advanced-permissions.api.application))
   "/impersonation" (+auth (api.macros/ns-handler 'metabase-enterprise.advanced-permissions.api.impersonation))})

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for advanced permissions API endpoints."
  (handlers/route-map-handler route-map))
