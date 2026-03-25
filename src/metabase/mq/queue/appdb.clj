(ns metabase.mq.queue.appdb
  "Database-backed implementation of the message queue using the application database."
  (:require
   [metabase.models.interface :as mi]
   [metabase.mq.analytics :as mq.analytics]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.polling :as mq.polling]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (java.sql Timestamp)
           (java.time Instant)))

(set! *warn-on-reflection* true)

(defn- queue-max-retries []
  ((requiring-resolve 'metabase.mq.settings/queue-max-retries)))

(def ^:private owner-id (str (random-uuid)))
(def ^:private poll-state (mq.polling/make-poll-state))

;;; ------------------------------------------- Fetch -------------------------------------------

(defn- fetch!
  "Fetches the next pending message from the given queue names.
  Returns a map with :bundle-id, :queue, and :messages keys, or nil if no messages are available.
  Selects the oldest pending row, marks it as 'processing', and returns it — all within one transaction."
  [queue-names]
  (when (seq queue-names)
    (let [exclusive-names (q.impl/exclusive-queue-names)]
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
            (when-let [row (t2/query-one
                            conn
                            {:select   [:*]
                             :from     [:queue_message_batch]
                             :where    [:and
                                        [:in :queue_name (map name fetchable-names)]
                                        [:= :status "pending"]]
                             :order-by [[:id :asc]]
                             :limit    1
                             :for      [:update]})]
              (t2/update! :queue_message_batch
                          (:id row)
                          {:status_heartbeat (mi/now)
                           :status           "processing"
                           :owner            owner-id})
              {:bundle-id (:id row)
               :queue     (keyword "queue" (:queue_name row))
               :messages  (json/decode (:messages row))})))))))

;; Stale processing recovery
(def ^:private last-stale-check-ms (atom 0))

(defn- recover-stale-processing-batches! []
  (let [max-retries (queue-max-retries)
        threshold   (Timestamp/from (.minusMillis (Instant/now) (* 10 60 1000)))]
    (doseq [row (t2/select :queue_message_batch :status "processing" :status_heartbeat [:< threshold])]
      (let [new-failures (inc (:failures row))]
        (if (>= new-failures max-retries)
          (do
            (log/warnf "Processing batch %d on queue '%s' has reached max failures (%d), marking as failed"
                       (:id row) (:queue_name row) max-retries)
            (mq.analytics/inc! :metabase-mq/queue-batch-permanent-failures {:channel (:queue_name row)})
            (t2/update! :queue_message_batch (:id row)
                        {:status "failed" :failures new-failures :status_heartbeat (mi/now) :owner nil}))
          (do
            (log/warnf "Recovering processing batch %d on queue '%s' (failures: %d -> %d)"
                       (:id row) (:queue_name row) (:failures row) new-failures)
            (mq.analytics/inc! :metabase-mq/batch-stale-recoveries {:transport "queue" :channel (:queue_name row)})
            (t2/update! :queue_message_batch (:id row)
                        {:status "pending" :failures new-failures :status_heartbeat (mi/now) :owner nil})))))))

;; Failed batch cleanup
(def ^:private last-cleanup-ms (atom 0))

(defn- cleanup-failed-batches! []
  (let [threshold (Timestamp/from (.minusMillis (Instant/now) (* 7 24 60 60 1000)))
        deleted   (t2/delete! :queue_message_batch :status "failed" :status_heartbeat [:< threshold])]
    (when (pos? deleted)
      (log/infof "Cleaned up %d failed queue batches" deleted)
      (mq.analytics/inc! :metabase-mq/appdb-cleanup-deleted {:transport "queue" :channel "all"} deleted))))

;; Queue depth gauge
(def ^:private last-depth-gauge-ms (atom 0))

(defn- update-depth-gauges! []
  (doseq [{:keys [queue_name status cnt]}
          (t2/query {:select   [:queue_name :status [[:count :*] :cnt]]
                     :from     [:queue_message_batch]
                     :group-by [:queue_name :status]})]
    (mq.analytics/set! :metabase-mq/appdb-queue-depth {:channel queue_name :status status} cnt)))

