(ns metabase.oauth-server.api.metadata
  "Endpoints for OAuth/OIDC discovery and resource metadata.
   Mounted under `/.well-known/`."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.system.core :as system]
   [oidc-provider.core :as oidc]))

(set! *warn-on-reflection* true)

(defn- discovery-response
  "Build the OIDC discovery document response, or nil if the provider is unavailable."
  []
  (when-let [provider (oauth-server/get-provider)]
    (let [metadata (oidc/discovery-metadata provider)]
      {:status  200
       :headers {"Content-Type" "application/json"}
       :body    (if (oauth-settings/oauth-server-dynamic-registration-enabled)
                  metadata
                  (dissoc metadata :registration_endpoint "registration_endpoint"))})))

(api.macros/defendpoint :get "/oauth-authorization-server"
  "Returns the OAuth Authorization Server Metadata (RFC 8414)."
  []
  (or (discovery-response)
      {:status 404 :body {:error "not_found"}}))

(api.macros/defendpoint :get "/openid-configuration"
  "Returns the OIDC discovery document (OpenID Connect Discovery 1.0)."
  []
  (or (discovery-response)
      {:status 404 :body {:error "not_found"}}))

(api.macros/defendpoint :get "/oauth-protected-resource/api/mcp"
  "Returns OAuth Protected Resource Metadata (RFC 9728) for the MCP endpoint."
  []
  (let [site-url (system/site-url)]
    {:status  200
     :headers {"Content-Type" "application/json"}
     :body    {:resource                  (str site-url "/api/mcp")
               :authorization_servers     [site-url]
               :scopes_supported          (oauth-server/all-agent-scopes)
               :bearer_methods_supported  ["header"]}}))
