(ns metabase.mq.memory
  "Shared in-memory message store for the memory queue and topic backends.
  Each channel gets a LinkedBlockingQueue. Uses the shared polling infrastructure
  from mq.polling to drain non-busy channels and submit messages for delivery."
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.polling :as mq.polling])
  (:import
   (java.util ArrayList)
   (java.util.concurrent LinkedBlockingQueue)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Channel state -------------------------------------------

(def ^:dynamic *channels*
  "channel-name -> LinkedBlockingQueue"
  (atom {}))

(def ^:private poll-state (mq.polling/make-poll-state))

(defn- ensure-channel!
  "Ensures a LinkedBlockingQueue exists for the channel, creating one if needed. Returns the queue."
  ^LinkedBlockingQueue [channel-name]
  (or (get @*channels* channel-name)
      (let [new-q (LinkedBlockingQueue.)]
        (-> (swap! *channels* (fn [chs]
                                (if (contains? chs channel-name)
                                  chs
                                  (assoc chs channel-name new-q))))
            (get channel-name)))))

;;; ------------------------------------------- Publish / Drain -------------------------------------------

(defn publish!
  "Adds messages to the channel's queue and wakes the polling thread."
  [channel-name messages]
  (let [^LinkedBlockingQueue q (ensure-channel! channel-name)]
    (doseq [msg messages]
      (.offer q msg)))
  (when-not (mq.impl/channel-busy? channel-name)
    (mq.polling/notify! poll-state)))

(defn- drain!
  "Removes and returns all messages currently in the channel's queue, or nil if empty."
  [channel-name]
  (when-let [^LinkedBlockingQueue q (get @*channels* channel-name)]
    (when-not (.isEmpty q)
      (let [batch (ArrayList.)]
        (.drainTo q batch)
        (when-not (.isEmpty batch)
          (vec batch))))))

;;; ------------------------------------------- Polling -------------------------------------------

(def ^:private batch-registry
  (delay (requiring-resolve 'metabase.mq.queue.memory/*batch-registry*)))

(defn- register-batch!
  "Registers a batch in the queue memory backend's batch registry for retry tracking."
  [batch-id messages]
  (swap! @@batch-registry assoc batch-id {:messages messages :failures 0}))

(defn- poll-once!
  "Drains all non-busy channels and submits messages for delivery.
   For queue channels, generates a batch-id and passes :queue.backend/memory as backend.
   For topic channels, passes nil batch-id and nil backend (fire-and-forget)."
  []
  (doseq [channel-name (remove mq.impl/channel-busy?
                               (concat (listener/queue-names) (listener/topic-names)))]
    (when-let [messages (drain! channel-name)]
      (if (= "queue" (namespace channel-name))
        (let [batch-id (str (random-uuid))]
          (register-batch! batch-id messages)
          (mq.impl/submit-delivery! channel-name messages batch-id :queue.backend/memory
                                    {:batch-id batch-id}))
        (mq.impl/submit-delivery! channel-name messages nil nil nil)))))

(defn start!
  "Starts the memory polling thread. Idempotent — second call is a no-op."
  []
  (mq.polling/start-polling! poll-state "Memory" 50 poll-once!))

(defn shutdown!
  "Stops the polling thread and clears channel state."
  []
  (mq.polling/stop-polling! poll-state "Memory")
  (reset! *channels* {}))