;; Heartbeat
(def ^:private last-heartbeat-ms (atom 0))

(defn- update-heartbeats! []
  (doseq [channel (filter #(= "queue" (namespace %)) (mq.impl/busy-channels))]
    (when-let [{:keys [bundle-id]} (mq.impl/active-handler-metadata channel)]
      (try
        (t2/update! :queue_message_batch
                    {:id bundle-id :owner owner-id :status "processing"}
                    {:status_heartbeat (mi/now)})
        (catch Exception e
          (log/warnf e "Failed to update heartbeat for bundle %d" bundle-id))))))

;;; ------------------------------------------- Polling -------------------------------------------

(defn- poll-iteration!
  "One iteration of the polling loop: run periodic tasks, then try to process a batch."
  []
  (mq.polling/periodically! last-stale-check-ms  (* 60 1000)       "stale batch recovery"  recover-stale-processing-batches!)
  (mq.polling/periodically! last-heartbeat-ms     (* 2 60 1000)     "heartbeat update"      update-heartbeats!)
  (mq.polling/periodically! last-cleanup-ms       (* 24 60 60 1000) "failed batch cleanup"  cleanup-failed-batches!)
  (mq.polling/periodically! last-depth-gauge-ms   (* 30 1000)       "queue depth gauge"     update-depth-gauges!)
  (let [available-queues (remove mq.impl/channel-busy? (listener/queue-names))]
    (when (seq available-queues)
      (when-let [{:keys [bundle-id queue messages]} (fetch! available-queues)]
        (mq.impl/submit-delivery! queue messages bundle-id :queue.backend/appdb {:bundle-id bundle-id})))))

(defmethod q.backend/start! :queue.backend/appdb [_]
  (mq.polling/start-polling! poll-state "Queue" 5000 poll-iteration!))

(defmethod q.backend/shutdown! :queue.backend/appdb [_]
  (mq.polling/stop-polling! poll-state "Queue"))

(defmethod q.backend/publish! :queue.backend/appdb
  [_ queue messages]
  (t2/insert! :queue_message_batch
              {:queue_name (name queue)
               :messages   (json/encode messages)})
  (when-not (mq.impl/channel-busy? queue)
    (mq.polling/notify! poll-state)))

(defmethod q.backend/bundle-successful! :queue.backend/appdb
  [_ _queue-name bundle-id]
  (let [deleted (t2/delete! :queue_message_batch :id bundle-id :owner owner-id)]
    (when (= 0 deleted)
      (log/warnf "Message %d was already deleted from the queue." bundle-id))))

(defmethod q.backend/bundle-failed! :queue.backend/appdb
  [_ queue-name bundle-id]
  (let [row     (t2/select-one :queue_message_batch :id bundle-id :owner owner-id)
        updated (when row
                  (if (>= (inc (:failures row)) (queue-max-retries))
                    (do
                      (log/warnf "Message %d has reached max failures (%d), marking as failed" bundle-id (queue-max-retries))
                      (mq.analytics/inc! :metabase-mq/queue-batch-permanent-failures {:channel (name queue-name)})
                      (t2/update! :queue_message_batch
                                  {:id bundle-id :owner owner-id}
                                  {:status "failed" :failures [:+ :failures 1] :status_heartbeat (mi/now) :owner nil}))
                    (do
                      (mq.analytics/inc! :metabase-mq/queue-batch-retries {:channel (name queue-name)})
                      (t2/update! :queue_message_batch
                                  {:id bundle-id :owner owner-id}
                                  {:status "pending" :failures [:+ :failures 1] :status_heartbeat (mi/now) :owner nil}))))]
    (when (and row (= 0 updated))
      (log/warnf "Message %d was not found in the queue. Likely error in concurrency handling" bundle-id))))
