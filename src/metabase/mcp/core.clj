(ns metabase.mcp.core
  "Public API for the MCP module. External consumers should use this namespace
   rather than reaching into internal namespaces like [[metabase.mcp.settings]]."
  (:require
   [clojure.string :as str]
   [metabase.mcp.paths :as mcp.paths]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.usage :as mcp.usage]))

(set! *warn-on-reflection* true)

(defn mcp-canonical-path
  "The advertised MCP URL path, relative to site-url (see [[metabase.mcp.paths/canonical-path]])."
  []
  mcp.paths/canonical-path)

(defn mcp-endpoint-paths
  "Every path serving MCP, canonical plus back-compat aliases
   (see [[metabase.mcp.paths/endpoint-paths]])."
  []
  mcp.paths/endpoint-paths)

(defn cors-origins
  "Returns space-separated CORS origins from both common and custom MCP client settings."
  []
  (mcp.settings/mcp-apps-cors-origins))

(defn mcp-enabled?
  "Whether the MCP server is enabled (composes [[metabase.llm.settings/ai-features-enabled?]])."
  []
  (mcp.settings/mcp-enabled?))

(defn inline-ui-enabled-for-client?
  "Whether the admin allows the client named `client-info-name` (from the `initialize` handshake) to render
   MCP Apps UI. See [[metabase.mcp.settings/inline-ui-enabled-for-client?]]."
  [client-info-name]
  (mcp.settings/inline-ui-enabled-for-client? (mcp.usage/detect-client client-info-name)))

(defn vscode-webview-enabled?
  "Returns true if vscode/cursor is enabled in common MCP apps."
  []
  (some #{"cursor-vscode"} (mcp.settings/mcp-apps-cors-enabled-clients)))

(defn sandbox-origin?
  "Returns true if the origin matches an enabled MCP client's non-standard sandbox pattern.
   Currently handles vscode-webview:// origins used by VS Code and Cursor."
  [raw-origin]
  (when raw-origin
    (condp #(str/starts-with? %2 %1) raw-origin
      "vscode-webview://" (vscode-webview-enabled?)
      false)))

(defn v2-scopes
  "The scopes the v2 MCP surface itself gates on."
  []
  mcp.scope/v2-surface-scopes)

(defn v2-baseline-scope?
  "Is `scope` locked on the consent page?"
  [scope]
  (mcp.scope/v2-baseline-scope? scope))
