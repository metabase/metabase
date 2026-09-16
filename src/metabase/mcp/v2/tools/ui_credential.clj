(ns metabase.mcp.v2.tools.ui-credential
  "The v2 `refresh_ui_credential` tool: the channel by which an MCP Apps iframe gets the short-lived credential
   it authenticates with.

   The shell used to carry the credential in its rendered HTML, but #81041 moved delivery to a server tool and
   dropped the placeholder from the production template — so a v2 iframe boots with no credential and must ask
   for one. v1 gained that tool; v2 did not, which left its Apps unable to bootstrap at all.

   The credential rides private `_meta` rather than the content channel: it is for the host, never for the
   model, and `metabase.mcp.v2.registry` strips it before the result reaches an eval trace."
  (:require
   [metabase.api.common :as api]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]))

(set! *warn-on-reflection* true)

(registry/deftool refresh-ui-credential
  "Refresh the scoped credential used by a Metabase MCP App. Called by the app itself, not by the model."
  {:name                "refresh_ui_credential"
   ;; The same scope the iframe shells gate on: this tool exists only to serve them, and a caller who cannot
   ;; read the shell has nothing to authenticate to.
   :scope               metabot.scope/agent-query-run
   ;; Hidden from clients that cannot render an iframe, exactly like the shells — otherwise a model in a
   ;; text-only client sees a tool whose whole output is a credential it must not handle.
   :required-extensions #{:mcp-app-ui}
   :annotations         {:readOnlyHint true :idempotentHint true}
   :_meta               {:ui {:visibility ["app"]}}
   :args                [:map {:closed true}]}
  [_arguments {:keys [session-id token-scopes]}]
  (if (and session-id api/*current-user-id*)
    ;; Always minted with the caller's scopes, which is what subjects the credential to the native-SQL gate
    ;; on /api/dataset. (v1's claimless, gate-exempt 2-arity retired with v1 in this slice.)
    (assoc (common/success-content "MCP UI credential refreshed.")
           :_meta {common/mcp-apps-meta-key
                   {:credential (mcp.session/issue-ui-credential session-id api/*current-user-id* token-scopes)
                    :sessionId  session-id}})
    (common/error-content "Refreshing an MCP UI credential requires an authenticated MCP session."
                          common/error-code-invalid-request)))
