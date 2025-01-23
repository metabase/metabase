(ns metabase.server.auth-wrapper
  (:require
   [compojure.core :as compojure]
   [metabase.config :as config]
   [metabase.plugins.classloader :as classloader]
   [ring.util.response :as response]))

(when config/ee-available?
  (classloader/require 'metabase-enterprise.sso.api.routes))

(let [bad-req (response/bad-request {:message "The auth/sso endpoint only exists in enterprise builds"
                                     :status "ee-build-required"})]
  (defn- not-enabled
    ([_req] bad-req)
    ([_req respond _raise]
     (respond bad-req))))

(compojure/defroutes ^{:doc "Ring routes for auth (SAML) API endpoints.", :arglists '([request] [request respond raise])}
  ee-missing-routes
  ;; follows the same form as metabase-enterprise.sso.api.routes. Compojure is a bit opaque so need to manually keep
  ;; them in sync.
  (compojure/context
    "/auth"
    []
    (compojure/routes
     (compojure/context "/sso" [] not-enabled)))
  (compojure/context
    "/api"
    []
    (compojure/routes
     (compojure/context "/saml" [] not-enabled))))

;; This needs to be injected into [[metabase.server.routes/routes]] -- not [[metabase.api.routes/routes]] !!!
;;
;; TODO -- should we make a `metabase-enterprise.routes` namespace where this can live instead of injecting it
;; directly?
;;
;; TODO -- we need to feature-flag this based on the `:sso-` feature flags
(def routes
  "Ring routes for auth (SAML) api endpoints. If enterprise is not present, will return a nicer message"
  (or (some-> (resolve 'metabase-enterprise.sso.api.routes/routes) var-get)
      ee-missing-routes))
