(ns metabase.server.auth-wrapper
  (:require
   [metabase.api.util.handlers :as handlers]
   [metabase.config.core :as config]
   [ring.util.response :as response]))

(let [bad-req (response/bad-request {:message "The auth/sso endpoint only exists in enterprise builds"
                                     :status "ee-build-required"})]
  (defn- not-enabled
    [_req respond _raise]
    (respond bad-req)))

(def ^{:arglists '([request respond raise])} ee-missing-routes
  "Ring routes for auth (SAML) API endpoints."
  ;; follows the same form as [[metabase-enterprise.sso.api.routes]]. Compojure is a bit opaque so need to manually keep
  ;; them in sync.
  (handlers/route-map-handler
   {"/auth" {"/sso"  not-enabled}
    "/api"  {"/saml" not-enabled
             "/ee"   {"/sso" {"/oidc-providers" not-enabled}}}}))

;; This needs to be injected into [[metabase.server.routes/routes]] -- not [[metabase.api-routes.core/routes]] !!!
;;
;; TODO -- should we make a `metabase-enterprise.routes` namespace where this can live instead of injecting it
;; directly?
;;
;; TODO -- we need to feature-flag this based on the `:sso-` feature flags
(def routes
  "Ring routes for auth (SAML) api endpoints. If enterprise is not present, will return a nicer message"
  (if (and config/ee-available? (not *compile-files*))
    (requiring-resolve 'metabase-enterprise.sso.api.routes/routes)
    ee-missing-routes))
