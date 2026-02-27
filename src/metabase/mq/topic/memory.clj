(ns metabase.mq.topic.memory
  "In-memory implementation of the pub/sub system for testing purposes.
  Each topic stores rows in a vector. Subscribers poll from their offset."
  (:require
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:dynamic *topics*
  "Atom containing map of topic-name -> {:rows (atom [{:id n :messages [...]} ...]), :next-id (atom n)}"
  (atom {}))

(def ^:dynamic *offsets*
  "Map of topic-name -> long offset."
  (atom {}))

(def ^:dynamic *background-process*
  "Holds the single shared polling future, or nil."
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

(defn- start-polling!
  "Starts the single shared polling loop if not already running. Idempotent."
  []
  (when-not @*background-process*
    (let [f (future
              (try
                (loop []
                  (when @*background-process*
                    (doseq [topic-name (keys @topic.backend/*handlers*)]
                      (try
                        (let [offset (get @*offsets* topic-name)]
                          (when offset
                            (let [{:keys [rows]} (get-topic topic-name)
                                  new-rows (filterv #(> (:id %) offset) @rows)]
                              (doseq [{:keys [id messages]} new-rows]
                                (topic.impl/handle! topic-name messages)
                                (swap! *offsets* assoc topic-name id)))))
                        (catch Exception e
                          (log/errorf e "Error polling memory topic %s" (name topic-name)))))
                    (Thread/sleep (long poll-interval-ms))
                    (recur)))
                (catch InterruptedException _
                  (log/info "Memory topic polling loop interrupted"))))]
      (when-not (compare-and-set! *background-process* nil f)
        (future-cancel f)))))

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
    (start-polling!)
    (log/infof "Memory subscribed to topic %s (offset %d)" (name topic-name) current-max)))

(defmethod topic.backend/unsubscribe! :topic.backend/memory
  [_ topic-name]
  (swap! *offsets* dissoc topic-name)
  (swap! *topics* dissoc topic-name)
  (log/infof "Memory unsubscribed from topic %s" (name topic-name)))

