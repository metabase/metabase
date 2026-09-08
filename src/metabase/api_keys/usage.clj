(ns metabase.api-keys.usage
  "API-key usage logging.

  Two write points feed the API-key analytics tables: one lean `api_key_usage_log` row per
  API-key-authenticated `/api/*` request, and a throttled `api_key.last_used_at` stamp that answers
  \"is this key still in use?\" cheaply. Both are `defenterprise` no-ops in OSS — an OSS instance
  records nothing — with the real writes in `metabase-enterprise.api-keys.usage`. Like
  `ai_usage_log`, collection runs on every EE instance (`:feature :none`); the `:audit-app` feature
  gates the surfaces that read these rows, not the writing.

  Both functions take already-resolved values, never a Ring request: the caller (the `log-api-call`
  hook) extracts everything on the request thread and hands it over as a plain map, so the write
  path never reaches back into request state.

  PII columns (`ip_address`, `user_agent`) are populated only when `analytics-pii-retention-enabled`
  is on — a setting that is itself `:audit-app`-gated and defaults off, so PII is never collected
  without `:audit-app`. `route_template` is the reconstructed Compojure route (e.g. `/api/card/:id`),
  never the raw URI or query string, so entity ids and filter values never land in the table.

  No free-text error column, deliberately. `mcp_tool_call_log` stores a truncated, PII-gated
  `error_message`, but `/api/*` failures echo submitted request data far more often than MCP tool
  calls do — validation errors quote the offending value, native-query errors quote the SQL — so an
  error string here would drag request payloads into an analytics table behind nothing but a PII
  toggle. `api_key_usage_log` therefore has no error column at all: the non-PII `status` column (the
  HTTP status code) already separates success from failure, and there is nothing free-text left to
  gate."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise record-api-key-request!
  "Write one `api_key_usage_log` row for a completed API-key-authenticated request. OSS no-op."
  metabase-enterprise.api-keys.usage
  [_request-info]
  nil)

(defenterprise record-api-key-last-used!
  "Stamp `api_key.last_used_at` for the key with `api-key-id`, throttled to at most one write per key
  per throttle window. OSS no-op."
  metabase-enterprise.api-keys.usage
  [_api-key-id]
  nil)
