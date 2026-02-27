(ns metabase.mq.queue.memory
  "In-memory implementation of the message queue."
  (:require
   [com.climate.claypoole :as cp]
   [metabase.analytics.prometheus :as analytics]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.settings :as mq.settings]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.time Duration Instant)
   (java.util.concurrent DelayQueue Delayed ExecutorService TimeUnit)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Delay queue primitives -------------------------------------------

(defn delay-queue
  "Return an unbounded queue that returns each item only after some specified delay."
  ^DelayQueue []
  (DelayQueue.))

(defn put-with-delay!
  "Put an item on a delay queue, with a delay given in milliseconds."
  [^DelayQueue queue delay-ms value]
  (let [ready-at (.plus (Instant/now) (Duration/ofMillis (long delay-ms)))]
    (.offer queue (reify Delayed
                    (getDelay [_ unit]
                      (.convert unit (- (.toEpochMilli ready-at) (System/currentTimeMillis)) TimeUnit/MILLISECONDS))
                    (compareTo [this other]
                      (Long/compare (.getDelay this TimeUnit/MILLISECONDS)
                                    (.getDelay ^Delayed other TimeUnit/MILLISECONDS)))
                    clojure.lang.IDeref
                    (deref [_] value)))))

(defn- take-batch!
  "Get a batch of messages off the given delay queue.
  Blocks until at least one message is available, then collects up to max-batch-messages,
  waiting up to max-next-ms for each additional message."
  [^DelayQueue queue ^long max-batch-messages ^long max-next-ms]
  (when-let [fst (.poll queue Long/MAX_VALUE TimeUnit/MILLISECONDS)]
    (loop [acc [@fst]]
      (if (>= (count acc) max-batch-messages)
        acc
        (if-let [item (if (pos? max-next-ms)
                        (.poll queue max-next-ms TimeUnit/MILLISECONDS)
                        (.poll queue))]
          (recur (conj acc @item))
          acc)))))

(defonce ^:private listeners (atom {}))

(defn- listener-thread [listener-name queue handler {:keys [max-batch-messages max-next-ms]}]
  (log/debugf "Thread for listener %s started" listener-name)
  (while true
    (try
      (let [batch (take-batch! queue max-batch-messages max-next-ms)]
        (when (seq batch)
          (log/debugf "Listener %s processing batch of %d" listener-name (count batch))
          (handler batch)))
      (catch InterruptedException e
        (log/debugf "Listener thread %s stopped" listener-name)
        (throw e))
      (catch Exception e
        (log/errorf e "Error in %s while processing batch" listener-name)))))

(def ^:private ^:const max-restart-backoff-ms 30000)
(def ^:private ^:const initial-restart-backoff-ms 500)

(defn- listener-thread-with-restart
  [listener-name queue handler options]
  (loop [backoff-ms initial-restart-backoff-ms]
    (try
      (listener-thread listener-name queue handler options)
      (catch InterruptedException _e
        (throw (InterruptedException.)))
      (catch Throwable e
        (log/errorf e "Listener thread %s crashed, restarting in %dms" listener-name backoff-ms)))
    (Thread/sleep ^long backoff-ms)
    (when-not (.isShutdown ^ExecutorService (get @listeners listener-name))
      (recur (min max-restart-backoff-ms (* 2 backoff-ms))))))

