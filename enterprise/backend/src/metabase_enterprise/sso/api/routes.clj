(ns metabase-enterprise.sso.api.routes
  (:require
   [compojure.core :as compojure]
   [metabase-enterprise.sso.api.saml :as saml]
   [metabase-enterprise.sso.api.sso :as sso]))

;; This needs to be injected into [[metabase.server.routes/routes]] -- not [[metabase.api.routes/routes]] !!!
;;
;; TODO -- should we make a `metabase-enterprise.routes` namespace where this can live instead of injecting it
;; directly?
;;
;; TODO -- we need to feature-flag this based on the `:sso-` feature flags
(compojure/defroutes ^{:doc "Ring routes for auth (SAML) API endpoints."} routes
  (compojure/context
    "/auth"
    []
    (compojure/routes
     (compojure/context "/sso" [] sso/routes)))
  (compojure/context
    "/api"
    []
    (compojure/routes
     (compojure/context "/saml" [] saml/routes))))
