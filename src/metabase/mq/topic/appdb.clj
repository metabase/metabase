(ns metabase.mq.topic.appdb
  "Database-backed implementation of the pub/sub system using the application database.
  Messages are stored in the `topic_message` table. Each subscriber on each node polls
  independently, tracking its read offset in memory."
  (:require
   [metabase.mq.settings :as mq.settings]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ^:dynamic *subscriptions*
  "Map of topic-name -> {:offset (atom n), :future f, :handler fn}"
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
  (or (t2/select-one-fn :max-id [:topic_message_batch [[:max :id] :max-id]]
                        :topic_name (name topic-name))
      0))

(defn- poll-messages!
  "Fetches rows from the topic_message table with id > offset. Returns a seq of maps."
  [topic-name offset]
  (t2/query {:select   [:id :messages]
             :from     [:topic_message_batch]
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
                     (handler {:batch-id row-id :messages (json/decode messages-json)})
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
  [topic-name]
  (future
    (try
      (loop []
        (when-let [{:keys [offset handler]} (get @*subscriptions* topic-name)]
          (let [rows (poll-messages! topic-name @offset)]
            (doseq [{:keys [id messages]} rows]
              (process-row! handler id messages)
              (reset! offset id)))
          (Thread/sleep (long poll-interval-ms))
          (recur)))
      (catch InterruptedException _
        (log/infof "Polling loop interrupted for topic %s" (name topic-name)))
      (catch Exception e
        (log/errorf e "Unexpected error in polling loop for topic %s" (name topic-name))))))

;;; ------------------------------------------- Automatic Periodic Cleanup -------------------------------------------

(def ^:private cleanup-max-age-ms
  "Messages older than this are eligible for cleanup (1 hour)."
  (* 60 60 1000))

(def ^:private cleanup-interval-ms
  "How often the cleanup loop runs (10 mins)."
  (* 10 60 1000))

(def ^:private cleanup-future
  "Holds the background future running the cleanup loop, or nil if not started."
  (atom nil))

(defn- cleanup-old-messages!
  "Deletes all `topic_message` rows older than [[cleanup-max-age-ms]]."
  []
  (let [threshold (java.sql.Timestamp. (- (System/currentTimeMillis) cleanup-max-age-ms))
        deleted   (t2/delete! :topic_message_batch :created_at [:< threshold])]
    (when (pos? deleted)
      (log/infof "Cleaned up %d old topic messages" deleted))
    deleted))

(defn- start-cleanup-loop!
  "Starts a background loop that periodically runs [[cleanup-old-messages!]].
  Loops while [[cleanup-future]] is non-nil."
  []
  (future
    (try
      (loop []
        (when @cleanup-future
          (try
            (cleanup-old-messages!)
            (catch Exception e
              (log/errorf e "Error during topic message cleanup")))
          (Thread/sleep (long cleanup-interval-ms))
          (recur)))
      (catch InterruptedException _
        (log/info "Topic cleanup loop interrupted")))))

(defn stop-cleanup!
  "Stops the periodic cleanup loop if it is running."
  []
  (when-let [^java.util.concurrent.Future f @cleanup-future]
    (reset! cleanup-future nil)
    (.cancel f true)
    (log/info "Topic cleanup loop stopped")))

;;; ------------------------------------------- Backend Multimethods -------------------------------------------

(defmethod topic.backend/publish! :topic.backend/appdb
  [_ topic-name messages]
  (t2/insert! :topic_message_batch
              {:topic_name (name topic-name)
               :messages   (json/encode messages)}))

(defmethod topic.backend/subscribe! :topic.backend/appdb
  [_ topic-name handler]
  (let [offset (atom (current-max-id topic-name))]
    ;; Register subscription BEFORE starting the polling loop to avoid race condition
    (swap! *subscriptions* assoc topic-name
           {:offset  offset
            :future  nil
            :handler handler})
    (let [f (start-polling-loop! topic-name)]
      (swap! *subscriptions* update topic-name assoc :future f))
    ;; Idempotently start the cleanup loop on first subscription
    (when-not @cleanup-future
      (locking cleanup-future
        (when-not @cleanup-future
          (let [f (start-cleanup-loop!)]
            (reset! cleanup-future f)
            (log/info "Topic cleanup loop started")))))
    (log/infof "Subscribed to topic %s (starting offset %d)" (name topic-name) @offset)))

(defmethod topic.backend/unsubscribe! :topic.backend/appdb
  [_ topic-name]
  (when-let [{:keys [^java.util.concurrent.Future future]} (get @*subscriptions* topic-name)]
    (.cancel future true)
    (swap! *subscriptions* dissoc topic-name)
    (log/infof "Unsubscribed from topic %s" (name topic-name))))
