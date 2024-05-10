(ns metabase-enterprise.scim.routes
  (:require
   [compojure.core :as compojure]
   [metabase-enterprise.scim.api :as scim-config]
   [metabase-enterprise.scim.v2.api :as scim-api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.server.middleware.session :as mw.session]
   [metabase.server.request.util :as req.util]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(defn validate-scim-api-key
  "Checks whether the API key provided as a Bearer token in the request matches an API key
  in the database with the SCIM scope."
  [api-key]
  (boolean
   (let [expected-api-key (-> (t2/select-one :model/ApiKey :scope :scim) :key)]
     (if (and api-key expected-api-key)
       (u.password/verify-password api-key "" expected-api-key)
       (mw.session/do-useless-hash)))))

(defn +scim-auth
  "Middleware that returns a 401 response if `request` does not have a valid SCIM API key"
  [handler]
  (fn [request respond raise]
    (let [authorization-header (get-in request [:headers "authorization"])
          [_ api-key]          (re-matches #"Bearer (.*)" (or authorization-header ""))]
      (if (validate-scim-api-key api-key)
        (handler request respond raise)
        (respond req.util/response-forbidden)))))

(compojure/defroutes ^{:doc "Ring routes for SCIM"} routes
  (compojure/context "/v2" [] (+scim-auth scim-api/routes))
  (compojure/context "/" [] (+auth scim-config/routes)))
