(ns metabase.mq.queue.memory
  "In-memory queue backend. Delegates storage and polling to the shared memory layer.
  Provides queue-specific batch tracking for retry semantics."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.mq.memory :as memory]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.settings :as mq.settings]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:dynamic *batch-registry*
  "Maps batch-id -> {:messages [...] :failures n} for retry tracking."
  (atom {}))

(defmethod q.backend/publish! :queue.backend/memory [_ queue-name messages]
  (memory/publish! queue-name messages))

(defmethod q.backend/start! :queue.backend/memory [_]
  (memory/start!))

(defmethod q.backend/shutdown! :queue.backend/memory [_]
  (memory/shutdown!))

(defmethod q.backend/batch-successful! :queue.backend/memory [_ _queue-name batch-id]
  (swap! *batch-registry* dissoc batch-id))

(defmethod q.backend/batch-failed! :queue.backend/memory [_ queue-name batch-id]
  (when-let [{:keys [messages failures]} (get @*batch-registry* batch-id)]
    (swap! *batch-registry* dissoc batch-id)
    (let [new-failures (inc failures)]
      (if (>= new-failures (mq.settings/queue-max-retries))
        (do
          (log/warnf "Batch %s has reached max failures (%d), dropping" batch-id (mq.settings/queue-max-retries))
          (analytics/inc! :metabase-mq/queue-batch-permanent-failures {:channel (name queue-name)}))
        (do
          (analytics/inc! :metabase-mq/queue-batch-retries {:channel (name queue-name)})
          ;; Re-queue messages for retry
          (memory/publish! queue-name messages))))))
