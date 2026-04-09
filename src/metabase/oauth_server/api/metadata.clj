(ns metabase.oauth-server.api.metadata
  "Endpoints for OAuth discovery and resource metadata.
   Mounted under `/.well-known/`."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.oauth-server.core :as oauth-server]
   [metabase.oauth-server.settings :as oauth-settings]
   [metabase.system.core :as system]
   [oidc-provider.core :as oidc]))

(set! *warn-on-reflection* true)

(defn- discovery-response
  "Build the OAuth discovery document response, or nil if the provider is unavailable."
  []
  (when-let [provider (oauth-server/get-provider)]
    (let [metadata (-> (oidc/discovery-metadata provider)
                       (dissoc :jwks_uri :id_token_signing_alg_values_supported))]
      {:status  200
       :headers {"Content-Type" "application/json"}
       :body    (if (oauth-settings/oauth-server-dynamic-registration-enabled)
                  metadata
                  (dissoc metadata :registration_endpoint "registration_endpoint"))})))

(api.macros/defendpoint :get "/oauth-authorization-server"
  :- [:or
      [:map
       [:status [:= 200]]
       [:body [:map
               [:issuer :string]
               [:authorization_endpoint :string]
               [:token_endpoint :string]]]]
      [:map
       [:status [:= 404]]
       [:body [:map [:error [:= "not_found"]]]]]]
  "Returns the OAuth Authorization Server Metadata (RFC 8414)."
  []
  (or (discovery-response)
      {:status 404 :body {:error "not_found"}}))

(api.macros/defendpoint :get "/oauth-protected-resource/api/mcp"
  :- [:map
      [:status [:= 200]]
      [:body [:map
              [:resource :string]
              [:authorization_servers [:sequential :string]]
              [:scopes_supported [:sequential :string]]
              [:bearer_methods_supported [:sequential :string]]]]]
  "Returns OAuth Protected Resource Metadata (RFC 9728) for the MCP endpoint."
  []
  (let [site-url (system/site-url)]
    {:status  200
     :headers {"Content-Type" "application/json"}
     :body    {:resource                  (str site-url "/api/mcp")
               :authorization_servers     [site-url]
               :scopes_supported          (vec (oauth-server/all-agent-scopes))
               :bearer_methods_supported  ["header"]}}))
