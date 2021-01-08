(ns metabase-enterprise.sso.api.routes
  (:require [compojure.core :as compojure]
            [metabase-enterprise.sso.api.sso :as sso]))

;; This needs to be installed in the `metabase.server.routes/routes` -- not `metabase.api.routes/routes` !!!
(compojure/defroutes ^{:doc "Ring routes for auth (SAML) API endpoints."} routes
  (compojure/context
   "/auth"
   []
   (compojure/routes
    (compojure/context "/sso" [] sso/routes))))
