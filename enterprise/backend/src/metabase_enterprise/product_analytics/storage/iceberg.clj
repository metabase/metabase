(ns metabase-enterprise.product-analytics.storage.iceberg
  "Iceberg storage backend for Product Analytics.
   Buffers events and sessions in memory and periodically flushes them as Parquet files
   to S3 via the Apache Iceberg API. Sites are cached in-memory for fast synchronous lookups."
  (:require
   [metabase-enterprise.product-analytics.storage :as storage]
   [metabase-enterprise.product-analytics.storage.iceberg.buffer :as buffer]
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase-enterprise.product-analytics.storage.iceberg.writer :as writer]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent ConcurrentHashMap)
   (java.util.concurrent.atomic AtomicLong)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- State -------------------------------------------------------

(def ^:private event-buffer (buffer/create-buffer))
(def ^:private session-buffer (buffer/create-buffer))
(def ^:private session-data-buffer (buffer/create-buffer))
(def ^:private session-update-buffer (buffer/create-buffer))

;; In-memory site cache: UUID string -> site map
(def ^:private sites-cache (atom {}))

;; Monotonically increasing ID generators for Iceberg records
(def ^:private event-id-counter (AtomicLong. (System/currentTimeMillis)))
(def ^:private session-id-counter (AtomicLong. (System/currentTimeMillis)))

;; Per-node session dedup cache: session_uuid -> session_id.
;; Reduces duplicate rows buffered on the same node. Cross-node duplicates are
;; handled by equality deletes at flush time.
(def ^:private ^ConcurrentHashMap session-id-cache (ConcurrentHashMap.))

;; Reverse lookup: session_id -> full session map.
;; Used by set-distinct-id! to reconstruct a full session row for equality-delete writes.
(def ^:private ^ConcurrentHashMap session-map-cache (ConcurrentHashMap.))

;;; ------------------------------------------------ Site cache helpers --------------------------------------------

(defn cache-site!
  "Add a site to the in-memory cache. Called when a site is created or updated."
  [site-map]
  (when-let [uuid (:uuid site-map)]
    (swap! sites-cache assoc uuid site-map)))

(defn uncache-site!
  "Remove a site from the in-memory cache."
  [site-uuid]
  (swap! sites-cache dissoc site-uuid))

(defn reload-sites-cache!
  "Load all active sites from app-db into the in-memory cache and sync to Iceberg."
  []
  (let [sites (t2/select :model/ProductAnalyticsSite :archived false)]
    (reset! sites-cache (into {} (map (juxt :uuid identity)) sites))
    (when (seq sites)
      (try
        (writer/write-sites! sites)
        (catch Exception e
          (log/warn e "Failed to sync sites to Iceberg during reload"))))))

;;; ------------------------------------------------- Flush logic ---------------------------------------------------

(defn- flush-events!
  "Drain the event buffer and write to Iceberg."
  []
  (let [events (buffer/drain! event-buffer)]
    (when (seq events)
      (log/infof "Flushing %d events to Iceberg" (count events))
      (writer/write-events! events)
      (log/infof "Flushed %d events to Iceberg successfully" (count events)))))

(defn- flush-sessions!
  "Drain the session buffer, deduplicate by session_uuid, and write to Iceberg
   with equality deletes to handle cross-node duplicates."
  []
  (let [sessions (buffer/drain! session-buffer)
        deduped  (vals (reduce (fn [m s] (assoc m (:session_uuid s) s)) {} sessions))]
    (when (seq deduped)
      (log/infof "Flushing %d sessions to Iceberg (from %d buffered)" (count deduped) (count sessions))
      (writer/write-sessions! deduped)
      (log/infof "Flushed %d sessions to Iceberg successfully" (count deduped)))))

(defn- flush-session-data!
  "Drain the session-data buffer and write to Iceberg."
  []
  (let [rows (buffer/drain! session-data-buffer)]
    (when (seq rows)
      (log/infof "Flushing %d session-data rows to Iceberg" (count rows))
      (writer/write-session-data! rows)
      (log/infof "Flushed %d session-data rows to Iceberg successfully" (count rows)))))

(defn- flush-session-updates!
  "Drain session update buffer (distinct_id changes) and write to Iceberg.
   Updates contain full session maps so equality deletes work correctly."
  []
  (let [updates (buffer/drain! session-update-buffer)
        deduped (vals (reduce (fn [m s] (assoc m (:session_uuid s) s)) {} updates))]
    (when (seq deduped)
      (log/infof "Flushing %d session updates to Iceberg (from %d buffered)" (count deduped) (count updates))
      (writer/write-sessions! deduped)
      (log/infof "Flushed %d session updates to Iceberg successfully" (count deduped)))))

(defn- flush-all!
  "Flush all buffers to Iceberg."
  []
  (flush-events!)
  (flush-sessions!)
  (flush-session-data!)
  (flush-session-updates!))

;;; -------------------------------------------- Lifecycle management -----------------------------------------------

