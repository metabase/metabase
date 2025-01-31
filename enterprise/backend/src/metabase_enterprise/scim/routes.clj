(ns metabase-enterprise.scim.routes
  (:require
   [metabase-enterprise.scim.auth :refer [+scim-auth]]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for SCIM"
  (handlers/routes
   (handlers/route-map-handler
    {"/v2" (+scim-auth (handlers/lazy-ns-handler 'metabase-enterprise.scim.v2.api))})
   (+auth (handlers/lazy-ns-handler 'metabase-enterprise.scim.api))))
