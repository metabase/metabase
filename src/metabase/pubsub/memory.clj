(ns metabase.pubsub.memory
  "In-memory implementation of the pub/sub system for testing purposes.
  Each topic stores rows in a vector. Subscribers poll from their offset."
  (:require
   [metabase.pubsub.backend :as ps.backend]
   [metabase.pubsub.listener :as ps.listener]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:dynamic *topics*
  "Atom containing map of topic-name -> {:rows (atom [{:id n :messages [...]} ...]), :next-id (atom n)}"
  (atom {}))

(def ^:dynamic *subscriptions*
  "Atom containing map of [topic-name subscriber-name] -> {:offset (atom n), :future f, :handler fn}"
  (atom {}))

(def ^:dynamic *recent*
  "Tracks recent callback invocations for testing purposes."
  {:published-messages (atom [])
   :received-messages  (atom [])
   :errors             (atom [])})

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

(defn reset-tracking!
  "Resets all tracking atoms to empty vectors."
  []
  (reset! (:published-messages *recent*) [])
  (reset! (:received-messages *recent*) [])
  (reset! (:errors *recent*) []))

(def ^:private poll-interval-ms
  "Polling interval for memory backend, shorter than appdb for faster tests."
  50)

(defn- start-polling-loop!
  "Starts a background polling loop for a memory subscription."
  [topic-name subscriber-name]
  (future
    (try
      (loop []
        (when-let [{:keys [offset handler]} (get @*subscriptions* [topic-name subscriber-name])]
          (let [{:keys [rows]} (get-topic topic-name)
                current-offset @offset
                new-rows       (filterv #(> (:id %) current-offset) @rows)]
            (doseq [{:keys [id messages]} new-rows]
              (try
                (handler {:id id :messages messages})
                (swap! (:received-messages *recent*) conj {:topic topic-name :subscriber subscriber-name :messages messages})
                (catch Exception e
                  (log/warnf e "Error in memory subscriber %s for topic %s on row %d" subscriber-name (name topic-name) id)
                  (swap! (:errors *recent*) conj {:topic topic-name :subscriber subscriber-name :id id :error e})))
              (reset! offset id)))
          (Thread/sleep (long poll-interval-ms))
          (recur)))
      (catch InterruptedException _
        (log/infof "Memory polling loop interrupted for %s on topic %s" subscriber-name (name topic-name))))))

(defmethod ps.backend/publish! :pubsub.backend/memory
  [_ topic-name messages]
  (ensure-topic! topic-name)
  (let [{:keys [rows next-id]} (get-topic topic-name)
        id (swap! next-id inc)]
    (swap! rows conj {:id id :messages messages})
    (swap! (:published-messages *recent*) conj {:topic topic-name :id id :messages messages})))

(defmethod ps.backend/subscribe! :pubsub.backend/memory
  [_ topic-name subscriber-name handler]
  (ensure-topic! topic-name)
  (ps.listener/register-handler! topic-name subscriber-name handler)
  (let [{:keys [rows]} (get-topic topic-name)
        current-max (if (seq @rows)
                      (:id (last @rows))
                      0)
        offset      (atom current-max)]
    ;; Register subscription BEFORE starting the polling loop to avoid race condition
    (swap! *subscriptions* assoc [topic-name subscriber-name]
           {:offset  offset
            :future  nil
            :handler handler})
    (let [f (start-polling-loop! topic-name subscriber-name)]
      (swap! *subscriptions* update [topic-name subscriber-name] assoc :future f))
    (log/infof "Memory subscribed %s to topic %s (offset %d)" subscriber-name (name topic-name) current-max)))

(defmethod ps.backend/unsubscribe! :pubsub.backend/memory
  [_ topic-name subscriber-name]
  (when-let [{:keys [^java.util.concurrent.Future future]} (get @*subscriptions* [topic-name subscriber-name])]
    (.cancel future true)
    (swap! *subscriptions* dissoc [topic-name subscriber-name])
    (ps.listener/unregister-handler! topic-name subscriber-name)
    (log/infof "Memory unsubscribed %s from topic %s" subscriber-name (name topic-name))))

(defmethod ps.backend/cleanup! :pubsub.backend/memory
  [_ topic-name max-age-ms]
  (let [{:keys [rows]} (get-topic topic-name)
        threshold (- (System/currentTimeMillis) max-age-ms)
        before    (count @rows)]
    (swap! rows (fn [rs] (filterv #(> (or (:created-at %) (System/currentTimeMillis)) threshold) rs)))
    (- before (count @rows))))
