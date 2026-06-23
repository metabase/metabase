(ns metabase.mcp.usage
  "MCP usage logging.

  Three write points feed the MCP analytics tables: the session row at the `initialize`
  handshake, its `ended_at` stamp at session teardown, and one lean tool-call row per
  `tools/call`. All three are `defenterprise` no-ops in OSS — an OSS instance records
  nothing — with the real inserts in `metabase-enterprise.mcp.usage`. Like `ai_usage_log`,
  collection runs on every EE instance (`:feature :none`); the `:audit-app` feature gates
  the surfaces that read these rows (the audit view + page), not the writing.

  PII columns are populated only when `analytics-pii-retention-enabled` is on — a setting
  that is itself `:audit-app`-gated and defaults off, so PII is never collected without
  `:audit-app`. `client_name` is derived from the `initialize` handshake `clientInfo`
  (authoritative), never from User-Agent parsing."
  (:require
   [clojure.string :as str]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]))

(def supported-client-keys
  "Canonical MCP client keys we classify into for analytics. Kept in sync with the keys of
  `mcp-client-apps-sandbox-domains` in `metabase.mcp.settings` (the CORS-enabled set)."
  #{"claude" "chatgpt" "cursor-vscode"})

(def ^:private client-name-matchers
  "Ordered `[substring canonical-key]` pairs matched against the lowercased handshake
  `clientInfo.name`. First match wins."
  [["claude"  "claude"]
   ["chatgpt" "chatgpt"]
   ["openai"  "chatgpt"]
   ["cursor"  "cursor-vscode"]])

(defn detect-client
  "Classify the `initialize`-handshake `clientInfo` name into a canonical client key (one of
  [[supported-client-keys]]), or `\"other\"` when nothing matches. Identity comes from the
  handshake name, never User-Agent parsing."
  [client-info-name]
  (let [n (some-> client-info-name u/lower-case-en)]
    (or (when n
          (some (fn [[needle k]] (when (str/includes? n needle) k)) client-name-matchers))
        "other")))

(defenterprise record-mcp-session!
  "Upsert an `mcp_session_log` row at the MCP `initialize` handshake. Identity + PII are
  written once and never overwritten. OSS no-op."
  metabase-enterprise.mcp.usage
  [_session-info]
  nil)

(defenterprise record-mcp-session-end!
  "Stamp `ended_at` on an `mcp_session_log` row at session teardown. OSS no-op."
  metabase-enterprise.mcp.usage
  [_session-id]
  nil)

(defenterprise record-mcp-tool-call!
  "Write a lean `mcp_tool_call_log` row for a `tools/call`. OSS no-op."
  metabase-enterprise.mcp.usage
  [_tool-call-info]
  nil)
