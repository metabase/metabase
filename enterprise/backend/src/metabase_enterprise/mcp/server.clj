(ns metabase-enterprise.mcp.server
  "MCP (Model Context Protocol) server implementation.
   Handles JSON-RPC 2.0 dispatch for MCP Streamable HTTP transport."
  (:require
   [metabase-enterprise.mcp.tools :as mcp.tools]))

;;; ------------------------------------------------- JSON-RPC 2.0 -------------------------------------------------

(defn parse-request
  "Parse and validate a JSON-RPC 2.0 request map (already deserialized from JSON).
   Returns the request map with keyword keys on success, or {:error {...}} on failure."
  [request-map]
  (cond
    (not= (get request-map "jsonrpc") "2.0")
    {:error {:code -32600 :message "Invalid Request: missing or invalid jsonrpc version"}}

    (nil? (get request-map "method"))
    {:error {:code -32600 :message "Invalid Request: missing method"}}

    :else
    {:jsonrpc "2.0"
     :id      (get request-map "id")
     :method  (get request-map "method")
     :params  (or (get request-map "params") {})}))

(defn success-response
  "Build a JSON-RPC 2.0 success response."
  [id result]
  {"jsonrpc" "2.0"
   "id"      id
   "result"  result})

(defn error-response
  "Build a JSON-RPC 2.0 error response."
  ([id code message]
   {"jsonrpc" "2.0"
    "id"      id
    "error"   {"code" code "message" message}})
  ([id code message data]
   {"jsonrpc" "2.0"
    "id"      id
    "error"   {"code" code "message" message "data" data}}))

;;; --------------------------------------------- MCP Method Dispatch ----------------------------------------------

(def ^:private server-info
  {"name"    "metabase-mcp"
   "version" "0.1.0"})

(def ^:private server-capabilities
  {"tools" {}})

(defn handle-request
  "Dispatch a parsed JSON-RPC request to the appropriate MCP method handler.
   Returns a JSON-RPC response map."
  [tool-registry {:keys [id method params]}]
  (case method
    "initialize"
    (success-response id {"protocolVersion" "2025-03-26"
                          "serverInfo"      server-info
                          "capabilities"    server-capabilities})

    "notifications/initialized"
    nil ;; notification, no response

    "tools/list"
    (success-response id {"tools" (mcp.tools/list-tools tool-registry)})

    "tools/call"
    (let [tool-name (get params "name")
          arguments (get params "arguments" {})
          result    (mcp.tools/call-tool tool-registry tool-name arguments)]
      (success-response id result))

    ;; Default: method not found
    (error-response id -32601 (str "Method not found: " method))))
