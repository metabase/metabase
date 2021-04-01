(ns metabase-enterprise.sandbox.api.routes
  "Multi-tenant API routes."
  (:require [compojure.core :as compojure]
            [metabase.api.routes.lazy :as lazy]
            [metabase.server.middleware.auth :as middleware.auth]))

;; this is copied from `metabase.api.routes` because if we require that above we will destroy startup times for `lein
;; ring server`
(def ^:private +auth
  "Wrap `routes` so they may only be accessed with proper authentiaction credentials."
  middleware.auth/enforce-authentication)

(compojure/defroutes ^{:doc "Ring routes for mt API endpoints."} routes
  (lazy/context "/mt" (lazy/routes metabase-enterprise.sandbox.api
                        (+auth gtap)
                        (+auth user)))
  (lazy/routes metabase-enterprise.sandbox.api
    (+auth field)
    (+auth table)))
