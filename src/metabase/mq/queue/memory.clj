(ns metabase.mq.queue.memory
  "In-memory queue backend. Delegates storage and polling to the shared memory layer.
  Provides queue-specific bundle tracking for retry semantics."
  (:require
   [metabase.mq.analytics :as mq.analytics]
   [metabase.mq.memory :as memory]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:dynamic *bundle-registry*
  "Maps bundle-id -> {:messages [...] :failures n} for retry tracking."
  (atom {}))

(defmethod q.backend/publish! :queue.backend/memory [_ queue-name messages]
  (memory/publish! queue-name messages))

(defmethod q.backend/start! :queue.backend/memory [_]
  (memory/start!))

(defmethod q.backend/shutdown! :queue.backend/memory [_]
  (memory/shutdown!))

(defmethod q.backend/bundle-successful! :queue.backend/memory [_ _queue-name bundle-id]
  (swap! *bundle-registry* dissoc bundle-id))

(defmethod q.backend/bundle-failed! :queue.backend/memory [_ queue-name bundle-id]
  (when-let [{:keys [messages failures]} (get @*bundle-registry* bundle-id)]
    (swap! *bundle-registry* dissoc bundle-id)
    (let [new-failures (inc failures)]
      (if (>= new-failures (@@q.impl/queue-max-retries))
        (do
          (log/warnf "Bundle %s has reached max failures (%d), dropping" bundle-id (@@q.impl/queue-max-retries))
          (mq.analytics/inc! :metabase-mq/queue-batch-permanent-failures {:channel (name queue-name)}))
        (do
          (mq.analytics/inc! :metabase-mq/queue-batch-retries {:channel (name queue-name)})
          ;; Re-queue messages for retry
          (memory/publish! queue-name messages))))))
