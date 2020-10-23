(ns metabase-enterprise.sandbox.api.routes
  "Multi-tenant API routes."
  (:require [compojure.core :as compojure]
            [metabase-enterprise.sandbox.api
             [gtap :as gtap]
             [table :as table]
             [user :as user]]
            [metabase.middleware.auth :as middleware.auth]))

;; this is copied from `metabase.api.routes` because if we require that above we will destroy startup times for `lein
;; ring server`
(def ^:private +auth
  "Wrap `routes` so they may only be accessed with proper authentiaction credentials."
  middleware.auth/enforce-authentication)

(compojure/defroutes ^{:doc "Ring routes for mt API endpoints."} routes
  (compojure/context
   "/mt"
   []
   (compojure/routes
    (compojure/context "/gtap" [] (+auth gtap/routes))
    (compojure/context "/user" [] (+auth user/routes))))
  (compojure/context "/table" [] (+auth table/routes)))
