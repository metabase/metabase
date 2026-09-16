(ns metabase-enterprise.api-keys.usage
  "Enterprise implementation of API-key usage logging.

  Writes one lean `api_key_usage_log` row per API-key-authenticated request and stamps
  `api_key.last_used_at` for liveness. Collection runs on every EE instance (`:feature :none`),
  mirroring `ai_usage_log`; the `ip_address` and `user_agent` columns are populated only when
  `analytics-pii-retention-enabled` is on (itself `:audit-app`-gated). The table has no free-text
  error column to gate — see `metabase.api-keys.usage` for why.

  Both writes coalesce in memory and flush on a fixed interval via a scheduled task, not Grouper: a
  Grouper queue falls back to a *blocking* put once full, which would stall the request thread behind
  a slow DB write. The usage-log write bounds a pending vector and drops (logged) rather than blocks
  once full; the last_used_at write coalesces to one pending entry per key, so it never needs a
  capacity bound at all — see the two sections below for each.

  Every write is best-effort: a failure is logged and swallowed so logging never fails the API
  request and adds negligible latency. The two writes are independent of each other's success or
  failure, even though callers only see a single [[record-api-key-usage!]] entry point."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.api-keys.db :as ee.api-keys.db]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.sdk :as analytics.sdk]
   [metabase.api-keys.db :as api-keys.db]
   [metabase.api-keys.usage :as api-keys.usage]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.request.core :as request]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

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
  "How many rows the pending usage-log queue holds before a new row is dropped rather than queued."
  500)

(def ^:private usage-log-flush-interval-seconds
  "How often pending usage-log rows flush to the database."
  10)

(def ^:private not-null-columns
  "The `api_key_usage_log` columns declared NOT NULL. Rows are inserted in batches, so a row missing
  one of these would fail every row batched with it, not just itself — an incomplete row is dropped
  before it is queued instead."
  [:api_key_id :route_template :http_method :status :duration_ms :client_name])

(defonce ^:private pending-usage-logs (atom []))

(defn- offer-usage-log!
  "Appends `row` to the pending batch, unless it's already at [[usage-log-batch-capacity]] — a full
  queue drops the row (logged) rather than blocking the request thread waiting for room. The `swap!`
  CAS retry is itself non-blocking: contention just means more retries, never a park on I/O."
  [row]
  (let [dropped? (volatile! false)]
    (swap! pending-usage-logs
           (fn [rows]
             (if (>= (count rows) usage-log-batch-capacity)
               (do (vreset! dropped? true) rows)
               (conj rows row))))
    (when @dropped?
      (log/warn "Dropping API key usage log row; the pending queue is full"))))

(defn- flush-usage-logs!
  "Scheduled-task handler: atomically take the current pending rows and insert them as one batch."
  []
  (let [[rows] (reset-vals! pending-usage-logs [])]
    (when (seq rows)
      (log/debugf "Inserting %d api_key_usage_log rows" (count rows))
      (try
        (ee.api-keys.db/insert-usage-logs! rows)
        (catch Throwable e
          (log/warn e "Failed to insert API key usage log rows"))))))

(def ^:private usage-log-flush-job-key (jobs/key "metabase.task.api-keys.usage-log-flush.job"))
(def ^:private usage-log-flush-trigger-key (triggers/key "metabase.task.api-keys.usage-log-flush.trigger"))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Flush pending API key usage log rows"}
  ApiKeyUsageLogFlush [_ctx]
  (flush-usage-logs!))

(defmethod task/init! ::ApiKeyUsageLogFlush
  [_]
  (let [job     (jobs/build
                 (jobs/of-type ApiKeyUsageLogFlush)
                 (jobs/with-identity usage-log-flush-job-key))
        trigger (triggers/build
                 (triggers/with-identity usage-log-flush-trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  (simple/schedule
                   (simple/with-interval-in-seconds usage-log-flush-interval-seconds)
                   (simple/repeat-forever))))]
    (task/schedule-task! job trigger)))

;;; ---------------------------------------------- last_used_at ----------------------------------------------------

;; A coalescing map, not a Grouper queue of events: a Grouper queue keeps every event until it flushes, so a hot
;; key piles up hundreds of entries between flushes only to have all but the newest discarded at flush time. Here,
;; each request updates its key's entry *in place* — a busy key costs one map entry, not one entry per request — and
;; a scheduled task flushes the current contents on a fixed interval. `reset-vals!` atomically swaps in a fresh
;; empty map and returns the one it replaced, so a request arriving mid-flush lands in the new map and is picked up
;; next interval, never lost and never blocking the flush.

(def ^:private last-used-flush-interval-seconds
  "How often pending last_used_at stamps flush to the database."
  10)

;; api-key-id -> the latest `occurred-at` seen for it since the last flush.
(defonce ^:private pending-last-used-at (atom {}))

(defn- stamp-last-used-at! [api-key-id timestamp]
  (swap! pending-last-used-at update api-key-id
         (fn [existing] (if existing (t/max existing timestamp) timestamp))))

