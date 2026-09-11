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
  gate.

  `client_name` is classified from the caller's self-reported `User-Agent` via [[detect-client]] —
  analytics only, never used to gate access — mirroring `agent_api_call_log`'s `client_name`. Unlike
  `user_agent` (raw, PII-gated), `client_name` is a canonical, low-cardinality value and is always
  recorded.

  `embedding_client` is the raw `X-Metabase-Client` header, when present — non-PII (same status as
  `view_log`/`query_execution.embedding_client`), passed through unclassified. It's supplementary:
  `client_name` stays the primary classification axis, since almost no API-key traffic sets this
  header (the SDK/embed.js clients that do authenticate via JWT/SSO, not API keys).

  `embedding_hostname` is the hostname parsed from the embed referrer header, when present — non-PII
  (same status as `view_log`/`query_execution`/`metabot_conversation.embedding_hostname`), always
  recorded. Only meaningful alongside `embedding_client`: the SDK sends an API key only on localhost,
  so a non-localhost hostname on embedding traffic is worth flagging."
  (:require
   [clojure.string :as str]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]))

(def supported-client-keys
  "Canonical client keys [[detect-client]] classifies callers into for analytics. Keep in sync with
  the `client_name` CASE in the `v_api_key_usage` view SQL (the enum-<->-CASE sync footgun)."
  #{"metabase-cli" "curl" "postman" "python-requests" "r" "node"})

(def ^:private client-name-matchers
  "Ordered `[substring canonical-key]` pairs matched against the lowercased `User-Agent`. First match
  wins. `r-curl` is checked before the generic `curl` so R's httr (whose User-Agent embeds `r-curl`)
  doesn't fall through to the plain curl classification. Covers the tools/languages the public API
  docs demonstrate, plus the Metabase CLI, which authenticates exclusively via API key."
  [["metabase-cli"    "metabase-cli"]
   ["postmanruntime"  "postman"]
   ["python-requests" "python-requests"]
   ["r-curl"          "r"]
   ["got (https"      "node"]
   ["curl"            "curl"]])

(defn detect-client
  "Classify a caller's `User-Agent` into a canonical client key (one of [[supported-client-keys]]), or
  `\"other\"` when nothing matches (or the header is absent). Identity is self-reported and used for
  analytics only — never to gate access."
  [user-agent]
  (let [ua (some-> user-agent u/lower-case-en)]
    (or (when ua
          (some (fn [[needle k]] (when (str/includes? ua needle) k)) client-name-matchers))
        "other")))

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
