(ns metabase.oauth-server.core
  "OSS namespace for OAuth/OIDC server functionality. Defines defenterprise functions
   that return nil in OSS; EE implementations delegate to the oidc-provider library."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise openid-discovery-handler
  "Returns the OIDC discovery document as a Ring response, or nil if unavailable."
  metabase-enterprise.oauth-server.api
  [_request]
  nil)

(defenterprise jwks-handler
  "Returns the JWKS as a Ring response, or nil if unavailable."
  metabase-enterprise.oauth-server.api
  [_request]
  nil)
