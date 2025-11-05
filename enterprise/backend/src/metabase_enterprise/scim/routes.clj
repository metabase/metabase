(ns metabase-enterprise.scim.routes
  (:require
   [metabase-enterprise.scim.api]
   [metabase-enterprise.scim.auth :refer [+scim-auth]]
   [metabase-enterprise.scim.v2.api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(comment metabase-enterprise.scim.api/keep-me
         metabase-enterprise.scim.v2.api/keep-me)

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for SCIM"
  (handlers/routes
   (handlers/route-map-handler
    {"/v2" (+scim-auth (api.macros/ns-handler 'metabase-enterprise.scim.v2.api))})
   (+auth (api.macros/ns-handler 'metabase-enterprise.scim.api))))
