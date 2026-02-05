(ns metabase-enterprise.mcp.api
  "MCP HTTP endpoint. Accepts JSON-RPC 2.0 over Streamable HTTP with JWT or session auth."
  (:require
   [metabase-enterprise.agent-api.api :as agent-api]
   [metabase-enterprise.mcp.server :as mcp.server]
   [metabase-enterprise.mcp.tools :as mcp.tools]
   ;; Tool definition namespaces — loaded for side effects (tool registration)
   [metabase-enterprise.mcp.tools.execution]
   [metabase-enterprise.mcp.tools.query]
   [metabase-enterprise.mcp.tools.schema-discovery]
   [metabase-enterprise.mcp.tools.transforms]
   [metabase-enterprise.mcp.tools.urls]
   [metabase-enterprise.mcp.tools.workspace]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(def ^:private +auth
  (api.routes.common/wrap-middleware-for-open-api-spec-generation
   agent-api/enforce-authentication))

(defn- normalize-body
  "The body may arrive as a keyword-keyed map (from wrap-json-body middleware)
   or as an InputStream (raw). Normalize to string-keyed map for parse-request.
   Recursively converts all nested maps (including inside arrays) to string keys."
  [body]
  (cond
    (and (map? body) (keyword? (first (keys body))))
    (into {} (map (fn [[k v]] [(name k) (normalize-body v)])) body)

    (map? body)
    body

    (sequential? body)
    (mapv normalize-body body)

    (instance? java.io.InputStream body)
    (json/decode (slurp body))

    :else
    body))

(defn- handle-mcp-request
  "Ring handler for MCP Streamable HTTP endpoint."
  [request respond _raise]
  (try
    (let [body     (normalize-body (:body request))
          parsed   (mcp.server/parse-request body)
          response (if (:error parsed)
                     (mcp.server/error-response nil
                                                (get-in parsed [:error :code])
                                                (get-in parsed [:error :message]))
                     (mcp.server/handle-request mcp.tools/global-registry parsed))]
      (respond (if (nil? response)
                 {:status 204 :body nil}
                 {:status  200
                  :headers {"Content-Type" "application/json"}
                  :body    (json/encode response)})))
    (catch Exception e
      (log/error e "MCP request error")
      (respond {:status  200
                :headers {"Content-Type" "application/json"}
                :body    (json/encode (mcp.server/error-response nil -32603
                                                                 (str "Internal error: " (ex-message e))))}))))

(def routes
  "MCP endpoint: POST /api/ee/mcp"
  (+auth handle-mcp-request))