(defn- start-listener!
  "Starts an async listener on the given delay queue."
  [listener-name queue handler {:keys [max-batch-messages max-next-ms]
                                :or   {max-batch-messages 50
                                       max-next-ms        100}}]
  (let [executor (cp/threadpool 1 {:name (str "queue-" listener-name)})]
    (log/infof "Starting listener %s %s" (u/format-color 'green listener-name) (u/emoji "\uD83C\uDFA7"))
    (cp/future executor (listener-thread-with-restart listener-name queue handler
                                                      {:max-batch-messages max-batch-messages
                                                       :max-next-ms        max-next-ms}))
    (swap! listeners assoc listener-name executor)))

(defn- stop-listener!
  "Stops the listener previously started with start-listener!."
  [listener-name]
  (if-let [^ExecutorService executor (get @listeners listener-name)]
    (do
      (log/infof "Stopping listener %s..." listener-name)
      (cp/shutdown! executor)
      (.awaitTermination executor 10 TimeUnit/SECONDS)
      (swap! listeners dissoc listener-name)
      (log/infof "Stopping listener %s...done" listener-name))
    (log/infof "No running listener named %s" listener-name)))

;;; ------------------------------------------- Queue state -------------------------------------------

(def ^:dynamic *queues*
  "Atom containing map of queue-name -> DelayQueue for the in-memory backend."
  (atom {}))

(def ^:dynamic *bundle-registry*
  "Maps bundle-id -> {:message ... :failures ...} for retry tracking."
  (atom {}))

(defn- get-queue [queue-name]
  (if-let [queue (get @*queues* queue-name)]
    queue
    (throw (ex-info "Queue not defined" {:queue queue-name}))))

;;; ------------------------------------------- Backend methods -------------------------------------------

(defmethod q.backend/publish! :queue.backend/memory [_ queue-name messages]
  (let [q (get-queue queue-name)]
    (doseq [message messages]
      (put-with-delay! q 0 message))))

(defmethod q.backend/queue-length :queue.backend/memory [_ queue-name]
  (if-let [^java.util.Collection q (get @*queues* queue-name)]
    (.size q)
    0))

(defmethod q.backend/listen! :queue.backend/memory [_ queue-name]
  (when-not (contains? @*queues* queue-name)
    (swap! *queues* assoc queue-name (delay-queue)))
  (let [queue  (get-queue queue-name)
        {:keys [max-batch-messages max-next-ms]
         :or   {max-batch-messages 50 max-next-ms 100}} (get @q.impl/*handlers* queue-name)]
    (start-listener!
     (name queue-name)
     queue
     (bound-fn [messages]
       (doseq [msg messages]
         (let [bundle-id (str (random-uuid))]
           (swap! *bundle-registry* assoc bundle-id {:message msg :failures 0})
           (q.impl/deliver-bundle! :queue.backend/memory queue-name bundle-id [msg]))))
     {:max-batch-messages max-batch-messages
      :max-next-ms        max-next-ms})
    (log/infof "Registered memory handler for queue %s" (name queue-name))))

(defmethod q.backend/stop-listening! :queue.backend/memory [_ queue-name]
  (stop-listener! (name queue-name))
  (swap! *queues* dissoc queue-name)
  (log/infof "Unregistered memory handler for queue %s" (name queue-name)))

(defmethod q.backend/shutdown! :queue.backend/memory [_]
  nil)

(defmethod q.backend/bundle-successful! :queue.backend/memory [_ _queue-name bundle-id]
  (swap! *bundle-registry* dissoc bundle-id))

(defmethod q.backend/bundle-failed! :queue.backend/memory [_ queue-name bundle-id]
  (when-let [{:keys [message failures]} (get @*bundle-registry* bundle-id)]
    (swap! *bundle-registry* dissoc bundle-id)
    (let [new-failures (inc failures)]
      (if (>= new-failures (mq.settings/queue-max-retries))
        (do
          (log/warnf "Bundle %s has reached max failures (%d), dropping" bundle-id (mq.settings/queue-max-retries))
          (analytics/inc! :metabase-mq/queue-bundle-permanent-failures {:queue (name queue-name)}))
        ;; Retry asynchronously with a new bundle-id carrying the accumulated failure count.
        ;; We call handle! directly rather than re-queuing, so the failure count is preserved.
        ;; Note: this future is untracked — if the JVM shuts down during retry, it will be lost.
        ;; Acceptable for the test-only memory backend.
        (do
          (analytics/inc! :metabase-mq/queue-bundle-retries {:queue (name queue-name)})
          (future
            (let [new-bundle-id (str (random-uuid))]
              (swap! *bundle-registry* assoc new-bundle-id {:message message :failures new-failures})
              (q.impl/handle! queue-name {new-bundle-id :queue.backend/memory} [message]))))))))
