(ns metabase.mq.memory
  "Shared in-memory message store used by the memory queue backend.
  Each `layer` is a self-contained bundle of channel state, batch-registry, and a
  poll thread — tests can construct isolated layers with [[make-layer]] instead of
  rebinding dynamic vars.

  Each channel queue holds opaque payload strings (one per publish); the backend never looks
  inside them — decoding happens once at delivery in [[metabase.mq.impl/deliver!]]."
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.polling :as mq.polling])
  (:import
   (java.util.concurrent LinkedBlockingQueue)))

(set! *warn-on-reflection* true)

(declare poll-once!)

(defn make-layer
  "Creates a fresh memory layer. `:channels` is a map of channel-name →
  LinkedBlockingQueue, `:batch-registry` tracks queue retries, `:queue-backend` is
  populated when the queue backend's `start!` runs so the poll loop knows which
  backend instance to hand to [[mq.impl/submit-delivery!]]."
  []
  {:channels         (atom {})
   :batch-registry   (atom {})
   :channel-failures (atom {})
   :queue-backend    (atom nil)
   :poll-state       (mq.polling/make-poll-state)})

(defonce ^{:doc "Process-wide singleton layer shared by the production memory backends."}
  default-layer
  (make-layer))

;;; ------------------------------------------- Channel state -------------------------------------------

(defn- ensure-channel!
  "Ensures a LinkedBlockingQueue exists for the channel, creating one if needed. Returns the queue."
  ^LinkedBlockingQueue [{:keys [channels]} channel-name]
  (or (get @channels channel-name)
      (let [new-q (LinkedBlockingQueue.)]
        (-> (swap! channels (fn [chs]
                              (if (contains? chs channel-name)
                                chs
                                (assoc chs channel-name new-q))))
            (get channel-name)))))

;;; ------------------------------------------- Publish / Drain -------------------------------------------

(defn publish!
  "Adds an opaque payload string to the channel's queue and wakes the polling thread.
  One payload per publish — the memory backend does not coalesce across publishes (the
  publish buffer already does that upstream)."
  [{:keys [poll-state] :as layer} channel-name payload]
  (let [^LinkedBlockingQueue q (ensure-channel! layer channel-name)]
    (.offer q payload))
  (when-not (mq.impl/channel-busy? channel-name)
    (mq.polling/notify! poll-state)))

(defn- register-batch!
  "Registers a payload in the layer's batch registry for retry tracking.
  Inherits the failure count tracked for the channel — `batch-failed!` re-publishes
  the payload and bumps the counter, so a new batch on the same channel must see
  the accumulated count rather than starting from zero."
  [{:keys [batch-registry channel-failures]} batch-id channel-name payload]
  (let [failures (get @channel-failures channel-name 0)]
    (swap! batch-registry assoc batch-id {:payload payload :failures failures})))

;;; ------------------------------------------- Polling -------------------------------------------

(defn- poll-once!
  "Submits one pending payload per non-busy queue channel for delivery.
  Generates a batch-id and passes the layer's registered queue backend."
  [{:keys [queue-backend channels] :as layer}]
  (doseq [channel-name (remove mq.impl/channel-busy? (listener/queue-names))]
    (when-let [^LinkedBlockingQueue q (get @channels channel-name)]
      (when-let [payload (.poll q)]
        (let [batch-id (str (random-uuid))]
          (register-batch! layer batch-id channel-name payload)
          (mq.impl/submit-delivery! channel-name payload batch-id @queue-backend
                                    {:batch-id batch-id}))))))

(defn start!
  "Starts the layer's polling thread. Idempotent — second call is a no-op."
  [{:keys [poll-state] :as layer}]
  (mq.polling/start-polling! poll-state "Memory" 50 #(poll-once! layer)))

(defn shutdown!
  "Stops the polling thread and clears channel state."
  [{:keys [poll-state channels batch-registry channel-failures queue-backend]}]
  (mq.polling/stop-polling! poll-state "Memory")
  (reset! channels {})
  (reset! batch-registry {})
  (reset! channel-failures {})
  (reset! queue-backend nil))
