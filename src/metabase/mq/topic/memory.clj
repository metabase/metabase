(ns metabase.mq.topic.memory
  "In-memory implementation of the pub/sub system for testing purposes.
  Each topic stores rows in a vector. Subscribers poll from their offset."
  (:require
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:dynamic *topics*
  "Atom containing map of topic-name -> {:rows (atom [{:id n :messages [...]} ...]), :next-id (atom n)}"
  (atom {}))

(def ^:dynamic *subscriptions*
  "Atom containing map of topic-name -> {:offset (atom n), :future f, :handler fn}"
  (atom {}))

(defn- ensure-topic!
  "Ensures a topic exists in *topics*, creating it if necessary."
  [topic-name]
  (when-not (contains? @*topics* topic-name)
    (swap! *topics* assoc topic-name {:rows    (atom [])
                                      :next-id (atom 0)})))

(defn- get-topic
  "Returns the topic state map, or throws if the topic doesn't exist."
  [topic-name]
  (or (get @*topics* topic-name)
      (throw (ex-info "Topic not defined" {:topic topic-name}))))

(def ^:private poll-interval-ms
  "Polling interval for memory backend, shorter than appdb for faster tests."
  50)

(defn- start-polling-loop!
  "Starts a background polling loop for a memory subscription."
  [topic-name]
  (future
    (try
      (loop []
        (when-let [{:keys [offset handler]} (get @*subscriptions* topic-name)]
          (let [{:keys [rows]} (get-topic topic-name)
                current-offset @offset
                new-rows       (filterv #(> (:id %) current-offset) @rows)]
            (doseq [{:keys [id messages]} new-rows]
              (try
                (handler {:batch-id id :messages messages})
                (catch Exception e
                  (log/warnf e "Error in memory subscriber for topic %s on row %d" (name topic-name) id)))
              (reset! offset id)))
          (Thread/sleep (long poll-interval-ms))
          (recur)))
      (catch InterruptedException _
        (log/infof "Memory polling loop interrupted for topic %s" (name topic-name))))))

(defmethod topic.backend/publish! :topic.backend/memory
  [_ topic-name messages]
  (ensure-topic! topic-name)
  (let [{:keys [rows next-id]} (get-topic topic-name)
        id (swap! next-id inc)]
    (swap! rows conj {:id id :messages messages :created-at (System/currentTimeMillis)})))

(defmethod topic.backend/subscribe! :topic.backend/memory
  [_ topic-name handler]
  (ensure-topic! topic-name)
  (let [{:keys [rows]} (get-topic topic-name)
        current-max (if (seq @rows)
                      (:id (last @rows))
                      0)
        offset      (atom current-max)]
    ;; Register subscription BEFORE starting the polling loop to avoid race condition
    (swap! *subscriptions* assoc topic-name
           {:offset  offset
            :future  nil
            :handler handler})
    (let [f (start-polling-loop! topic-name)]
      (swap! *subscriptions* update topic-name assoc :future f))
    (log/infof "Memory subscribed to topic %s (offset %d)" (name topic-name) current-max)))

(defmethod topic.backend/unsubscribe! :topic.backend/memory
  [_ topic-name]
  (when-let [{:keys [^java.util.concurrent.Future future]} (get @*subscriptions* topic-name)]
    (.cancel future true)
    (swap! *subscriptions* dissoc topic-name)
    (log/infof "Memory unsubscribed from topic %s" (name topic-name))))

