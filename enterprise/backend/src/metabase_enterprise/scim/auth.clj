(ns metabase-enterprise.scim.auth
  (:require
   [metabase-enterprise.scim.api :as scim]
   [metabase.server.middleware.session :as mw.session]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(defn- validate-scim-api-key
  "Checks whether the API key provided as a Bearer token in the request matches an API key
  in the database with the SCIM scope."
  [api-key]
  (boolean
   (let [expected-api-key (-> (t2/select-one :model/ApiKey :scope :scim) :key)]
     (if (and api-key expected-api-key)
       (u.password/verify-password api-key "" expected-api-key)
       (mw.session/do-useless-hash)))))

(def ^:private error-schema-uri "urn:ietf:params:scim:api:messages:2.0:Error")

(defn +scim-auth
  "Middleware that returns a 401 response if `request` does not have a valid SCIM API key, and/or if
  SCIM is not enabled."
  [handler]
  (fn [request respond raise]
    (let [authorization-header (get-in request [:headers "authorization"])
          [_ api-key]          (re-matches #"Bearer (.*)" (or authorization-header ""))]
      (if (and (scim/scim-enabled) (validate-scim-api-key api-key))
        (handler request respond raise)
        (respond {:status 401
                  :body   {:schemas [error-schema-uri]
                           :status  401
                           :detail  "Unauthenticated"}})))))
