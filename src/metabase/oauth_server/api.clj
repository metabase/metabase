(ns metabase.oauth-server.api
  "Routes for the embedded OAuth/OIDC provider endpoints."
  (:require
   [compojure.core :refer [GET context routes]]
   [metabase.oauth-server.core :as oauth-server]))

(def ^:private not-found-response
  {:status 404 :body {:error "not_found"}})

(def oauth-routes
  "Ring handler for `/oauth/` routes."
  (context "/oauth" []
    (routes
     (GET "/.well-known/openid-configuration" request
       (or (oauth-server/openid-discovery-handler request)
           not-found-response))
     (GET "/jwks" request
       (or (oauth-server/jwks-handler request)
           not-found-response)))))
