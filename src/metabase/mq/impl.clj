(ns metabase.mq.impl
  "Transport-agnostic message delivery, shared by every queue backend today — and intended to be the
  code that **topics and queues share** once topics exist."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.mq.listener :as listener]
   [metabase.mq.payload :as payload]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ Activity tracking ------------------------------------------

(def ^:private last-activity*
  "channel keyword → nanoTime of last publish or handler completion."
  (atom {}))

(defn last-activity
  "Returns the nanoTime of the last publish or handler completion for the given channel, or nil."
  [channel]
  (get @last-activity* channel))

(defn record-publish-activity!
  "Records a publish event for the given channel. Called by the publishing pipeline."
  [channel]
  (swap! last-activity* assoc channel (System/nanoTime)))

;;; --------------------------------------- Normalized deliver! results ---------------------------------------

(def no-listener
  "Marker [[deliver!]] returns when `channel` has no listener running on this node. Push backends
  (e.g. Quartz) treat it as 'defer to a node that has a listener' rather than a delivered/dropped
  message; poll backends leave the batch for the stale-recovery sweep. The message must not be
  consumed here."
  ::no-listener)

(def undecodable
  "Marker [[deliver!]] returns when a payload can't be decoded — corrupt or incompatible, so no node
  can ever deliver it. Already metered as `batches-dropped{reason=undecodable}`, so callers just drop
  the message (a poll backend acks the stored batch; a push backend completes the trigger)."
  ::undecodable)

;;; ------------------------------------------- Delivery core -------------------------------------------

(defn- run-listener!
  "Invokes `listener` with the decoded `messages` batch for `channel`.
  Returns nil on success, or the `Throwable` the listener threw."
  [channel listener messages]
  (let [labels {:transport (namespace channel) :channel (name channel)}
        start  (System/nanoTime)]
    (try
      (listener messages)
      (analytics/inc! :metabase-mq/batches-handled (assoc labels :status "success"))
      nil
      (catch Exception e
        (log/error e (str "Error handling " (namespace channel) " message") labels)
        (analytics/inc! :metabase-mq/batches-handled (assoc labels :status "error"))
        e)
      (finally
        (analytics/observe! :metabase-mq/handle-duration-ms labels
                            (/ (double (- (System/nanoTime) start)) 1e6))))))

(defn- decode-or-drop!
  "Decodes the opaque `payload` for `channel`. Returns the decoded messages on success. If the payload
  can't be decoded (corrupt/incompatible — something retrying can never fix) logs an error,
  increments `batches-dropped` `reason=undecodable`, and returns [[undecodable]] so callers drop the
  message instead of letting the exception escape past the retry/drop machinery."
  [channel payload]
  (try
    (payload/decode payload)
    (catch Exception e
      (log/error e "Dropping queue message with an undecodable payload"
                 {:channel channel :payload-bytes (count (str payload))})
      (analytics/inc! :metabase-mq/batches-dropped {:channel (name channel) :reason "undecodable"})
      undecodable)))

(defn deliver!
  "Transport-agnostic delivery core. Decodes the opaque `payload` for `channel`, resolves the channel's listener,
  and invokes it with the decoded batch and the same metrics on every backend.

  Returns a *normalized* result the calling backend interprets; it never acks, nacks, reschedules, or
  otherwise touches backend state, so poll and push backends can share it:

    [[no-listener]]  — no listener for `channel` runs on this node (the message wasn't consumed)
    [[undecodable]]  — the payload is corrupt/incompatible and can never be delivered on any node
    nil              — delivered successfully
    a Throwable      — the listener failed; the caller retries or drops per its own policy

  Poll backends turn these into ack/nack on a stored batch ([[metabase.mq.queue.polling]]); push
  backends turn them into trigger completion/requeue/refire ([[metabase.mq.queue.quartz]])."
  [channel payload]
  (swap! last-activity* assoc channel (System/nanoTime))
  (let [messages (decode-or-drop! channel payload)]
    (if (= undecodable messages)
      undecodable
      (if-let [listener (:listener (listener/get-listener channel))]
        (do
          (analytics/inc! :metabase-mq/messages-received
                          {:transport (namespace channel) :channel (name channel)} (count messages))
          (run-listener! channel listener messages))
        no-listener))))
