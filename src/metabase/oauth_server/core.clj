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

(defenterprise dynamic-register-handler
  "Handles dynamic client registration (RFC 7591), or returns nil if unavailable."
  metabase-enterprise.oauth-server.api
  [_request]
  nil)

(defenterprise dynamic-client-read-handler
  "Handles client configuration read (RFC 7592), or returns nil if unavailable."
  metabase-enterprise.oauth-server.api
  [_request _client-id]
  nil)

(defenterprise authorize-handler
  "Handles the authorization endpoint (GET /oauth/authorize), or returns nil if unavailable."
  metabase-enterprise.oauth-server.api
  [_request]
  nil)

(defenterprise authorize-decision-handler
  "Handles the authorization decision (POST /oauth/authorize/decision), or returns nil if unavailable."
  metabase-enterprise.oauth-server.api
  [_request]
  nil)

(defenterprise revocation-handler
  "Handles the token revocation endpoint (POST /oauth/revoke), or returns nil if unavailable."
  metabase-enterprise.oauth-server.api
  [_request]
  nil)

(defenterprise token-handler
  "Handles the token endpoint (POST /oauth/token), or returns nil if unavailable."
  metabase-enterprise.oauth-server.api
  [_request]
  nil)

(defenterprise protected-resource-metadata-handler
  "Returns OAuth Protected Resource Metadata (RFC 9728), or nil if unavailable."
  metabase-enterprise.oauth-server.api
  [_request]
  nil)
