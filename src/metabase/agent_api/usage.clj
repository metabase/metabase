(ns metabase.agent-api.usage
  "Agent API (CLI) usage logging.

  One write point feeds the analytics table: a lean `agent_api_call_log` row per direct Agent
  API HTTP call, recorded from the `routes` respond callback in `metabase.agent-api.api`. The
  write is a `defenterprise` no-op in OSS — an OSS instance records nothing — with the real
  insert in `metabase-enterprise.agent-api.usage`. Like `ai_usage_log`, collection runs on every
  EE instance (`:feature :none`); the `:audit-app` feature gates the surfaces that read these
  rows (the audit view + page), not the writing.

  PII columns (`ip_address`, `error_message`) are populated only when
  `analytics-pii-retention-enabled` is on — a setting that is itself `:audit-app`-gated and
  defaults off, so PII is never collected without `:audit-app`. `client_name` is classified from
  the caller's self-reported `User-Agent` (analytics only — never used to gate access)."
  (:require
   [clojure.string :as str]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]))

(def supported-client-keys
  "Canonical client keys [[detect-client]] classifies callers into for analytics. Keep in sync
  with the `client_name` CASE in the `v_agent_api_calls` view SQL (the enum-<->-CASE sync
  footgun)."
  #{"metabase-cli"})

(def ^:private client-name-matchers
  "Ordered `[substring canonical-key]` pairs matched against the lowercased `User-Agent`. First
  match wins. The Metabase CLI sends `metabase-cli/<version>`."
  [["metabase-cli" "metabase-cli"]])

(defn detect-client
  "Classify a caller's `User-Agent` into a canonical client key (one of [[supported-client-keys]]),
  or `\"other\"` when nothing matches (or the header is absent). Identity is self-reported and used
  for analytics only — never to gate access."
  [user-agent]
  (let [ua (some-> user-agent u/lower-case-en)]
    (or (when ua
          (some (fn [[needle k]] (when (str/includes? ua needle) k)) client-name-matchers))
        "other")))

(defenterprise record-agent-api-call!
  "Write a lean `agent_api_call_log` row for one direct Agent API HTTP call. OSS no-op."
  metabase-enterprise.agent-api.usage
  [_call-info]
  nil)
