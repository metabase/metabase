(ns metabase-enterprise.oauth-server.api
  "EE implementations of OAuth/OIDC endpoint handlers."
  (:require
   [metabase-enterprise.oauth-server.core :as oauth-server]
   [metabase.premium-features.core :refer [defenterprise]]
   [oidc-provider.core :as oidc]))

(defenterprise openid-discovery-handler
  "Returns the OIDC discovery document."
  :feature :metabot-v3
  [_request]
  (when-let [provider (oauth-server/get-provider)]
    {:status 200
     :headers {"Content-Type" "application/json"}
     :body (oidc/discovery-metadata provider)}))

(defenterprise jwks-handler
  "Returns the JWKS."
  :feature :metabot-v3
  [_request]
  (when-let [provider (oauth-server/get-provider)]
    {:status 200
     :headers {"Content-Type" "application/json"}
     :body (oidc/jwks provider)}))
