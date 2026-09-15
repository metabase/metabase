(ns metabase-enterprise.api-keys.usage
  "Enterprise implementation of API-key usage logging.

  Writes one lean `api_key_usage_log` row per API-key-authenticated request and stamps
  `api_key.last_used_at` for liveness. Collection runs on every EE instance (`:feature :none`),
  mirroring `ai_usage_log`; the `ip_address` and `user_agent` columns are populated only when
  `analytics-pii-retention-enabled` is on (itself `:audit-app`-gated). The table has no free-text
  error column to gate — see `metabase.api-keys.usage` for why.

  Both writes go through Grouper batches, coalescing many requests into few DB round trips — the same
  pattern `metabase.query-processor.middleware.update-used-cards` uses for Card `last_used_at`: submit
  one event per request, dedupe to the max timestamp per key at flush time, then one bulk `CASE`/
  `GREATEST` UPDATE instead of one UPDATE per request. That dedup is what keeps a hot key cheap, not a
  throttle: however often a key's events land in the same batch, they collapse to one UPDATE for that
  key when the batch flushes.

  Every write is best-effort: a failure is logged and swallowed so logging never fails the API
  request and adds negligible latency. The two writes are independent of each other's success or
  failure, even though callers only see a single [[record-api-key-usage!]] entry point."
  (:require
   [java-time.api :as t]
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

;;; ---------------------------------------------- last_used_at ----------------------------------------------------

(def ^:private last-used-batch-capacity
  "How many `{api-key-id, timestamp}` events the last_used_at queue holds before it flushes early."
  500)

(def ^:private last-used-batch-interval-ms
  "How long the last_used_at queue coalesces events before flushing a batch UPDATE."
  (* 10 1000))

(defn- update-last-used-at!*
  "Grouper batch handler: dedupe `events` to the max timestamp per key, then one bulk UPDATE covering
  every key in the batch."
  [events]
  (let [id->timestamp (update-vals (group-by :id events) (fn [xs] (apply t/max (map :timestamp xs))))]
    (log/debugf "Updating last_used_at for %d API keys" (count id->timestamp))
    (try
      (api-keys.db/update-api-keys-last-used-at! id->timestamp)
      (catch Throwable e
        (log/warn e "Failed to update API key last_used_at")))))

(defonce ^:private last-used-queue
  (delay
    (grouper/start!
     #'update-last-used-at!*
     :capacity last-used-batch-capacity
     :interval last-used-batch-interval-ms)))

;;; ------------------------------------------------- entry point ---------------------------------------------------

(defenterprise record-api-key-usage!
  "EE: record one completed API-key-authenticated request. Queues one `api_key_usage_log` row and one
  `last_used_at` event, both via Grouper batches, never synchronously on the request thread.

  `ip_address` and `user_agent` are PII — stored only when `analytics-pii-retention-enabled` is on.
  `client_name` is classified from `user-agent` via [[metabase.api-keys.usage/detect-client]] and
  always recorded — non-PII, mirrors `agent_api_call_log`'s `client_name`. `embedding_client` is the
  raw `X-Metabase-Client` header, passed through unclassified and non-PII, supplementary to
  `client_name`. `embedding_hostname` is the hostname parsed from the embed referrer header, non-PII,
  always recorded — only meaningful alongside `embedding_client`. `occurred_at` is the caller-supplied
  request timestamp, not a DB-computed default — the row lands via a Grouper batch, so a DB default
  would record flush time instead of when the request happened; both writes share this one timestamp.
  `route_template`, `http_method`, `embedding_client`, and `embedding_hostname` are truncated to their
  column widths; a row missing a NOT NULL value is dropped rather than queued, so it can't sink the
  batch it would land in — the `last_used_at` event is queued regardless, since `api-key-id` is
  always present on an API-key-authenticated request."
  :feature :none
  [{:keys [api-key-id user-id tenant-id route-template http-method status duration-ms occurred-at
           user-agent ip-address embedding-client embedding-hostname]}]
  (let [occurred-at (or occurred-at (t/offset-date-time))]
    (when api-key-id
      (try
        (grouper/submit! @last-used-queue {:id api-key-id, :timestamp occurred-at})
        (catch Throwable e
          (log/warn e "Failed to record API key last_used_at"))))
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
                        :occurred_at         occurred-at
                        :client_name         (api-keys.usage/detect-client user-agent)
                        :embedding_client    (some-> embedding-client (u/truncate embedding-client-max-length))
                        :embedding_hostname  (some-> embedding-hostname (u/truncate embedding-hostname-max-length))}
                       pii)]
        (if-let [missing (not-empty (remove #(some? (get row %)) not-null-columns))]
          (log/warnf "Not recording API key usage log row, missing %s" (pr-str missing))
          (grouper/submit! @usage-log-queue row)))
      (catch Throwable e
        (log/warn e "Failed to record API key usage")))))
