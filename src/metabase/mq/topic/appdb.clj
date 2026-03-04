(ns metabase.mq.topic.appdb
  "Database-backed implementation of the pub/sub system using the application database.
  Messages are stored in the `topic_message` table. Each subscriber on each node polls
  independently, tracking its read offset in memory."
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (java.sql Timestamp)
           (java.time Instant)
           (java.util.concurrent Future)))

(set! *warn-on-reflection* true)

(def keep-me
  "Referenced from [[metabase.mq.core]] to ensure this namespace is loaded."
  true)

(def ^:private offsets
  "Map of topic-name -> long offset."
  (atom {}))

(def ^:private background-process
  "Holds the single shared polling future, or nil."
  (atom nil))

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

(defn- start-polling!
  "Starts the single shared polling loop if not already running. Idempotent."
  []
  (when-not @background-process
    (let [f (future
              (try
                (loop []
                  (when @background-process
                    (doseq [topic-name (keys @topic.impl/*listeners*)]
                      (try
                        (let [offset (if (contains? @offsets topic-name)
                                       (get @offsets topic-name)
                                       ;; Lazily initialize offset for newly registered topics
                                       (let [o (current-max-id topic-name)]
                                         (swap! offsets assoc topic-name o)
                                         o))
                              rows (poll-messages! topic-name offset)]
                          (doseq [{:keys [id messages]} rows]
                            (when-not (topic.impl/locally-published? topic-name id)
                              (topic.impl/handle! topic-name (json/decode messages)))
                            (swap! offsets assoc topic-name id)))
                        (catch Exception e
                          (log/errorf e "Error polling topic %s" (name topic-name)))))
                    (Thread/sleep (long poll-interval-ms))
                    (recur)))
                (catch InterruptedException _
                  (log/info "Topic polling loop interrupted"))))]
      (when-not (compare-and-set! background-process nil f)
        (future-cancel f)))))

;;; ------------------------------------------- Automatic Periodic Cleanup -------------------------------------------

(def ^:private cleanup-max-age-ms
  "Messages older than this are eligible for cleanup.
  Currently 1 hour (3600000ms). Not yet configurable at runtime."
  (* 60 60 1000))

(def ^:private cleanup-interval-ms
  "How often the cleanup loop runs.
  Currently 10 minutes (600000ms). Not yet configurable at runtime."
  (* 10 60 1000))

(def ^:private cleanup-future
  "Holds the background future running the cleanup loop, or nil if not started."
  (atom nil))

(defn- cleanup-old-messages!
  "Deletes all `topic_message` rows older than [[cleanup-max-age-ms]] that are below the minimum subscriber offset."
  []
  (let [threshold  (Timestamp/from (.minusMillis (Instant/now) cleanup-max-age-ms))
        min-offset (reduce min Long/MAX_VALUE (vals @offsets))
        deleted    (if (= min-offset Long/MAX_VALUE)
                     ;; No subscribers — safe to clean everything old
                     (t2/delete! :topic_message_batch :created_at [:< threshold])
                     ;; Only clean messages below the minimum offset AND older than threshold
                     (t2/delete! :topic_message_batch
                                 {:where [:and
                                          [:< :created_at threshold]
                                          [:< :id min-offset]]}))]
    (when (pos? deleted)
      (log/infof "Cleaned up %d old topic messages" deleted))
    deleted))

;;; ------------------------------------------- Backend Multimethods -------------------------------------------

(defmethod topic.backend/shutdown! :topic.backend/appdb [_]
  (when-let [^Future f @background-process]
    (reset! background-process nil)
    (.cancel f true)
    (log/info "Topic polling loop stopped"))
  (reset! offsets {})
  (mq.impl/stop-cleanup-loop! cleanup-future "Topic"))

(defmethod topic.backend/start! :topic.backend/appdb [_]
  (start-polling!)
  (mq.impl/start-cleanup-loop-once! cleanup-future cleanup-interval-ms cleanup-old-messages! "Topic"))

(defmethod topic.backend/publish! :topic.backend/appdb
  [_ topic-name messages]
  (t2/insert-returning-pk! :topic_message_batch
                           {:topic_name (name topic-name)
                            :messages   (json/encode messages)}))

(defmethod topic.backend/subscribe! :topic.backend/appdb
  [_ topic-name]
  (let [offset (current-max-id topic-name)]
    (swap! offsets assoc topic-name offset)
    (start-polling!)
    (log/infof "Subscribed to topic %s (starting offset %d)" (name topic-name) offset)))

(defmethod topic.backend/unsubscribe! :topic.backend/appdb
  [_ topic-name]
  (swap! offsets dissoc topic-name)
  (log/infof "Unsubscribed from topic %s" (name topic-name)))

