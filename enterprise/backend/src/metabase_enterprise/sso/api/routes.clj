(ns metabase-enterprise.sso.api.routes
  (:require
   [metabase.api.util.handlers :as handlers]))

;; This needs to be injected into [[metabase.server.routes/routes]] -- not [[metabase.api.routes/routes]] !!!
;;
;; TODO -- should we make a `metabase-enterprise.routes` namespace where this can live instead of injecting it
;; directly?
;;
;; TODO -- we need to feature-flag this based on the `:sso-` feature flags

;; NOTE: there is a wrapper in metabase.server.auth-wrapper to ensure that oss versions give nice error
;; messages. These must be kept in sync manually since compojure are opaque functions.
(def ^{:arglists '([request respond raise])} routes
  "Ring routes for auth (SAML) API endpoints."
  (handlers/route-map-handler
   {"/auth" (handlers/route-map-handler
             {"/sso" (handlers/lazy-ns-handler 'metabase-enterprise.sso.api.sso)})
    "/api"  (handlers/route-map-handler
             {"/saml" (handlers/lazy-ns-handler 'metabase-enterprise.sso.api.saml)})}))
