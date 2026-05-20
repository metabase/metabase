(ns metabase.mq.queue.appdb
  "Database-backed implementation of the message queue using the application database."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.polling :as mq.polling]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.settings :as mq.settings]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (java.sql Timestamp)
           (java.time Instant)))

(set! *warn-on-reflection* true)

;; Stale processing recovery
(def ^:private stale-processing-timeout-ms
  "Messages in 'processing' status for longer than this are considered stale and recovered."
  (* 10 60 1000))

(defn- for-update-clause
  "Returns the FOR UPDATE clause for the current app DB.
  Uses SKIP LOCKED on PostgreSQL and MySQL to avoid blocking on rows locked by other nodes.
  Falls back to plain FOR UPDATE on H2."
  []
  (if (#{:postgres :mysql} (mdb/db-type))
    [:update :skip-locked]
    [:update]))

;;; ------------------------------------------- Fetch -------------------------------------------

(defn- fetch-one-pending!
  "Selects and locks the oldest pending row for a single queue, marks it 'processing' with
  the given owner, and returns the original row map. Returns nil if no pending row exists
  or the row at the head of the queue is locked by another transaction (FOR UPDATE SKIP
  LOCKED). Must be called inside an open transaction so the row lock survives the UPDATE."
  [conn queue-name owner-id]
  (when-let [row (first (t2/query conn {:select   [:*]
                                        :from     [:queue_message_batch]
                                        :where    [:and
                                                   [:= :queue_name (name queue-name)]
                                                   [:= :status "pending"]]
                                        :order-by [[:id :asc]]
                                        :limit    1
                                        :for      (for-update-clause)}))]
    (t2/query conn {:update [:queue_message_batch]
                    :set    {:status_heartbeat (mi/now)
                             :status           "processing"
                             :owner            owner-id}
                    :where  [:= :id (:id row)]})
    row))

(defn- fetch!
  "Fetches the oldest pending row for each of the given queue names.
  Returns a seq of maps with :batch-id, :queue, and :payload keys, or nil if no messages
  are available.

  Implemented as a per-queue loop inside one transaction rather than a single LATERAL query
  for cross-database portability — Postgres, MySQL 8+, and H2 support LATERAL but MariaDB
  does not. Each per-queue SELECT uses FOR UPDATE SKIP LOCKED so concurrent consumers each
  get a different row instead of all contending on the same head-of-queue. The cost is N
  small queries per iteration; in practice N is the number of registered queue listeners,
  which is small."
  [owner-id queue-names]
  (when (seq queue-names)
    (let [exclusive-names (q.registry/exclusive-queue-names)]
      (t2/with-transaction [conn]
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
          (when (seq fetchable-names)
            (let [batches (into []
                                (keep (fn [qn]
                                        (when-let [row (fetch-one-pending! conn qn owner-id)]
                                          {:batch-id (:id row)
                                           :queue     (keyword "queue" (:queue_name row))
                                           :payload   (:payload row)})))
                                fetchable-names)]
              (when (seq batches) batches))))))))

