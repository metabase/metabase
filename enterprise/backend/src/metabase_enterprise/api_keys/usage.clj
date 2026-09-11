(ns metabase-enterprise.api-keys.usage
  "Enterprise implementation of API-key usage logging.

  Writes one lean `api_key_usage_log` row per API-key-authenticated request and stamps
  `api_key.last_used_at` for liveness. Collection runs on every EE instance (`:feature :none`),
  mirroring `ai_usage_log`; the `ip_address` and `user_agent` columns are populated only when
  `analytics-pii-retention-enabled` is on (itself `:audit-app`-gated). The table has no free-text
  error column to gate — see `metabase.api-keys.usage` for why.

  Both writes stay off the hot path in different ways, because the two problems have different
  shapes:

    - the usage-log row is submitted to a Grouper queue and inserted as a coalesced batch, so a
      request never waits on an INSERT (one row per request is far too much traffic to write
      synchronously);
    - `last_used_at` is a small in-place UPDATE throttled per key by an atom timer, so a hot key
      costs one UPDATE per throttle window instead of one per request. Batching would be the wrong
      tool: we want at most one write per key per window, not many coalesced writes.

  Every write is best-effort: a failure is logged and swallowed so logging never fails the API
  request and adds negligible latency."
  (:require
   [metabase-enterprise.api-keys.db :as ee.api-keys.db]
   [metabase.analytics.core :as analytics]
   [metabase.api-keys.db :as api-keys.db]
   [metabase.api-keys.usage :as api-keys.usage]
   [metabase.batch-processing.core :as grouper]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private route-template-max-length
  "Cap on the stored route_template length, matching the `api_key_usage_log.route_template` column width."
  255)

(def ^:private http-method-max-length
  "Cap on the stored http_method length, matching the `api_key_usage_log.http_method` column width."
  10)

(def ^:private ip-address-max-length
  "Cap on the stored ip_address length, matching the `api_key_usage_log.ip_address` column width. Long
  enough for IPv6; a forwarded-for header longer than that is truncated rather than failing the insert."
  45)

(def ^:private embedding-client-max-length
  "Cap on the stored embedding_client length, matching the `api_key_usage_log.embedding_client` column
  width. Caller-supplied and unvalidated, unlike client_name — truncate rather than fail the insert."
  255)

(def ^:private embedding-hostname-max-length
  "Cap on the stored embedding_hostname length, matching the `api_key_usage_log.embedding_hostname`
  column width. `extract-hostname` already truncates to this width; kept here so this row survives a
  future change to that shared helper."
  512)

;;; ------------------------------------------------- usage log ----------------------------------------------------

(def ^:private usage-log-batch-capacity
  "How many rows the usage-log queue holds before it flushes early."
  500)

(def ^:private usage-log-batch-interval-ms
  "How long the usage-log queue coalesces rows before flushing a batch insert."
  (* 10 1000))

(def ^:private not-null-columns
  "The `api_key_usage_log` columns declared NOT NULL. Rows are inserted in coalesced batches, so a row
  missing one of these would fail every row batched with it, not just itself — an incomplete row is
  dropped before it is queued instead."
  [:api_key_id :route_template :http_method :status :duration_ms :client_name])

(defn- insert-usage-logs!*
  "Grouper batch handler: insert one coalesced batch of `api_key_usage_log` rows."
  [rows]
  (log/debugf "Inserting %d api_key_usage_log rows" (count rows))
  (try
    (ee.api-keys.db/insert-usage-logs! rows)
    (catch Throwable e
      (log/warn e "Failed to insert API key usage log rows"))))

(defonce ^:private usage-log-queue
  (delay
    (grouper/start!
     #'insert-usage-logs!*
     :capacity usage-log-batch-capacity
     :interval usage-log-batch-interval-ms)))

(defenterprise record-api-key-request!
  "EE: queue one `api_key_usage_log` row for a completed API-key-authenticated request. The row is
  inserted by a Grouper batch, never synchronously on the request thread. `ip_address` and
  `user_agent` are PII — stored only when `analytics-pii-retention-enabled` is on. `client_name` is
  classified from `user-agent` via [[metabase.api-keys.usage/detect-client]] and always recorded —
  non-PII, mirrors `agent_api_call_log`'s `client_name`. `embedding_client` is the raw
  `X-Metabase-Client` header, passed through unclassified and non-PII, supplementary to `client_name`.
  `embedding_hostname` is the hostname parsed from the embed referrer header, non-PII, always recorded
  — only meaningful alongside `embedding_client`. `route_template`, `http_method`, `embedding_client`,
  and `embedding_hostname` are truncated to their column widths; a row missing a NOT NULL value is
  dropped rather than queued, so it can't sink the batch it would land in."
  :feature :none
  [{:keys [api-key-id user-id tenant-id route-template http-method status duration-ms
           user-agent ip-address embedding-client embedding-hostname]}]
  (try
    (let [;; `pii-fields-from` returns the gated PII columns only when retention is on (nil
          ;; otherwise). Allowlist the two columns this row has, so a new field on the shared helper
          ;; can't silently start persisting here without a deliberate change.
          pii (some-> (analytics/pii-fields-from {:user-agent user-agent
                                                  :ip-address ip-address})
                      (select-keys [:user_agent :ip_address])
                      (update :ip_address #(some-> % (u/truncate ip-address-max-length))))
          row (merge {:api_key_id          api-key-id
                      :user_id             user-id
                      :tenant_id           tenant-id
                      :route_template      (some-> route-template (u/truncate route-template-max-length))
                      :http_method         (some-> http-method (u/truncate http-method-max-length))
                      :status              status
                      :duration_ms         duration-ms
                      :client_name         (api-keys.usage/detect-client user-agent)
                      :embedding_client    (some-> embedding-client (u/truncate embedding-client-max-length))
                      :embedding_hostname  (some-> embedding-hostname (u/truncate embedding-hostname-max-length))}
                     pii)]
      (if-let [missing (not-empty (remove #(some? (get row %)) not-null-columns))]
        (log/warnf "Not recording API key usage, row is missing %s" (pr-str missing))
        (grouper/submit! @usage-log-queue row)))
    (catch Throwable e
      (log/warn e "Failed to record API key usage"))))

;;; ---------------------------------------------- last_used_at ----------------------------------------------------

(def ^:private last-used-throttle-ms
  "Minimum interval between `api_key.last_used_at` writes for the same key, in milliseconds. Mirrors
  the session activity throttle in `metabase.session.core`."
  60000)

(def ^:private last-used-update-times
  "In-memory `{api-key-id -> timer}` used to throttle `last_used_at` DB writes: each key is stamped at
  most once per [[last-used-throttle-ms]]. Timer values are opaque, created by
  [[metabase.util/start-timer]]. Unlike the session variant this needs no pruning task — it is keyed
  by API key id, so it is bounded by the number of keys on the instance rather than by session churn."
  (atom {}))

(defn- throttle-allows-write?
  "Atomically record that a `last_used_at` write for `api-key-id` is happening now if enough time has
  elapsed since the last one. Returns true when the caller should proceed with the DB write, false
  when throttled."
  [api-key-id]
  (let [now     (u/start-timer)
        old-val @last-used-update-times
        timer   (get old-val api-key-id)]
    (if (or (nil? timer)
            (> (u/since-ms timer) last-used-throttle-ms))
      (compare-and-set! last-used-update-times old-val (assoc old-val api-key-id now))
      false)))

(defn reset-last-used-throttle!
  "Forget every recorded `last_used_at` write time, so the next request for any key writes again.
  Intended for use in tests."
  []
  (reset! last-used-update-times {}))

(defenterprise record-api-key-last-used!
  "EE: stamp `api_key.last_used_at` for the key with `api-key-id`, throttled to at most one write per
  key per [[last-used-throttle-ms]] so a hot key costs one small UPDATE a minute rather than one per
  request. Goes through [[metabase.api-keys.db/update-api-key-last-used-at!]], a plain UPDATE that
  skips the ApiKey model hooks — a liveness stamp must not publish an `:event/api-key-update` audit
  event or move `updated_at`."
  :feature :none
  [api-key-id]
  (try
    (when (and api-key-id (throttle-allows-write? api-key-id))
      (api-keys.db/update-api-key-last-used-at! api-key-id))
    (catch Throwable e
      (log/warn e "Failed to record API key last_used_at"))))
