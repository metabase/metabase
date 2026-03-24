(ns metabase.mq.queue.appdb
  "Database-backed implementation of the message queue using the application database."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.mq.appdb :as mq.appdb]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (java.sql Timestamp)
           (java.time Instant)
           (java.util.concurrent Future)
           (javax.sql DataSource)))

(set! *warn-on-reflection* true)

(defn- queue-max-retries []
  ((requiring-resolve 'metabase.mq.settings/queue-max-retries)))

(def ^:private owner-id (str (random-uuid)))
(def ^:private background-process (atom nil))

(defn- supports-skip-locked?
  "Returns true if the current app DB supports SELECT ... FOR UPDATE SKIP LOCKED.
  Postgres (9.5+) and MySQL 8.0+ support it. MariaDB only supports it since 10.6. H2 does not support it."
  []
  (case (mdb/db-type)
    :h2 false
    :mysql (with-open [conn (.getConnection ^DataSource (mdb/data-source))]
             (let [metadata (.getMetaData conn)
                   product  (.getDatabaseProductName metadata)
                   major    (.getDatabaseMajorVersion metadata)
                   minor    (.getDatabaseMinorVersion metadata)]
               (if (= product "MariaDB")
                 (or (> major 10) (and (= major 10) (>= minor 6)))
                 ;; MySQL 8.0+ supports SKIP LOCKED
                 (>= major 8))))
    ;; Postgres 9.5+ supports SKIP LOCKED
    true))

(def ^:private skip-locked-supported? (delay (supports-skip-locked?)))

(defn- for-update-clause
  "Returns the appropriate FOR UPDATE clause for the current database.
  Uses SKIP LOCKED when supported; falls back to plain FOR UPDATE otherwise."
  []
  (if @skip-locked-supported?
    [:update :skip-locked]
    [:update]))

(defn- fetch!
  "Fetches the next pending message from the given queue names.
  Returns a map with :bundle-id, :queue, and :messages keys, or nil if no messages are available.
  Marks the fetched message as 'processing' within the same transaction.
  For exclusive queues, skips fetching if any row for that queue is already processing."
  [queue-names]
  (when (seq queue-names)
    (let [exclusive-names (q.impl/exclusive-queue-names)]
      (t2/with-transaction [conn]
        ;; Step 1: Find exclusive queues that currently have a processing row (no FOR UPDATE).
        ;; This avoids a correlated EXISTS subquery inside the FOR UPDATE query, which is
        ;; unreliable on H2 and causes intermittent test failures.
        (let [blocked-queues  (when (seq exclusive-names)
                                (into #{}
                                      (map :queue_name)
                                      (t2/query conn {:select   [:queue_name]
                                                      :from     [:queue_message_batch]
                                                      :where    [:and
                                                                 [:in :queue_name (vec exclusive-names)]
                                                                 [:= :status "processing"]]
                                                      :group-by [:queue_name]})))
              fetchable-names (if (seq blocked-queues)
                                (remove #(contains? blocked-queues (name %)) queue-names)
                                queue-names)]
          ;; Step 2: Fetch from non-blocked queues with a simple WHERE (no subquery).
          (when (seq fetchable-names)
            (when-let [row (t2/query-one
                            conn
                            {:select   [:*]
                             :from     [:queue_message_batch]
                             :where    [:and
                                        [:in :queue_name (map name fetchable-names)]
                                        [:= :status "pending"]]
                             :order-by [[:id :asc]]
                             :limit    1
                             :for      (for-update-clause)})]
              (t2/update! :queue_message_batch
                          (:id row)
                          {:status_heartbeat (mi/now)
                           :status           "processing"
                           :owner            owner-id})
              {:bundle-id (:id row)
               :queue     (keyword "queue" (:queue_name row))
               :messages  (json/decode (:messages row))})))))))

;;; ------------------------------------------- Stale Processing Recovery -------------------------------------------

(def ^:private stale-processing-timeout-ms
  "If a batch has been 'processing' for longer than this, it's considered abandoned.
  Currently 10 minutes (600000ms)."
  (* 10 60 1000))

(def ^:private stale-check-interval-ms
  "How often the polling loop checks for stale processing batches.
  Currently 60 seconds."
  (* 60 1000))

(def ^:private last-stale-check-ms
  "Timestamp of the last stale processing check."
  (atom 0))

(defn- recover-processing-batches!
  "Recovers the given processing batches: resets to 'pending' with incremented failures,
  or marks as 'failed' if at max retries. Returns the number recovered."
  [rows]
  (let [max-retries (queue-max-retries)]
    (doseq [row rows]
      (let [new-failures (inc (:failures row))]
        (if (>= new-failures max-retries)
          (do
            (log/warnf "Processing batch %d on queue '%s' has reached max failures (%d), marking as failed"
                       (:id row) (:queue_name row) max-retries)
            (mq.impl/analytics-inc! :metabase-mq/queue-batch-permanent-failures {:channel (:queue_name row)})
            (t2/update! :queue_message_batch (:id row)
                        {:status           "failed"
                         :failures         new-failures
                         :status_heartbeat (mi/now)
                         :owner            nil}))
          (do
            (log/warnf "Recovering processing batch %d on queue '%s' (failures: %d -> %d)"
                       (:id row) (:queue_name row) (:failures row) new-failures)
            (mq.impl/analytics-inc! :metabase-mq/batch-stale-recoveries {:type "queue" :channel (:queue_name row)})
            (t2/update! :queue_message_batch (:id row)
                        {:status           "pending"
                         :failures         new-failures
                         :status_heartbeat (mi/now)
                         :owner            nil})))))
    (count rows)))

(defn recover-stale-processing-batches!
  "Finds all 'processing' batches whose `status_heartbeat` is older than [[stale-processing-timeout-ms]]
  and recovers them. Returns the number recovered."
  []
  (let [threshold (Timestamp/from (.minusMillis (Instant/now) stale-processing-timeout-ms))]
    (recover-processing-batches!
     (t2/select :queue_message_batch :status "processing" :status_heartbeat [:< threshold]))))

(defn- maybe-recover-stale-batches!
  "Runs stale processing recovery if enough time has passed since the last check."
  []
  (let [now (System/currentTimeMillis)]
    (when (> (- now @last-stale-check-ms) stale-check-interval-ms)
      (reset! last-stale-check-ms now)
      (try
        (recover-stale-processing-batches!)
        (catch Exception e
          (log/error e "Error recovering stale processing batches"))))))

;;; ------------------------------------------- Failed Batch Cleanup -------------------------------------------

(def ^:private cleanup-max-age-ms
  "Failed batches older than this are eligible for cleanup.
  Currently 1 week (604800000ms). Not yet configurable at runtime."
  (* 7 24 60 60 1000))

(def ^:private cleanup-interval-ms
  "How often the cleanup loop runs.
  Currently 1 day (86400000ms). Not yet configurable at runtime."
  (* 24 60 60 1000))

(def ^:private cleanup-future
  "Holds the background future running the cleanup loop, or nil if not started."
  (atom nil))

(defn- cleanup-failed-batches!
  "Deletes all failed `queue_message_batch` rows older than [[cleanup-max-age-ms]]."
  []
  (let [threshold (Timestamp/from (.minusMillis (Instant/now) cleanup-max-age-ms))
        deleted   (t2/delete! :queue_message_batch :status "failed" :status_heartbeat [:< threshold])]
    (when (pos? deleted)
      (log/infof "Cleaned up %d failed queue batches" deleted)
      (mq.impl/analytics-inc! :metabase-mq/appdb-cleanup-deleted {:type "queue" :channel "all"} deleted))
    deleted))

;;; ------------------------------------------- Queue Depth Gauge -------------------------------------------

(def ^:private depth-gauge-interval-ms
  "How often to refresh the queue depth gauge. Currently 30 seconds."
  (* 30 1000))

(def ^:private last-depth-gauge-ms
  "Timestamp of the last queue depth gauge update."
  (atom 0))

(defn- update-depth-gauges!
  "Queries queue_message_batch for counts by queue and status, and updates the gauge.
   Time-gated to run at most once per [[depth-gauge-interval-ms]]."
  []
  (let [now (System/currentTimeMillis)]
    (when (> (- now @last-depth-gauge-ms) depth-gauge-interval-ms)
      (reset! last-depth-gauge-ms now)
      (try
        (doseq [{:keys [queue_name status cnt]}
                (t2/query {:select   [:queue_name :status [[:count :*] :cnt]]
                           :from     [:queue_message_batch]
                           :group-by [:queue_name :status]})]
          (mq.impl/analytics-set! :metabase-mq/appdb-queue-depth {:channel queue_name :status status} cnt))
        (catch Exception e
          (log/error e "Error updating queue depth gauges"))))))

;;; ------------------------------------------- Heartbeat -------------------------------------------

(def ^:private heartbeat-interval-ms
  "How often to update heartbeats for in-flight batches. Currently 2 minutes."
  (* 2 60 1000))

(def ^:private last-heartbeat-ms
  "Timestamp of the last heartbeat update."
  (atom 0))

(defn- update-heartbeats!
  "Updates status_heartbeat for all currently-processing queue batches."
  []
  (doseq [channel (filter #(= "queue" (namespace %)) (mq.impl/busy-channels))]
    (when-let [{:keys [bundle-id]} (mq.impl/active-handler-metadata channel)]
      (try
        (t2/update! :queue_message_batch
                    {:id bundle-id :owner owner-id :status "processing"}
                    {:status_heartbeat (mi/now)})
        (catch Exception e
          (log/warnf e "Failed to update heartbeat for bundle %d" bundle-id))))))

(defn- maybe-update-heartbeats!
  "Runs heartbeat updates if enough time has passed since the last update."
  []
  (let [now (System/currentTimeMillis)]
    (when (> (- now @last-heartbeat-ms) heartbeat-interval-ms)
      (reset! last-heartbeat-ms now)
      (update-heartbeats!))))

;;; ------------------------------------------- Polling -------------------------------------------

(def ^:private error-backoff-ms
  "Backoff time after an unexpected error in the polling loop."
  5000)

(defn- process-batch!
  "Fetches a batch from available (non-busy) queues and submits it to the worker pool.
   Returns true if a batch was dispatched, false if no work available."
  []
  (let [available-queues (remove mq.impl/channel-busy? (listener/queue-names))]
    (if-not (seq available-queues)
      false
      (if-let [{:keys [bundle-id queue messages]} (fetch! available-queues)]
        (do
          (mq.impl/submit-delivery! queue messages bundle-id :queue.backend/appdb {:bundle-id bundle-id})
          (mq.impl/analytics-inc! :metabase-mq/appdb-queue-poll-results {:result "found"})
          true)
        (do
          (mq.impl/analytics-inc! :metabase-mq/appdb-queue-poll-results {:result "empty"})
          false)))))

(defn- start-polling!
  "Starts the background polling process."
  []
  (log/info "Starting background process for appdb queue")
  (mq.impl/start-worker-pool!)
  (mq.appdb/start-cleanup-loop! cleanup-future cleanup-interval-ms cleanup-failed-batches! "Queue")
  (reset! background-process
          (future
            (try
              (loop []
                (try
                  (maybe-recover-stale-batches!)
                  (maybe-update-heartbeats!)
                  (update-depth-gauges!)
                  (if (seq (listener/queue-names))
                    (if (process-batch!)
                      nil                                     ;; dispatched a batch, loop immediately to fetch more
                      (Thread/sleep 2000))
                    ;; No queues registered — sleep longer and re-check
                    (Thread/sleep 5000))
                  (catch InterruptedException e (throw e))
                  (catch Exception e
                    (log/error e "Unexpected error in queue polling loop, backing off")
                    (Thread/sleep (long error-backoff-ms))))
                (recur))
              (catch InterruptedException _
                (log/info "Background process interrupted")))
            (log/info "Stopping background process for appdb queue")
            (reset! background-process nil))))

(defmethod q.backend/shutdown! :queue.backend/appdb [_]
  (mq.appdb/stop-cleanup-loop! cleanup-future "Queue")
  ;; Stop the poll thread
  (when-let [f @background-process]
    (when (instance? Future f)
      (.cancel ^Future f true))
    (reset! background-process nil))
  (log/info "Shut down appdb queue backend"))

(defmethod q.backend/start! :queue.backend/appdb [_]
  (start-polling!))

(defmethod q.backend/queue-length :queue.backend/appdb
  [_ queue]
  (or
   (t2/select-one-fn :num [:queue_message_batch [[:count :*] :num]] :queue_name (name queue))
   0))

(defmethod q.backend/publish! :queue.backend/appdb
  [_ queue messages]
  (t2/insert! :queue_message_batch
              {:queue_name (name queue)
               :messages   (json/encode messages)}))

(defmethod q.backend/bundle-successful! :queue.backend/appdb
  [_ _queue-name bundle-id]
  (let [deleted (t2/delete! :queue_message_batch :id bundle-id :owner owner-id)]
    (when (= 0 deleted)
      (log/warnf "Message %d was already deleted from the queue. Likely error in concurrency handling" bundle-id))))

(defmethod q.backend/bundle-failed! :queue.backend/appdb
  [_ queue-name bundle-id]
  (let [row     (t2/select-one :queue_message_batch :id bundle-id :owner owner-id)
        updated (when row
                  (if (>= (inc (:failures row)) (queue-max-retries))
                    (do
                      (log/warnf "Message %d has reached max failures (%d), marking as failed" bundle-id (queue-max-retries))
                      (mq.impl/analytics-inc! :metabase-mq/queue-batch-permanent-failures {:channel (name queue-name)})
                      (t2/update! :queue_message_batch
                                  {:id    bundle-id
                                   :owner owner-id}
                                  {:status           "failed"
                                   :failures         [:+ :failures 1]
                                   :status_heartbeat (mi/now)
                                   :owner            nil}))
                    (do
                      (mq.impl/analytics-inc! :metabase-mq/queue-batch-retries {:channel (name queue-name)})
                      (t2/update! :queue_message_batch
                                  {:id    bundle-id
                                   :owner owner-id}
                                  {:status           "pending"
                                   :failures         [:+ :failures 1]
                                   :status_heartbeat (mi/now)
                                   :owner            nil}))))]
    (when (and row (= 0 updated))
      (log/warnf "Message %d was not found in the queue. Likely error in concurrency handling" bundle-id))))