(defn- flush-last-used-at!
  "Scheduled-task handler: atomically take the current pending map and issue one bulk UPDATE for it.
  Keys skipped because a concurrent writer held the row go back into the pending map for the next
  flush, merged against whatever arrived for them in the meantime (the newer of the two wins) rather
  than overwriting it."
  []
  (let [[batch] (reset-vals! pending-last-used-at {})]
    (when (seq batch)
      (log/debugf "Updating last_used_at for %d API keys" (count batch))
      (try
        (let [skipped (api-keys.db/update-api-keys-last-used-at! batch)]
          (when (seq skipped)
            (log/debugf "Retrying last_used_at for %d busy API keys next flush" (count skipped))
            (swap! pending-last-used-at #(merge-with t/max % skipped))))
        (catch Throwable e
          (log/warn e "Failed to update API key last_used_at"))))))

(def ^:private last-used-flush-job-key (jobs/key "metabase.task.api-keys.last-used-flush.job"))
(def ^:private last-used-flush-trigger-key (triggers/key "metabase.task.api-keys.last-used-flush.trigger"))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Flush pending API key last_used_at stamps"}
  ApiKeyLastUsedAtFlush [_ctx]
  (flush-last-used-at!))

(defmethod task/init! ::ApiKeyLastUsedAtFlush
  [_]
  (let [job     (jobs/build
                 (jobs/of-type ApiKeyLastUsedAtFlush)
                 (jobs/with-identity last-used-flush-job-key))
        trigger (triggers/build
                 (triggers/with-identity last-used-flush-trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  (simple/schedule
                   (simple/with-interval-in-seconds last-used-flush-interval-seconds)
                   (simple/repeat-forever))))]
    (task/schedule-task! job trigger)))

;;; ------------------------------------------------- entry point ---------------------------------------------------

(defn- request-user-agent [request] (get-in request [:headers "user-agent"]))
(defn- request-embedding-client [request] (get-in request [:headers "x-metabase-client"]))
(defn- request-embedding-hostname [request]
  (analytics.sdk/extract-hostname (get-in request [:headers "x-metabase-embed-referrer"])))

(defenterprise record-api-key-usage!
  "EE: record one completed API-key-authenticated request. Queues one `api_key_usage_log` row and one
  `last_used_at` event, both flushed on a scheduled interval, never synchronously on the request thread.

  Takes the raw `request`/`response` and extracts everything itself, plus `extra-info` for the
  handful of values only the caller can supply: `route-template` (read from the carrier the caller
  installed before routing ran — see `metabase.api.macros/route-template-carrier-key`), `duration-ms`
  (measured by the caller around the whole request), and `occurred-at` (captured on the request
  thread rather than left for the DB to fill in at INSERT time — the row lands via a Grouper batch, up
  to the batch interval later, so a DB-computed default would record when the batch flushed, not when
  the request happened).

  `ip_address` and `user_agent` are PII — stored only when `analytics-pii-retention-enabled` is on.
  `client_name` is classified from `user-agent` via [[metabase.api-keys.usage/detect-client]] and
  always recorded — non-PII, mirrors `agent_api_call_log`'s `client_name`. `embedding_client` is the
  raw `X-Metabase-Client` header, passed through unclassified and non-PII, supplementary to
  `client_name`. `embedding_hostname` is the hostname parsed from the embed referrer header, non-PII,
  always recorded — only meaningful alongside `embedding_client`. `route_template`, `http_method`,
  `embedding_client`, and `embedding_hostname` are truncated to their column widths; a row missing a
  NOT NULL value is dropped rather than queued, so it can't sink the batch it would land in — the
  `last_used_at` event is queued regardless, since `api-key-id` is always present on an
  API-key-authenticated request."
  :feature :none
  [request response {:keys [route-template duration-ms occurred-at]}]
  (let [api-key-id  (:api-key-id request)
        user-agent  (request-user-agent request)
        occurred-at (or occurred-at (t/offset-date-time))]
    (when api-key-id
      (try
        (stamp-last-used-at! api-key-id occurred-at)
        (catch Throwable e
          (log/warn e "Failed to record API key last_used_at"))))
    (try
      (let [;; `pii-fields-from` returns the gated PII columns only when retention is on (nil
            ;; otherwise). Allowlist the two columns this row has, so a new field on the shared helper
            ;; can't silently start persisting here without a deliberate change.
            pii (some-> (analytics/pii-fields-from {:user-agent user-agent
                                                    :ip-address (request/ip-address request)})
                        (select-keys [:user_agent :ip_address])
                        (update :ip_address #(some-> % (u/truncate ip-address-max-length))))
            row (merge {:api_key_id          api-key-id
                        :user_id             (:metabase-user-id request)
                        :tenant_id           (:tenant-id request)
                        :route_template      (some-> route-template (u/truncate route-template-max-length))
                        :http_method         (some-> (:request-method request) name u/upper-case-en
                                                     (u/truncate http-method-max-length))
                        :status              (:status response)
                        :duration_ms         duration-ms
                        :occurred_at         occurred-at
                        :client_name         (api-keys.usage/detect-client user-agent)
                        :embedding_client    (some-> (request-embedding-client request) (u/truncate embedding-client-max-length))
                        :embedding_hostname  (some-> (request-embedding-hostname request) (u/truncate embedding-hostname-max-length))}
                       pii)]
        (if-let [missing (not-empty (remove #(some? (get row %)) not-null-columns))]
          (log/warnf "Not recording API key usage log row, missing %s" (pr-str missing))
          (offer-usage-log! row)))
      (catch Throwable e
        (log/warn e "Failed to record API key usage")))))
