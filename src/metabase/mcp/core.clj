(ns metabase.mcp.core
  "Public API for the MCP module. External consumers should use this namespace
   rather than reaching into internal namespaces like [[metabase.mcp.settings]]."
  (:require
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.mcp.paths :as mcp.paths]
   [metabase.mcp.resources :as mcp.resources]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.settings :as mcp.settings]))

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
   The v1 resource scopes stay in the union until the v1 surface retires.

   DCR snapshots this set into a client's registered scopes when the client registers without naming any, and
   the OAuth server's `validate-scope` then checks a requested scope against that per-client snapshot. So a
   scope the v2 401 challenge asks for must be here, or a freshly registered client that follows the challenge
   is answered \"Invalid scope\" instead of having its grant narrowed. A client registered before a scope was
   added keeps its older snapshot until it re-registers."
  []
  (-> (sorted-set)
      ;; agent-api scopes from defendpoint metadata
      (into (comp (keep #(get-in % [:form :metadata :scope]))
                  (filter string?))
            (vals (api.macros/ns-routes 'metabase.agent-api.api)))
      ;; The v2 surface's scopes, read from the require-free leaf rather than from the registry. Deriving them
      ;; from `v2.registry/registered-scopes` would report only the tools whose namespaces happen to be loaded,
      ;; and reaching `v2.resources` from here puts `metabot.scope` (and `premium-features`) on the security
      ;; middleware's load path — the cycle `metabase.mcp.paths`' docstring exists to prevent. The literal set
      ;; already covers every scope the v2 tools and resources gate on, and
      ;; `v2-surface-scopes-match-metabot-scope-test` keeps it in step.
      (into mcp.paths/v2-surface-scopes)
      ;; v1 resource scopes (retire with the v1 surface)
      (into (mcp.resources/resource-scopes))))
