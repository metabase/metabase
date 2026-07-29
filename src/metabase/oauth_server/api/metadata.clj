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

;; One endpoint per MCP path (canonical and legacy), kept in sync with [[metabase.mcp.api/endpoint-paths]].
;; Each advertises its own path as `:resource`, so a strict RFC 9728 client connecting via the legacy
;; alias still sees a resource value matching the URL it hit.
(def ^:private resource-metadata-response-schema
  [:map
   [:status [:= 200]]
   [:body [:map
           [:resource :string]
           [:authorization_servers [:sequential :string]]
           [:scopes_supported [:sequential :string]]
           [:bearer_methods_supported [:sequential :string]]]]])

(defn- protected-resource-metadata
  "OAuth Protected Resource Metadata (RFC 9728) advertising `resource-path` as the protected resource."
  [resource-path]
  (let [site-url (system/site-url)]
    {:status  200
     :headers {"Content-Type" "application/json"}
     :body    {:resource                  (str site-url resource-path)
               :authorization_servers     [site-url]
               :scopes_supported          (vec (oauth-server/all-agent-scopes))
               :bearer_methods_supported  ["header"]}}))

(api.macros/defendpoint :get "/oauth-protected-resource/api/metabase-mcp"
  :- resource-metadata-response-schema
  "Returns OAuth Protected Resource Metadata (RFC 9728) for the MCP endpoint."
  []
  (protected-resource-metadata "/api/metabase-mcp"))

(api.macros/defendpoint :get "/oauth-protected-resource/api/mcp"
  :- resource-metadata-response-schema
  "Returns OAuth Protected Resource Metadata (RFC 9728) for the legacy `/api/mcp` MCP alias."
  []
  (protected-resource-metadata "/api/mcp"))

;; Some clients probe the bare resource path instead of the resource-specific one; serve metadata here so the
;; request doesn't fall through to the SPA's HTML catch-all and trip a `JSON.parse` error (BOT-1617). Advertise the
;; canonical `/api/metabase-mcp` resource, matching the URL clients are now told to use.
(api.macros/defendpoint :get "/oauth-protected-resource"
  :- resource-metadata-response-schema
  "Returns OAuth Protected Resource Metadata (RFC 9728) for the MCP endpoint."
  []
  (protected-resource-metadata "/api/metabase-mcp"))
