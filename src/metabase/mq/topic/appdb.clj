(ns metabase.mq.topic.appdb
  "Database-backed implementation of the pub/sub system using the application database.
  Messages are stored in the `topic_message` table. Each subscriber on each node polls
  independently, tracking its read offset in memory."
  (:require
   [metabase.mq.settings :as mq.settings]
   [metabase.mq.topic.backend :as tp.backend]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private node-id
  "Unique identifier for this node, used to distinguish subscribers across nodes."
  (str (random-uuid)))

(defn- subscriber-key
  "Internal subscriber key that uniquely identifies a subscriber on this node."
  [subscriber-name]
  (str subscriber-name "::" node-id))

(def ^:private ^:dynamic *subscriptions*
  "Map of [topic-name subscriber-key] -> {:offset (atom n), :future f, :handler fn, :subscriber-name s}"
  (atom {}))

(def ^:private poll-interval-ms
  "How often to poll for new messages, in milliseconds."
  2000)

(def ^:private batch-size
  "Maximum number of messages to fetch in a single poll."
  100)

(defn- current-max-id
  "Returns the current maximum id in topic_message for the given topic, or 0 if none exist."
  [topic-name]
  (or (t2/select-one-fn :max-id [:topic_message [[:max :id] :max-id]]
                        :topic_name (name topic-name))
      0))

(defn- poll-messages!
  "Fetches rows from the topic_message table with id > offset. Returns a seq of maps."
  [topic-name offset]
  (t2/query {:select   [:id :messages]
             :from     [:topic_message]
             :where    [:and
                        [:= :topic_name (name topic-name)]
                        [:> :id offset]]
             :order-by [[:id :asc]]
             :limit    batch-size}))

(defn- process-row!
  "Process a single row (which may contain multiple messages), retrying up to max-retries times.
  Returns the row id on success or skip."
  [handler row-id messages-json]
  (let [max-retries (mq.settings/topic-max-retries)]
    (loop [attempt 1]
      (let [result (try
                     (handler {:id row-id :messages (json/decode messages-json)})
                     :success
                     (catch Exception e
                       (if (< attempt max-retries)
                         (do
                           (log/warnf e "Error processing topic message row %d (attempt %d/%d), retrying"
                                      row-id attempt max-retries)
                           :retry)
                         (do
                           (log/errorf e "Error processing topic message row %d after %d attempts, skipping"
                                       row-id max-retries)
                           :skip))))]
        (case result
          :success row-id
          :skip    row-id
          :retry   (recur (inc attempt)))))))

(defn- start-polling-loop!
  "Starts a background polling loop for a subscription. Returns the future."
  [topic-name sub-key]
  (future
    (try
      (loop []
        (when-let [{:keys [offset handler]} (get @*subscriptions* [topic-name sub-key])]
          (let [rows (poll-messages! topic-name @offset)]
            (doseq [{:keys [id messages]} rows]
              (process-row! handler id messages)
              (reset! offset id)))
          (Thread/sleep (long poll-interval-ms))
          (recur)))
      (catch InterruptedException _
        (log/infof "Polling loop interrupted for %s on topic %s" sub-key (name topic-name)))
      (catch Exception e
        (log/errorf e "Unexpected error in polling loop for %s on topic %s" sub-key (name topic-name))))))

(defmethod tp.backend/publish! :topic.backend/appdb
  [_ topic-name messages]
  (t2/insert! :topic_message
              {:topic_name (name topic-name)
               :messages   (json/encode messages)}))

(defmethod tp.backend/subscribe! :topic.backend/appdb
  [_ topic-name subscriber-name handler]
  (let [sub-key (subscriber-key subscriber-name)
        offset  (atom (current-max-id topic-name))]
    (tp.backend/register-handler! topic-name subscriber-name handler)
    ;; Register subscription BEFORE starting the polling loop to avoid race condition
    (swap! *subscriptions* assoc [topic-name sub-key]
           {:offset          offset
            :future          nil
            :handler         handler
            :subscriber-name subscriber-name})
    (let [f (start-polling-loop! topic-name sub-key)]
      (swap! *subscriptions* update [topic-name sub-key] assoc :future f))
    (log/infof "Subscribed %s to topic %s (starting offset %d)" sub-key (name topic-name) @offset)))

(defmethod tp.backend/unsubscribe! :topic.backend/appdb
  [_ topic-name subscriber-name]
  (let [sub-key (subscriber-key subscriber-name)]
    (when-let [{:keys [^java.util.concurrent.Future future]} (get @*subscriptions* [topic-name sub-key])]
      (.cancel future true)
      (swap! *subscriptions* dissoc [topic-name sub-key])
      (tp.backend/unregister-handler! topic-name subscriber-name)
      (log/infof "Unsubscribed %s from topic %s" sub-key (name topic-name)))))

(defmethod tp.backend/cleanup! :topic.backend/appdb
  [_ topic-name max-age-ms]
  (let [threshold (java.sql.Timestamp. (- (System/currentTimeMillis) max-age-ms))
        deleted   (t2/delete! :topic_message
                              :topic_name (name topic-name)
                              :created_at [:< threshold])]
    (when (pos? deleted)
      (log/infof "Cleaned up %d messages from topic %s older than %dms" deleted (name topic-name) max-age-ms))
    deleted))
