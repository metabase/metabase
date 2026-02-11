(ns metabase-enterprise.sso.api.routes
  (:require
   [metabase-enterprise.sso.api.oidc]
   [metabase-enterprise.sso.api.saml]
   [metabase-enterprise.sso.api.sso]
   [metabase.api.util.handlers :as handlers]))

(comment metabase-enterprise.sso.api.saml/keep-me
         metabase-enterprise.sso.api.sso/keep-me
         metabase-enterprise.sso.api.oidc/keep-me)

;; This needs to be injected into [[metabase.server.routes/routes]] -- not [[metabase.api-routes.core/routes]] !!!
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
   {"/auth" {"/sso"  'metabase-enterprise.sso.api.sso}
    "/api"  {"/saml" 'metabase-enterprise.sso.api.saml
             "/ee"   {"/sso" {"/oidc" 'metabase-enterprise.sso.api.oidc}}}}))
