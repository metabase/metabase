(ns metabase.oauth-server.api
  "Routes for the embedded OAuth/OIDC provider endpoints."
  (:require
   [compojure.core :refer [GET POST context routes]]
   [metabase.oauth-server.core :as oauth-server]))

(def ^:private not-found-response
  {:status 404 :body {:error "not_found"}})

(def well-known-routes
  "Ring handler for `/.well-known/` routes (top-level, per RFC 8414 and RFC 9728)."
  (routes
   (GET "/.well-known/openid-configuration" request
     (or (oauth-server/openid-discovery-handler request)
         not-found-response))
   (GET "/.well-known/oauth-protected-resource" request
     (or (oauth-server/protected-resource-metadata-handler request)
         not-found-response))))

(def oauth-routes
  "Ring handler for `/oauth/` routes."
  (context "/oauth" []
    (routes
     (GET "/jwks" request
       (or (oauth-server/jwks-handler request)
           not-found-response))
     (POST "/register" request
       (or (oauth-server/dynamic-register-handler request)
           not-found-response))
     (GET "/register/:client-id" [client-id :as request]
       (or (oauth-server/dynamic-client-read-handler request client-id)
           not-found-response))
     (GET "/authorize" request
       (or (oauth-server/authorize-handler request)
           not-found-response))
     (POST "/authorize/decision" request
       (or (oauth-server/authorize-decision-handler request)
           not-found-response))
     (POST "/token" request
       (or (oauth-server/token-handler request)
           not-found-response)))))
