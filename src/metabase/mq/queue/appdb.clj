(ns metabase.mq.queue.appdb
  "Database-backed implementation of the message queue using the application database."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.polling :as q.polling]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (java.sql Timestamp)
           (java.time Instant)))

(set! *warn-on-reflection* true)

(def backend-id
  "This backend's identifier, registered with `metabase.mq.init`; its `name` labels metrics."
  :queue.backend/appdb)

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

;;; ------------------------------------------- Polling -------------------------------------------

(defrecord AppDbQueueBackend [poll-context]
  q.backend/QueueBackend
  (backend-id [_this] backend-id)

  (publish! [_this queue payload]
    (t2/insert! :queue_message_batch
                {:queue_name (name queue)
                 :payload    payload}))

  ;; Fetches the oldest pending row for each available queue, marking each 'processing'. Per-queue
  ;; loop in one transaction for cross-DB portability; each SELECT uses FOR
  ;; UPDATE SKIP LOCKED so concurrent consumers get different rows.
  (fetch! [_this available-queues]
    (when (seq available-queues)
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
                                  (remove #(contains? blocked-queues (name %)) available-queues)
                                  available-queues)]
            (when (seq fetchable-names)
              (let [batches (into []
                                  (keep (fn [qn]
                                          (when-let [row (fetch-one-pending! conn qn (:id poll-context))]
                                            {:batch-id (:id row)
                                             :queue    (keyword "queue" (:queue_name row))
                                             :payload  (:payload row)})))
                                  fetchable-names)]
                (when (seq batches) batches))))))))

  (batch-successful! [_this _queue-name batch-id]
    (let [deleted (t2/delete! :queue_message_batch :id batch-id :owner (:id poll-context))]
      (when (= 0 deleted)
        (log/warnf "Message %d was already deleted from the queue." batch-id))))

  (queue-depths [_this]
    (into []
          (map (fn [{:keys [queue_name status cnt]}]
                 {:channel queue_name :status status :count cnt}))
          (t2/query {:select   [:queue_name :status [[:count :*] :cnt]]
                     :from     [:queue_message_batch]
                     :group-by [:queue_name :status]})))

  (failure-count [_this _queue-name batch-id]
    (:failures (t2/select-one :queue_message_batch :id batch-id :owner (:id poll-context))))

  (retry-batch! [_this _queue-name batch-id]
    (t2/update! :queue_message_batch
                {:id batch-id :owner (:id poll-context)}
                {:status "pending" :failures [:+ :failures 1] :status_heartbeat (mi/now) :owner nil}))

  ;; Drop the row outright (like the redis/memory backends) — failed batches aren't retained.
  (fail-batch! [_this _queue-name batch-id]
    (t2/delete! :queue_message_batch :id batch-id :owner (:id poll-context)))

  (start! [this]
    (q.polling/start! this poll-context "Queue" 5000))

  (shutdown! [_this]
    (q.polling/stop! poll-context "Queue"))

  ;; Recovers processing batches whose heartbeat is older than the stale timeout: retryable ones
  ;; go back to 'pending' in a single bulk UPDATE; exhausted ones are deleted in a single bulk
  ;; DELETE (failed batches aren't retained). Both ops are guarded on status/heartbeat so we don't
  ;; clobber rows another node already recovered. Returns per-channel {:channel :recovered :failed}.
  (recover-stale! [_this stale-timeout-ms max-retries]
    (let [threshold   (Timestamp/from (.minusMillis (Instant/now) stale-timeout-ms))
          candidates  (t2/select :queue_message_batch
                                 :status "processing"
                                 :status_heartbeat [:< threshold])
          {retryable false permanent true}
          (group-by #(>= (inc (:failures %)) max-retries) candidates)
          n-retryable (if (seq retryable)
                        (let [result (t2/query {:update :queue_message_batch
                                                :set    {:status           "pending"
                                                         :failures         [:+ :failures 1]
                                                         :status_heartbeat (mi/now)
                                                         :owner            nil}
                                                :where  [:and
                                                         [:in :id (mapv :id retryable)]
                                                         [:= :status "processing"]
                                                         [:< :status_heartbeat threshold]]})]
                          ;; t2/query :update returns the affected-row count; some drivers wrap it in `[n]`.
                          (if (sequential? result) (first result) result))
                        0)
          n-permanent (if (seq permanent)
                        (t2/delete! :queue_message_batch
                                    :id [:in (mapv :id permanent)]
                                    :status "processing"
                                    :status_heartbeat [:< threshold])
                        0)]
      (concat
       (when (pos? n-retryable)
         (for [[queue-name rows] (group-by :queue_name retryable)]
           {:channel queue-name :recovered (count rows) :failed 0}))
       (when (pos? n-permanent)
         (for [[queue-name rows] (group-by :queue_name permanent)]
           {:channel queue-name :recovered 0 :failed (count rows)})))))

  (run-heartbeats! [_this]
    (doseq [channel (filter #(= "queue" (namespace %)) (mq.impl/busy-channels))]
      (when-let [{:keys [batch-id]} (mq.impl/active-handler-metadata channel)]
        (try
          (t2/update! :queue_message_batch
                      {:id batch-id :owner (:id poll-context) :status "processing"}
                      {:status_heartbeat (mi/now)})
          (catch Exception e
            (log/warnf e "Failed to update heartbeat for batch %d" batch-id)))))))

(defn make-backend
  "Constructs a fresh `AppDbQueueBackend` with its own poll context (which carries the instance
   `:id` used as the row owner, the poll thread, and periodic-task rate-limit atoms). The
   production [[backend]] singleton is one such instance; tests can build isolated ones so their
   `start!`/`shutdown!` don't touch production state."
  []
  (->AppDbQueueBackend (q.polling/make-poll-context)))

(def backend
  "Singleton instance of the appdb queue backend."
  (make-backend))
