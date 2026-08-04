(ns metabase.agent-api.usage
  "Agent API (CLI) usage logging.

  [[wrap-record-cli-usage]] is the single write point: a Ring middleware in the main handler
  stack that records one `agent_api_call_log` row for every `/api/*` HTTP call whose
  `User-Agent` identifies the Metabase CLI. MCP's synthetic in-process dispatch bypasses the
  Ring stack entirely, so it's never double-counted (those calls land in `mcp_tool_call_log`).

  The write is a `defenterprise` no-op in OSS — an OSS instance records nothing — with the real
  insert in `metabase-enterprise.agent-api.usage`. Like `ai_usage_log`, collection runs on every
  EE instance (`:feature :none`); the `:audit-app` feature gates the surfaces that read these
  rows (the audit view + page), not the writing.

  PII columns (`ip_address`, `error_message`) are populated only when
  `analytics-pii-retention-enabled` is on — a setting that is itself `:audit-app`-gated and
  defaults off, so PII is never collected without `:audit-app`. `client_name` is classified from
  the caller's self-reported `User-Agent` (analytics only — never used to gate access)."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.json :as json]))

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

(defn templatize-uri
  "Replace variable path segments in `uri` with `:id` (numeric) or `:uuid` (UUID v4) to reduce
  cardinality for analytics. `/api/card/134` → `/api/card/:id`,
  `/api/card/abc-def-…/query` → `/api/card/:uuid/query`."
  [^String uri]
  (-> uri
      (str/replace #"(?<=/)\d+(?=/|$)" ":id")
      (str/replace u/uuid-regex ":uuid")))

(defn- error-message-from-response
  "Best-effort human-readable error string from a response, for the gated `error_message` column.
  The body may be a Clojure map (inside the handler), a JSON string, or a bare string (after
  serialization). Handles all three; returns nil for streaming/opaque bodies."
  [{:keys [body]}]
  (cond
    (map? body)    (or (:message body) (:error body))
    (string? body) (or (try
                         (let [parsed (json/decode body keyword)]
                           (or (:message parsed) (:error parsed)))
                         (catch Exception _ nil))
                       body)
    :else          nil))

(defn wrap-record-cli-usage
  "Ring middleware that records one `agent_api_call_log` row for every `/api/*` call whose
  `User-Agent` identifies the Metabase CLI. MCP's synthetic in-process dispatch bypasses the
  Ring middleware stack entirely, so it's never double-counted (those calls are already in
  `mcp_tool_call_log`). Non-CLI callers pay zero overhead — a single header check."
  [handler]
  (fn [request respond raise]
    (let [user-agent (get-in request [:headers "user-agent"])
          ^String uri (:uri request)]
      (if-not (and (= "metabase-cli" (detect-client user-agent))
                   (str/starts-with? uri "/api/"))
        (handler request respond raise)
        (let [timer (u/start-timer)]
          (handler request
                   (fn [{:keys [status] :as response}]
                     (let [error? (or (nil? status) (>= status 400))]
                       (record-agent-api-call!
                        {:user-id       (or (:metabase-user-id request) api/*current-user-id*)
                         :tenant-id     (some-> api/*current-user* deref :tenant_id)
                         :user-agent    user-agent
                         :operation     (str (some-> (:request-method request) name u/upper-case-en)
                                             " " (templatize-uri uri))
                         :status        (if error? "error" "success")
                         :duration-ms   (long (u/since-ms timer))
                         :ip-address    (request/ip-address request)
                         :error-message (when error? (error-message-from-response response))}))
                     (respond response))
                   raise))))))
