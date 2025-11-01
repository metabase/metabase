(ns metabase.util.queue.protocols)

(defprotocol IQueueListener
  (-start [this])
  (-stop [this])
  (-stop! [this])
  (-closed? [this])
  (-await-termination [this timeout-ms])
  (queue-size [this]))

(defprotocol IQueuePutter
  (put! [this item]))

(defprotocol IDelayQueuePutter
  (put-with-delay! [this delay-ms item]))
