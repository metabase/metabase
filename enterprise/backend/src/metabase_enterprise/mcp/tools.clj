(ns metabase-enterprise.mcp.tools
  "EE overrides for MCP tool dispatch. Provides agent API integration
   when the :agent-api premium feature is available."
  (:require
   [metabase-enterprise.agent-api.api :as agent-api]
   [metabase.api.common :as api]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise deliver-agent-api-response
  "EE impl: dispatch to agent API routes and deliver response to promise."
  :feature :agent-api
  [result method path token-scopes body]
  (agent-api/routes
   (cond-> {:request-method   method
            :uri              path
            :metabase-user-id api/*current-user-id*
            :token-scopes     token-scopes}
     body (assoc :body body))
   (fn [response] (deliver result response))
   (fn [error] (deliver result {:status 500 :body {:message (ex-message error)}}))))

(defenterprise generate-manifest
  "EE impl: generate tools manifest from agent API endpoint metadata."
  :feature :agent-api
  []
  (tools-manifest/generate-tools-manifest
   {'metabase-enterprise.agent-api.api "/api/agent"}))
