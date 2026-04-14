(ns metabase.mq.memory
  "Shared in-memory message store used by the memory queue and topic backends.
  Each `layer` is a self-contained bundle of channel state, batch-registry, and a
  poll thread — tests can construct isolated layers with [[make-layer]] instead of
  rebinding dynamic vars."
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.polling :as mq.polling])
  (:import
   (java.util ArrayList)
   (java.util.concurrent LinkedBlockingQueue)))

(set! *warn-on-reflection* true)

(declare poll-once!)

(defn make-layer
  "Creates a fresh memory layer. `:channels` is a map of channel-name →
  LinkedBlockingQueue, `:batch-registry` tracks queue retries, `:queue-backend` is
  populated when the queue backend's `start!` runs so the poll loop knows which
  backend instance to hand to [[mq.impl/submit-delivery!]]."
  []
  {:channels       (atom {})
   :batch-registry (atom {})
   :queue-backend  (atom nil)
   :poll-state     (mq.polling/make-poll-state)})

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
  "Adds messages to the channel's queue and wakes the polling thread."
  [{:keys [poll-state] :as layer} channel-name messages]
  (let [^LinkedBlockingQueue q (ensure-channel! layer channel-name)]
    (doseq [msg messages]
      (.offer q msg)))
  (when-not (mq.impl/channel-busy? channel-name)
    (mq.polling/notify! poll-state)))

(defn- drain!
  "Removes and returns all messages currently in the channel's queue, or nil if empty."
  [{:keys [channels]} channel-name]
  (when-let [^LinkedBlockingQueue q (get @channels channel-name)]
    (when-not (.isEmpty q)
      (let [batch (ArrayList.)]
        (.drainTo q batch)
        (when-not (.isEmpty batch)
          (vec batch))))))

(defn- register-batch!
  "Registers a batch in the layer's batch registry for retry tracking."
  [{:keys [batch-registry]} batch-id messages]
  (swap! batch-registry assoc batch-id {:messages messages :failures 0}))

;;; ------------------------------------------- Polling -------------------------------------------

(defn- poll-once!
  "Drains all non-busy channels and submits messages for delivery.
  For queue channels, generates a batch-id and passes the layer's registered
  queue backend. For topic channels, passes nil batch-id and nil backend."
  [{:keys [queue-backend] :as layer}]
  (doseq [channel-name (remove mq.impl/channel-busy?
                               (concat (listener/queue-names) (listener/topic-names)))]
    (when-let [messages (drain! layer channel-name)]
      (if (= "queue" (namespace channel-name))
        (let [batch-id (str (random-uuid))]
          (register-batch! layer batch-id messages)
          (mq.impl/submit-delivery! channel-name messages batch-id @queue-backend
                                    {:batch-id batch-id}))
        (mq.impl/submit-delivery! channel-name messages nil nil nil)))))

(defn start!
  "Starts the layer's polling thread. Idempotent — second call is a no-op."
  [{:keys [poll-state] :as layer}]
  (mq.polling/start-polling! poll-state "Memory" 50 #(poll-once! layer)))

(defn shutdown!
  "Stops the polling thread and clears channel state."
  [{:keys [poll-state channels batch-registry queue-backend]}]
  (mq.polling/stop-polling! poll-state "Memory")
  (reset! channels {})
  (reset! batch-registry {})
  (reset! queue-backend nil))
