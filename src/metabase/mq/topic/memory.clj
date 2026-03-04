(ns metabase.mq.topic.memory
  "In-memory implementation of the pub/sub system.
  Each topic stores rows in a vector. Subscribers poll from their offset.
  Uses a claypoole threadpool with exponential backoff restart for robustness."
  (:require
   [com.climate.claypoole :as cp]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent ExecutorService TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:dynamic *topics*
  "Atom containing map of topic-name -> {:rows (atom [{:id n :messages [...]} ...]), :next-id (atom n)}"
  (atom {}))

(def ^:dynamic *offsets*
  "Map of topic-name -> long offset."
  (atom {}))

(def ^:dynamic *executor*
  "Holds the claypoole threadpool executor, or nil."
  (atom nil))

(defn- ensure-topic!
  "Ensures a topic exists in *topics*, creating it if necessary."
  [topic-name]
  (swap! *topics* (fn [topics]
                    (if (contains? topics topic-name)
                      topics
                      (assoc topics topic-name {:rows    (atom [])
                                                :next-id (atom 0)})))))

(defn- get-topic
  "Returns the topic state map, or throws if the topic doesn't exist."
  [topic-name]
  (or (get @*topics* topic-name)
      (throw (ex-info "Topic not defined" {:topic topic-name}))))

(def ^:private poll-interval-ms
  "Polling interval for memory backend, shorter than appdb for faster tests."
  50)

(def ^:private ^:const max-restart-backoff-ms 30000)
(def ^:private ^:const initial-restart-backoff-ms 500)

(defn- poll-all-topics!
  "Polls all subscribed topics for new messages and dispatches to listeners."
  []
  (doseq [topic-name (keys @topic.impl/*listeners*)]
    (try
      (let [offset (if (contains? @*offsets* topic-name)
                     (get @*offsets* topic-name)
                     ;; Lazily initialize offset for newly registered topics
                     (do
                       (ensure-topic! topic-name)
                       (let [{:keys [rows]} (get-topic topic-name)
                             current-max (if (seq @rows)
                                           (:id (last @rows))
                                           0)]
                         (swap! *offsets* assoc topic-name current-max)
                         current-max)))
            {:keys [rows]} (get-topic topic-name)
            new-rows (sort-by :id (filterv #(> (:id %) offset) @rows))]
        (doseq [{:keys [id messages]} new-rows]
          (topic.impl/handle! topic-name messages)
          (swap! *offsets* assoc topic-name id)))
      (catch Exception e
        (log/errorf e "Error polling memory topic %s" (name topic-name))))))

(defn- polling-loop
  "Runs the polling loop with exponential backoff restart on crash."
  []
  (loop [backoff-ms initial-restart-backoff-ms]
    (try
      (while @*executor*
        (poll-all-topics!)
        (Thread/sleep (long poll-interval-ms)))
      (catch InterruptedException _e
        (throw (InterruptedException.)))
      (catch Throwable e
        (log/errorf e "Memory topic polling loop crashed, restarting in %dms" backoff-ms)))
    (Thread/sleep ^long backoff-ms)
    (when (and @*executor*
               (not (.isShutdown ^ExecutorService @*executor*)))
      (recur (min max-restart-backoff-ms (* 2 backoff-ms))))))

(defn- start-polling!
  "Starts the polling loop in a claypoole threadpool. Idempotent via compare-and-set!."
  []
  (when-not @*executor*
    (let [exec (cp/threadpool 1 {:name "topic-memory-poller"})]
      (if (compare-and-set! *executor* nil exec)
        (let [f (bound-fn [] (polling-loop))]
          (cp/future exec (f)))
        (cp/shutdown! exec)))))

(defmethod topic.backend/start! :topic.backend/memory [_]
  (start-polling!))

(defmethod topic.backend/publish! :topic.backend/memory
  [_ topic-name messages]
  (ensure-topic! topic-name)
  (let [{:keys [rows next-id]} (get-topic topic-name)
        id (swap! next-id inc)]
    (swap! rows conj {:id id :messages messages :created-at (System/currentTimeMillis)})))

(defmethod topic.backend/subscribe! :topic.backend/memory
  [_ topic-name]
  (ensure-topic! topic-name)
  (let [{:keys [rows]} (get-topic topic-name)
        current-max (if (seq @rows)
                      (:id (last @rows))
                      0)]
    (swap! *offsets* assoc topic-name current-max)
    (log/infof "Memory subscribed to topic %s (offset %d)" (name topic-name) current-max)))

(defmethod topic.backend/unsubscribe! :topic.backend/memory
  [_ topic-name]
  (swap! *offsets* dissoc topic-name)
  (swap! *topics* dissoc topic-name)
  (log/infof "Memory unsubscribed from topic %s" (name topic-name)))

(defmethod topic.backend/shutdown! :topic.backend/memory [_]
  (when-let [^ExecutorService exec @*executor*]
    (reset! *executor* nil)
    (cp/shutdown! exec)
    (.awaitTermination exec 10 TimeUnit/SECONDS)
    (log/info "Memory topic polling stopped")))
