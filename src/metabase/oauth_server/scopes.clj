(ns metabase.oauth-server.scopes
  "Top-level (non-agent) OAuth scopes issued by the embedded authorization server.

  The granular `agent:*` scopes used by Metabot tools / the MCP server are declared in
  [[metabase.metabot.scope]]. This namespace declares the broader, first-party grants
  used by clients such as the Metabase CLI, where the credential is meant to act as the
  human user across the whole REST API rather than a narrow set of agent endpoints."
  (:require
   [metabase.api-scope.core :as api-scope]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(api-scope/defscope full-access "mb:full"
  (deferred-tru "Full access to Metabase as your user account"))