(def ^:private flush-task (atom nil))
(def ^{:private true :tag 'clojure.lang.Atom} started? (atom false))

(defn start!
  "Initialize the Iceberg backend: ensure tables exist and start the flush scheduler.
   Resets `started?` on failure so subsequent calls can retry."
  []
  (when (compare-and-set! started? false true)
    (try
      (log/info "Starting Iceberg storage backend")
      (writer/ensure-tables!)
      (reload-sites-cache!)
      (let [interval (iceberg.settings/product-analytics-iceberg-flush-interval-seconds)]
        (reset! flush-task (buffer/start-flush-task! flush-all! interval)))
      (log/infof "Iceberg storage backend started (flush interval: %ds)"
                 (iceberg.settings/product-analytics-iceberg-flush-interval-seconds))
      (catch Throwable t
        (reset! started? false)
        (throw t)))))

(defn- ensure-started!
  "Ensure the Iceberg backend is initialized. Called lazily on first use."
  []
  (when-not @started?
    (start!)))

(defn stop!
  "Stop the Iceberg backend: stop the flush scheduler, drain remaining events, and clear caches."
  []
  (when (compare-and-set! started? true false)
    (log/info "Stopping Iceberg storage backend")
    (when-let [task @flush-task]
      (buffer/stop-flush-task! task flush-all!)
      (reset! flush-task nil))
    (.clear session-id-cache)
    (.clear session-map-cache)
    (log/info "Iceberg storage backend stopped")))

;;; ---------------------------------------- Storage multimethod implementations ------------------------------------

(defmethod storage/get-site ::storage/iceberg
  [_backend site-uuid]
  (ensure-started!)
  (or (get @sites-cache site-uuid)
      ;; Cache miss — check app-db and sync to Iceberg lazily
      (when-let [site (t2/select-one :model/ProductAnalyticsSite :uuid site-uuid :archived false)]
        (cache-site! site)
        (try
          (writer/write-sites! [site])
          (catch Exception e
            (log/warnf e "Failed to sync site %s to Iceberg" site-uuid)))
        site)))

(defmethod storage/upsert-session! ::storage/iceberg
  [_backend session-data]
  (ensure-started!)
  (let [session-uuid (:session_uuid session-data)]
    ;; Fast path: if this node already saw this session_uuid, return the cached session_id
    ;; without buffering a duplicate row. Cross-node duplicates are handled by equality deletes.
    (if-let [existing-id (.get session-id-cache session-uuid)]
      (do
        (log/debugf "Iceberg: session %s already cached (id=%d), skipping buffer" session-uuid existing-id)
        existing-id)
      (let [session-id (.incrementAndGet session-id-counter)
            now        (java.time.OffsetDateTime/now java.time.ZoneOffset/UTC)
            session    (merge session-data
                              {:session_id session-id
                               :created_at now
                               :updated_at now})]
        ;; putIfAbsent is atomic — if another thread raced us, use their session_id
        (if-let [race-id (.putIfAbsent session-id-cache session-uuid session-id)]
          (do
            (log/debugf "Iceberg: session %s lost race (id=%d), skipping buffer" session-uuid race-id)
            race-id)
          (do
            (.put session-map-cache session-id session)
            (log/debugf "Iceberg: buffering session %d (buffer size: %d)" session-id (buffer/size session-buffer))
            (buffer/offer! session-buffer session)
            (when (>= (buffer/size session-buffer)
                      (iceberg.settings/product-analytics-iceberg-flush-batch-size))
              (flush-sessions!))
            session-id))))))

(defmethod storage/save-event! ::storage/iceberg
  [_backend {:keys [event]}]
  (ensure-started!)
  (let [event-id (.incrementAndGet event-id-counter)
        now      (java.time.OffsetDateTime/now java.time.ZoneOffset/UTC)
        event-row (merge event
                         {:event_id   event-id
                          :created_at now})]
    (log/debugf "Iceberg: buffering event %d type=%s (buffer size: %d)"
                event-id (:event_type event) (buffer/size event-buffer))
    (buffer/offer! event-buffer event-row)
    ;; Check if batch size exceeded
    (when (>= (buffer/size event-buffer)
              (iceberg.settings/product-analytics-iceberg-flush-batch-size))
      (flush-events!))
    event-row))

(defmethod storage/save-session-data! ::storage/iceberg
  [_backend session-data-rows]
  (ensure-started!)
  (when (seq session-data-rows)
    (let [now (java.time.OffsetDateTime/now java.time.ZoneOffset/UTC)]
      (doseq [row session-data-rows]
        (buffer/offer! session-data-buffer (assoc row :created_at now))))
    ;; Check if batch size exceeded
    (when (>= (buffer/size session-data-buffer)
              (iceberg.settings/product-analytics-iceberg-flush-batch-size))
      (flush-session-data!)))
  (count session-data-rows))

(defmethod storage/set-distinct-id! ::storage/iceberg
  [_backend session-id distinct-id]
  (ensure-started!)
  (let [now (java.time.OffsetDateTime/now java.time.ZoneOffset/UTC)]
    ;; Look up the full session map so the update buffer contains all fields needed
    ;; for equality deletes (especially session_uuid).
    (if-let [session (.get session-map-cache session-id)]
      (do
        (buffer/offer! session-update-buffer (assoc session
                                                    :distinct_id distinct-id
                                                    :updated_at  now))
        true)
      (do
        (log/warnf "Iceberg: set-distinct-id! for unknown session_id %d — session not in cache" session-id)
        false))))

(defmethod storage/flush! ::storage/iceberg
  [_backend]
  (ensure-started!)
  (flush-all!))

(defmethod storage/ensure-backend-ready! ::storage/iceberg
  [_backend]
  (start!))
