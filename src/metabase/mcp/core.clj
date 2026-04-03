(ns metabase.mcp.core
  "Public API for the MCP module. External consumers should use this namespace
   rather than reaching into internal namespaces like [[metabase.mcp.settings]]."
  (:require
   [clojure.string :as str]
   [metabase.mcp.settings :as mcp.settings]))

(defn cors-origins
  "Returns space-separated CORS origins from both common and custom MCP client settings."
  []
  (mcp.settings/mcp-apps-cors-origins))

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
