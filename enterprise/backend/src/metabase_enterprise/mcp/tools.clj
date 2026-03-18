(ns metabase-enterprise.mcp.tools
  "EE overrides for MCP tool dispatch. Provides agent API integration
   when the :agent-api premium feature is available."
  (:require
   [clojure.core.async :as a]
   [metabase-enterprise.agent-api.api :as agent-api]
   [metabase.api.common :as api]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.json :as json])
  (:import
   (java.io ByteArrayOutputStream)
   (metabase.server.streaming_response StreamingResponse)))

(defn- materialize-streaming-response
  "Execute a StreamingResponse in-process and return a plain Ring response with parsed JSON body.
   Agent API query endpoints stream for HTTP clients, but MCP tool responses need to be
   buffered into JSON-RPC envelopes (~120KB for 200 rows)."
  [^StreamingResponse response]
  (let [baos         (ByteArrayOutputStream.)
        canceled-chan (a/promise-chan)]
    ((.f response) baos canceled-chan)
    {:status 200 :body (json/decode+kw (.toString baos "UTF-8"))}))

(defenterprise deliver-agent-api-response
  "EE impl: dispatch to agent API routes and deliver response to promise.
   StreamingResponses are materialized in-process so the caller always receives a plain map."
  :feature :agent-api
  [result method path token-scopes body]
  (agent-api/routes
   (cond-> {:request-method   method
            :uri              path
            :metabase-user-id api/*current-user-id*
            :token-scopes     token-scopes}
     body (assoc :body body))
   (fn [{resp-body :body :as response}]
     (deliver result (if (instance? StreamingResponse resp-body)
                       (materialize-streaming-response resp-body)
                       response)))
   (fn [error] (deliver result {:status 500 :body {:message (ex-message error)}}))))

(defenterprise generate-manifest
  "EE impl: generate tools manifest from agent API endpoint metadata."
  :feature :agent-api
  []
  (tools-manifest/generate-tools-manifest
   {'metabase-enterprise.agent-api.api "/api/agent"}))
