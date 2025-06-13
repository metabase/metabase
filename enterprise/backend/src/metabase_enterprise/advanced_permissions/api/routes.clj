(ns metabase-enterprise.advanced-permissions.api.routes
  (:require
   [metabase-enterprise.advanced-permissions.api.application]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(comment metabase-enterprise.advanced-permissions.api.application/keep-me)

(def ^:private route-map
  {"/application"   (+auth (api.macros/ns-handler 'metabase-enterprise.advanced-permissions.api.application))})

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for advanced permissions API endpoints."
  (handlers/route-map-handler route-map))
