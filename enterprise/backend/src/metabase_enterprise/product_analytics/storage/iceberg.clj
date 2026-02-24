(ns metabase-enterprise.product-analytics.storage.iceberg
  "Iceberg storage backend for Product Analytics.
   Buffers events and sessions in memory and periodically flushes them as Parquet files
   to S3 via the Apache Iceberg API. Sites are cached in-memory for fast synchronous lookups."
  (:require
   [metabase-enterprise.product-analytics.storage :as storage]
   [metabase-enterprise.product-analytics.storage.iceberg.buffer :as buffer]
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase-enterprise.product-analytics.storage.iceberg.writer :as writer]
   [metabase.util.log :as log])
  (:import
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

;;; ------------------------------------------------- Flush logic ---------------------------------------------------

(defn- flush-events!
  "Drain the event buffer and write to Iceberg."
  []
  (let [events (buffer/drain! event-buffer)]
    (when (seq events)
      (log/debugf "Flushing %d events to Iceberg" (count events))
      (writer/write-events! events))))

(defn- flush-sessions!
  "Drain the session buffer and write to Iceberg."
  []
  (let [sessions (buffer/drain! session-buffer)]
    (when (seq sessions)
      (log/debugf "Flushing %d sessions to Iceberg" (count sessions))
      (writer/write-sessions! sessions))))

(defn- flush-session-data!
  "Drain the session-data buffer and write to Iceberg."
  []
  (let [rows (buffer/drain! session-data-buffer)]
    (when (seq rows)
      (log/debugf "Flushing %d session-data rows to Iceberg" (count rows))
      (writer/write-session-data! rows))))

(defn- flush-session-updates!
  "Drain session update buffer (distinct_id changes) and write to Iceberg."
  []
  (let [updates (buffer/drain! session-update-buffer)]
    (when (seq updates)
      (log/debugf "Flushing %d session updates to Iceberg" (count updates))
      ;; Session updates are appended as new rows; deduplication happens on read
      (writer/write-sessions! updates))))

(defn- flush-all!
  "Flush all buffers to Iceberg."
  []
  (flush-events!)
  (flush-sessions!)
  (flush-session-data!)
  (flush-session-updates!))

;;; -------------------------------------------- Lifecycle management -----------------------------------------------

(def ^:private flush-task (atom nil))

(defn start!
  "Initialize the Iceberg backend: ensure tables exist and start the flush scheduler."
  []
  (log/info "Starting Iceberg storage backend")
  (writer/ensure-tables!)
  (let [interval (iceberg.settings/product-analytics-iceberg-flush-interval-seconds)]
    (reset! flush-task (buffer/start-flush-task! flush-all! interval)))
  (log/info "Iceberg storage backend started"))

(defn stop!
  "Stop the Iceberg backend: stop the flush scheduler and drain remaining events."
  []
  (log/info "Stopping Iceberg storage backend")
  (when-let [task @flush-task]
    (buffer/stop-flush-task! task flush-all!)
    (reset! flush-task nil))
  (log/info "Iceberg storage backend stopped"))

;;; ---------------------------------------- Storage multimethod implementations ------------------------------------

(defmethod storage/get-site ::storage/iceberg
  [_backend site-uuid]
  ;; Sites are cached in-memory; the cache is populated when sites are written
  (get @sites-cache site-uuid))

(defmethod storage/upsert-session! ::storage/iceberg
  [_backend session-data]
  (let [session-id (.incrementAndGet session-id-counter)
        now        (java.time.OffsetDateTime/now java.time.ZoneOffset/UTC)
        session    (merge session-data
                          {:session_id session-id
                           :created_at now
                           :updated_at now})]
    (buffer/offer! session-buffer session)
    ;; Check if batch size exceeded
    (when (>= (buffer/size session-buffer)
              (iceberg.settings/product-analytics-iceberg-flush-batch-size))
      (flush-sessions!))
    session-id))

(defmethod storage/save-event! ::storage/iceberg
  [_backend {:keys [event properties]}]
  (let [event-id (.incrementAndGet event-id-counter)
        now      (java.time.OffsetDateTime/now java.time.ZoneOffset/UTC)
        ;; Fold properties into the event_data map column
        event-data (when (seq properties)
                     (into {}
                           (map (fn [p] [(:data_key p) (or (:string_value p)
                                                           (some-> (:number_value p) str)
                                                           "")]))
                           properties))
        event-row (merge event
                         {:event_id   event-id
                          :event_data event-data
                          :created_at now})]
    (buffer/offer! event-buffer event-row)
    ;; Check if batch size exceeded
    (when (>= (buffer/size event-buffer)
              (iceberg.settings/product-analytics-iceberg-flush-batch-size))
      (flush-events!))
    event-row))

(defmethod storage/save-session-data! ::storage/iceberg
  [_backend session-data-rows]
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
  (let [now (java.time.OffsetDateTime/now java.time.ZoneOffset/UTC)]
    (buffer/offer! session-update-buffer {:session_id  session-id
                                          :distinct_id distinct-id
                                          :updated_at  now})
    true))

(defmethod storage/flush! ::storage/iceberg
  [_backend]
  (flush-all!))

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
  "Reload the sites cache. Currently a no-op placeholder — will scan the Iceberg table when
   Iceberg read support is implemented."
  []
  ;; TODO: Scan pa_sites Iceberg table and populate cache
  nil)
