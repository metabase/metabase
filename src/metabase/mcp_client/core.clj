(ns metabase.mcp-client.core
  "Client for remote MCP (Model Context Protocol) servers over Streamable HTTP.

    (require '[metabase.mcp-client.core :as mcp])
    (def c (mcp/client {:url \"https://example.com/mcp\" :headers {\"Authorization\" \"Bearer ...\"}}))
    (mcp/discover c)
    (mcp/all-tools c)
    (mcp/call-tool c \"search\" {:query \"revenue\"})
    (mcp/close! c)

  Servers that require OAuth are authorized through [[metabase.mcp-client.oauth/authorize!]] and
  [[metabase.mcp-client.oauth/authorized-client]]. Admin-registered servers and users' stored connections to them
  are reached through [[user-tools]] and [[call-user-tool!]].

  Results are the server's JSON-RPC results with their keys kept verbatim (`:inputSchema`, `:isError`, ...).
  Failures throw `ex-info` whose `:type` is one of `:mcp-client/jsonrpc-error`, `:mcp-client/http-error`,
  `:mcp-client/unsupported-protocol-version`, `:mcp-client/malformed-response`,
  `:mcp-client/network-policy-error`, or `:mcp-client/invalid-options`."
  (:require
   [metabase.mcp-client.client :as client]
   [metabase.mcp-client.tools :as tools]
   [metabase.util.namespaces :as shared.ns]))

(shared.ns/import-fns
 [client
  all-tools
  call-tool
  client
  close!
  discover
  get-prompt
  list-prompts
  list-resource-templates
  list-resources
  list-tools
  read-resource]
 [tools
  call-user-tool!
  user-tools])
