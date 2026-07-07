(ns metabase-enterprise.mcp.usage
  "Enterprise implementation of MCP usage logging.

  Writes the session row at `initialize`, stamps `ended_at` at teardown, and writes one
  lean tool-call row per `tools/call`. Collection runs on every EE instance (`:feature
  :none`), mirroring `ai_usage_log`; PII columns are populated only when
  `analytics-pii-retention-enabled` is on (itself `:audit-app`-gated). Every write is
  best-effort: a failure is logged and swallowed so logging never fails the MCP request and
  adds negligible latency."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.mcp.usage :as mcp.usage]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private error-message-max-length
  "Cap on the stored error_message length (gated PII), mirroring query_execution.parameters."
  1024)

(def ^:private tool-name-max-length
  "Cap on the stored tool_name length, matching the `mcp_tool_call_log.tool_name` column width."
  255)

(def ^:private client-version-max-length
  "Cap on the stored client_version length, matching the `client_version` column width."
  255)

(def ^:private unknown-tool-name
  "Recorded when a `tools/call` arrives with no usable tool name (blank/missing — e.g. a malformed
  request that returns \"Unknown tool\"). Keeps the analytics row rather than dropping it to a
  swallowed NOT NULL violation."
  "unknown")

(defn- truncate
  "Truncate string `s` to at most `n` characters; nil-safe."
  [s n]
  (when s
    (let [s (str s)]
      (subs s 0 (min (count s) n)))))

(defenterprise record-mcp-session!
  "EE: upsert the `mcp_session_log` row at `initialize`. Identity + PII are set once — an
  existing row is left untouched (mirrors `metabot_conversation`). PII columns are populated
  only when `analytics-pii-retention-enabled` is on."
  :feature :none
  [{:keys [session-id user-id tenant-id client-info user-agent ip-address]}]
  (try
    (when (and session-id
               ;; mcp-remote fires a throwaway transport-probe handshake; never record it
               (not (mcp.usage/proxy-probe? (:name client-info)))
               (not (t2/exists? :model/McpSessionLog :id session-id)))
      (let [;; `pii-fields-from` returns the gated PII columns only when
            ;; `analytics-pii-retention-enabled` is on (nil otherwise). Allowlist the two columns
            ;; `mcp_session_log` actually has — selecting explicitly (rather than dissoc-ing the
            ;; unwanted ones) means a new field on the shared helper can't silently start
            ;; persisting here without a deliberate change.
            pii (select-keys (analytics/pii-fields-from {:user-agent user-agent
                                                         :ip-address ip-address})
                             [:user_agent :ip_address])]
        (t2/insert! :model/McpSessionLog
                    (merge {:id             session-id
                            :user_id        user-id
                            :tenant_id      tenant-id
                            :client_name    (mcp.usage/detect-client (:name client-info))
                            :client_version (truncate (:version client-info) client-version-max-length)}
                           pii))))
    (catch Throwable e
      (log/warn e "Failed to record MCP session"))))

(defenterprise record-mcp-session-end!
  "EE: stamp `ended_at` on the session row at teardown. Best-effort; the row may be absent
  (e.g. the session was opened before the feature was enabled)."
  :feature :none
  [session-id]
  (try
    (when session-id
      (t2/update! :model/McpSessionLog :id session-id {:ended_at :%now}))
    (catch Throwable e
      (log/warn e "Failed to record MCP session end"))))

(defn- resolve-client-identity
  "Client identity for a tool-call row, denormalized so `v_mcp_tool_calls` needs no session join.
  Resolved in priority order (matches the upcoming MCP RC, which drops sessions):
    1. `client-info` from the call's `_meta[\"io.modelcontextprotocol/clientInfo\"]` (RC clients);
    2. the identity stored on the session row at `initialize` (old-protocol clients);
    3. nothing.
  Returns `{:client_name <canonical> :client_version <version>}` (either key may be nil)."
  [client-info session-id]
  (cond
    client-info
    {:client_name    (mcp.usage/detect-client (:name client-info))
     :client_version (truncate (:version client-info) client-version-max-length)}

    session-id
    (t2/select-one [:model/McpSessionLog :client_name :client_version] :id session-id)

    :else nil))

(defenterprise record-mcp-tool-call!
  "EE: write one `mcp_tool_call_log` row per `tools/call`, with client identity + PII denormalized
  onto the row (resolved at call time via [[resolve-client-identity]]) so `v_mcp_tool_calls` needs
  no join to `mcp_session_log`. `error_code` (JSON-RPC code) is non-PII and always recorded on
  failure; `error_message` and the `ip_address`/`user_agent`/`sanitized_user_agent` columns are
  PII — stored only when `analytics-pii-retention-enabled` is on. `tool-name` is truncated and
  falls back to a sentinel when blank/missing, so a malformed call still records a row."
  :feature :none
  [{:keys [tool-name user-id session-id status duration-ms error-code error-message
           client-info tenant-id user-agent ip-address]}]
  (try
    (let [{:keys [client_name client_version]} (resolve-client-identity client-info session-id)
          ;; `pii-fields-from` returns the gated PII columns only when retention is on (nil
          ;; otherwise). Allowlist the three the tool-call row has, so a new field on the shared
          ;; helper can't silently start persisting here without a deliberate change.
          pii (select-keys (analytics/pii-fields-from {:user-agent user-agent
                                                       :ip-address ip-address})
                           [:user_agent :ip_address :sanitized_user_agent])]
      (t2/insert! :model/McpToolCallLog
                  (merge {:tool_name       (or (not-empty (truncate tool-name tool-name-max-length))
                                               unknown-tool-name)
                          :user_id         user-id
                          :client_name     client_name
                          :client_version  client_version
                          :tenant_id       tenant-id
                          :status          status
                          :duration_ms     duration-ms
                          :error_code      error-code
                          :error_message   (when (analytics.settings/analytics-pii-retention-enabled)
                                             (truncate error-message error-message-max-length))}
                         pii)))
    (catch Throwable e
      (log/warn e "Failed to record MCP tool call"))))