(defn- recover-stale-processing-batches!
  "Recovers processing batches whose heartbeat is older than the stale timeout. Returns the
  number of batches THIS call actually transitioned (under concurrent recovery from another
  node the guarded UPDATE rejects rows already recovered and the count drops).

  Done in two bulk UPDATEs (retryable + permanent) instead of a per-row loop so a node-down
  event with N stale batches does not cost O(N) round trips."
  []
  (let [max-retries (mq.settings/queue-max-retries)
        threshold   (Timestamp/from (.minusMillis (Instant/now) stale-processing-timeout-ms))
        candidates  (t2/select :queue_message_batch
                               :status "processing"
                               :status_heartbeat [:< threshold])
        {retryable false permanent true}
        (group-by #(>= (inc (:failures %)) max-retries) candidates)
        bulk-update! (fn [rows new-status]
                       (if (seq rows)
                         (let [result (t2/query {:update :queue_message_batch
                                                 :set    {:status           new-status
                                                          :failures         [:+ :failures 1]
                                                          :status_heartbeat (mi/now)
                                                          :owner            nil}
                                                 :where  [:and
                                                          [:in :id (mapv :id rows)]
                                                          [:= :status "processing"]
                                                          [:< :status_heartbeat threshold]]})]
                           ;; t2/query with :update returns the affected-row count; on some
                           ;; drivers it comes back as `[n]` rather than `n`.
                           (if (sequential? result) (first result) result))
                         0))
        n-retryable (bulk-update! retryable "pending")
        n-permanent (bulk-update! permanent "failed")]
    (when (pos? n-retryable)
      (log/warnf "Recovered %d stale processing batch(es)" n-retryable)
      (doseq [[queue-name rows] (group-by :queue_name retryable)]
        (analytics/inc! :metabase-mq/batch-stale-recoveries
                        {:transport "queue" :channel queue-name}
                        (count rows))))
    (when (pos? n-permanent)
      (log/warnf "Marked %d stale processing batch(es) as failed (reached max-retries %d)"
                 n-permanent max-retries)
      (doseq [[queue-name rows] (group-by :queue_name permanent)]
        (analytics/inc! :metabase-mq/queue-batch-permanent-failures
                        {:channel queue-name}
                        (count rows))))
    (+ n-retryable n-permanent)))

(defn- cleanup-failed-batches! []
  (let [threshold (Timestamp/from (.minusMillis (Instant/now) (* 7 24 60 60 1000)))
        deleted   (t2/delete! :queue_message_batch :status "failed" :status_heartbeat [:< threshold])]
    (when (pos? deleted)
      (log/infof "Cleaned up %d failed queue batches" deleted)
      (analytics/inc! :metabase-mq/appdb-cleanup-deleted {:transport "queue" :channel "all"} deleted))))

(defn- update-depth-gauges! []
  (doseq [{:keys [queue_name status cnt]}
          (t2/query {:select   [:queue_name :status [[:count :*] :cnt]]
                     :from     [:queue_message_batch]
                     :group-by [:queue_name :status]})]
    (analytics/set-gauge! :metabase-mq/appdb-queue-depth {:channel queue_name :status status} cnt)))

(defn- update-heartbeats! [owner-id]
  (doseq [channel (filter #(= "queue" (namespace %)) (mq.impl/busy-channels))]
    (when-let [{:keys [batch-id]} (mq.impl/active-handler-metadata channel)]
      (try
        (t2/update! :queue_message_batch
                    {:id batch-id :owner owner-id :status "processing"}
                    {:status_heartbeat (mi/now)})
        (catch Exception e
          (log/warnf e "Failed to update heartbeat for batch %d" batch-id))))))

;;; ------------------------------------------- Polling -------------------------------------------

(defn- poll-iteration!
  "One iteration of the polling loop: run periodic tasks, then try to process batches.
  Fetches one pending row per available queue and submits each for delivery.
  Returns true if any work was found."
  [{:keys [owner-id last-stale-check-ms last-heartbeat-ms last-cleanup-ms last-depth-gauge-ms] :as this}]
  (mq.polling/periodically! last-stale-check-ms (* 60 1000)       "stale batch recovery"  recover-stale-processing-batches!)
  (mq.polling/periodically! last-heartbeat-ms   (* 2 60 1000)     "heartbeat update"      #(update-heartbeats! owner-id))
  (mq.polling/periodically! last-cleanup-ms     (* 24 60 60 1000) "failed batch cleanup"  cleanup-failed-batches!)
  (mq.polling/periodically! last-depth-gauge-ms (* 30 1000)       "queue depth gauge"     update-depth-gauges!)
  (boolean
   (when-let [available-queues (seq (remove mq.impl/channel-busy? (listener/queue-names)))]
     (when-let [batches (seq (fetch! owner-id available-queues))]
       (doseq [{:keys [batch-id queue payload]} batches]
         (mq.impl/submit-delivery! queue payload batch-id this {:batch-id batch-id}))
       true))))

(defrecord AppDbQueueBackend
           [owner-id poll-state last-stale-check-ms last-heartbeat-ms last-cleanup-ms last-depth-gauge-ms]
  q.backend/QueueBackend
  (publish! [_this queue payload]
    (t2/insert! :queue_message_batch
                {:queue_name (name queue)
                 :payload    payload})
    (when-not (mq.impl/channel-busy? queue)
      (mq.polling/notify! poll-state)))

  (batch-successful! [_this _queue-name batch-id]
    (let [deleted (t2/delete! :queue_message_batch :id batch-id :owner owner-id)]
      (when (= 0 deleted)
        (log/warnf "Message %d was already deleted from the queue." batch-id))))

  (batch-failed! [_this queue-name batch-id]
    (let [row     (t2/select-one :queue_message_batch :id batch-id :owner owner-id)
          updated (when row
                    (if (>= (inc (:failures row)) (mq.settings/queue-max-retries))
                      (do
                        (log/warnf "Message %d has reached max failures (%d), marking as failed" batch-id (mq.settings/queue-max-retries))
                        (analytics/inc! :metabase-mq/queue-batch-permanent-failures {:channel (name queue-name)})
                        (t2/update! :queue_message_batch
                                    {:id batch-id :owner owner-id}
                                    {:status "failed" :failures [:+ :failures 1] :status_heartbeat (mi/now) :owner nil}))
                      (do
                        (analytics/inc! :metabase-mq/queue-batch-retries {:channel (name queue-name)})
                        (t2/update! :queue_message_batch
                                    {:id batch-id :owner owner-id}
                                    {:status "pending" :failures [:+ :failures 1] :status_heartbeat (mi/now) :owner nil}))))]
      (when (and row (= 0 updated))
        (log/warnf "Message %d was not found in the queue. Likely error in concurrency handling" batch-id))))

  (start! [this]
    (mq.polling/start-polling! poll-state "Queue" 5000 #(poll-iteration! this)))

  (shutdown! [_this]
    (mq.polling/stop-polling! poll-state "Queue")))

(defn make-backend
  "Constructs a fresh `AppDbQueueBackend` with its own owner-id, poll-state, and periodic-task
   rate-limit atoms. The production [[backend]] singleton is one such instance; tests can build
   isolated ones so their `start!`/`shutdown!` don't touch production state."
  []
  (->AppDbQueueBackend (str (random-uuid))
                       (mq.polling/make-poll-state)
                       (atom 0) (atom 0) (atom 0) (atom 0)))

(def backend
  "Singleton instance of the appdb queue backend."
  (make-backend))
