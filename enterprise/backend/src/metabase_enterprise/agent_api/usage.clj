(ns metabase-enterprise.agent-api.usage
  "Enterprise implementation of Agent API (CLI) usage logging.

  Writes one lean `agent_api_call_log` row per direct Agent API HTTP call. Collection runs on
  every EE instance (`:feature :none`), mirroring `ai_usage_log`; the `ip_address` and
  `error_message` PII columns are populated only when `analytics-pii-retention-enabled` is on
  (itself `:audit-app`-gated). Every write is best-effort: a failure is logged and swallowed so
  logging never fails the Agent API request and adds negligible latency."
  (:require
   [metabase.agent-api.usage :as agent-api.usage]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private error-message-max-length
  "Cap on the stored error_message length (gated PII), mirroring query_execution.parameters."
  1024)

(def ^:private operation-max-length
  "Cap on the stored operation length, matching the `agent_api_call_log.operation` column width."
  255)

(defenterprise record-agent-api-call!
  "EE: write one `agent_api_call_log` row per direct Agent API HTTP call. `client_name` is
  classified from the caller's self-reported User-Agent; `status` is success/error. `ip_address`
  and `error_message` are PII — stored only when `analytics-pii-retention-enabled` is on."
  :feature :none
  [{:keys [user-id tenant-id user-agent operation status duration-ms ip-address error-message]}]
  (try
    (let [;; `pii-fields-from` returns the gated PII columns only when retention is on (nil
          ;; otherwise). Allowlist the one column the row has, so a new field on the shared helper
          ;; can't silently start persisting here without a deliberate change.
          pii (select-keys (analytics/pii-fields-from {:user-agent user-agent
                                                       :ip-address ip-address})
                           [:ip_address])]
      (t2/insert! :model/AgentApiCallLog
                  (merge {:user_id       user-id
                          :tenant_id     tenant-id
                          :client_name   (agent-api.usage/detect-client user-agent)
                          :operation     (some-> operation (u/truncate operation-max-length))
                          :status        status
                          :duration_ms   duration-ms
                          :error_message (when (analytics.settings/analytics-pii-retention-enabled)
                                           (some-> error-message (u/truncate error-message-max-length)))}
                         pii)))
    (catch Throwable e
      (log/warn e "Failed to record Agent API call"))))
