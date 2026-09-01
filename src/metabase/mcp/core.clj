(ns metabase.mcp.core
  "Public API for the MCP module. External consumers should use this namespace
   rather than reaching into internal namespaces like [[metabase.mcp.settings]]."
  (:require
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.mcp.resources :as mcp.resources]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.v2.registry :as v2.registry]
   [metabase.mcp.v2.resources :as v2.resources]))

(set! *warn-on-reflection* true)

(defn cors-origins
  "Returns space-separated CORS origins from both common and custom MCP client settings."
  []
  (mcp.settings/mcp-apps-cors-origins))

(defn mcp-enabled?
  "Whether the MCP server is enabled (composes [[metabase.llm.settings/ai-features-enabled?]])."
  []
  (mcp.settings/mcp-enabled?))

(defn resolve-ui-credential
  "Resolves a credential issued for an MCP UI resource."
  [credential]
  (mcp.session/resolve-ui-credential credential))

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

(defn all-scopes
  "All supported OAuth scopes: those declared on agent-api endpoints via defendpoint metadata, the
   scopes v2 tools gate on (registry), and the scopes v2 UI resources gate on (e.g. visualize_query).
   The v1 resource scopes stay in the union until the v1 surface retires."
  []
  (-> (sorted-set)
      ;; agent-api scopes from defendpoint metadata
      (into (comp (keep #(get-in % [:form :metadata :scope]))
                  (filter string?))
            (vals (api.macros/ns-routes 'metabase.agent-api.api)))
      ;; mcp v2 tool scopes
      (into (v2.registry/registered-scopes))
      ;; mcp v2 ui-resource scopes
      (into (v2.resources/resource-scopes))
      ;; v1 resource scopes (retire with the v1 surface)
      (into (mcp.resources/resource-scopes))))
