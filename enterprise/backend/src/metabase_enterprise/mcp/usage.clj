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
            ;; `analytics-pii-retention-enabled` is on (nil otherwise). We keep only
            ;; user_agent / ip_address — embedding_* and sanitized_user_agent are not collected.
            pii (-> (analytics/pii-fields-from {:user-agent user-agent
                                                :ip-address ip-address})
                    (dissoc :embedding_hostname :embedding_path :sanitized_user_agent))]
        (t2/insert! :model/McpSessionLog
                    (merge {:id             session-id
                            :user_id        user-id
                            :tenant_id      tenant-id
                            :client_name    (mcp.usage/detect-client (:name client-info))
                            :client_version (truncate (:version client-info) 255)}
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

(defenterprise record-mcp-tool-call!
  "EE: write one `mcp_tool_call_log` row per `tools/call`. `error_code` (JSON-RPC code) is
  non-PII and always recorded on failure; `error_message` is PII — stored only when
  `analytics-pii-retention-enabled` is on (truncated), else null, like `query_execution.parameters`."
  :feature :none
  [{:keys [tool-name user-id session-id status duration-ms error-code error-message]}]
  (try
    (t2/insert! :model/McpToolCallLog
                {:tool_name      tool-name
                 :user_id        user-id
                 :mcp_session_id session-id
                 :status         status
                 :duration_ms    duration-ms
                 :error_code     error-code
                 :error_message  (when (analytics.settings/analytics-pii-retention-enabled)
                                   (truncate error-message error-message-max-length))})
    (catch Throwable e
      (log/warn e "Failed to record MCP tool call"))))
