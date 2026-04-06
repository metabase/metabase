(ns metabase.mq.topic.appdb
  "Database-backed implementation of the pub/sub system using the application database.
  Messages are stored in the `topic_message_batch` table. Each subscriber on each node polls
  independently, tracking its read offset in memory."
  (:require
   [metabase.mq.analytics :as mq.analytics]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.listener :as listener]
   [metabase.mq.polling :as mq.polling]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (java.sql Timestamp)
           (java.time Instant)))

(set! *warn-on-reflection* true)

(def ^:private state
  {::offsets           (atom {})
   ::poll-state        (mq.polling/make-poll-state)
   ::batch-size        100
   ::last-cleanup-ms   (atom 0)
   ::last-lag-gauge-ms (atom 0)})

(defn- current-max-id
  "Returns the current maximum id in topic_message_batch for the given topic, or 0."
  [topic-name]
  (or (t2/select-one-fn :max-id [:topic_message_batch [[:max :id] :max-id]]
                        :topic_name (name topic-name))
      0))

(defn- poll-messages!
  "Fetches rows from topic_message_batch with id > offset."
  [topic-name offset]
  (t2/query {:select   [:id :messages]
             :from     [:topic_message_batch]
             :where    [:and
                        [:= :topic_name (name topic-name)]
                        [:> :id offset]]
             :order-by [[:id :asc]]
             :limit    (::batch-size state)}))

;;; ------------------------------------------- Periodic tasks (run on polling thread) -------------------------------------------

;; Cleanup old messages

(defn- cleanup-old-messages! []
  (let [threshold (Timestamp/from (.minusMillis (Instant/now) (* 60 60 1000)))
        deleted   (t2/delete! :topic_message_batch :created_at [:< threshold])]
    (when (pos? deleted)
      (log/infof "Cleaned up %d old topic messages" deleted)
      (mq.analytics/inc! :metabase-mq/appdb-cleanup-deleted {:transport "topic" :channel "all"} deleted))))

(defn- update-lag-gauges! []
  (doseq [[topic-name offset] @(::offsets state)]
    (let [max-id (current-max-id topic-name)]
      (mq.analytics/set! :metabase-mq/appdb-topic-subscriber-lag
                         {:channel (name topic-name)}
                         (- max-id offset)))))

(defn- poll-iteration!
  "One iteration of the polling loop: run periodic tasks, then poll all topics.
  Returns true if any topic had messages delivered."
  []
  (mq.polling/periodically! (::last-cleanup-ms state) (* 10 60 1000) "topic cleanup" cleanup-old-messages!)
  (mq.polling/periodically! (::last-lag-gauge-ms state) (* 30 1000) "topic lag gauge" update-lag-gauges!)
  (let [found-work? (atom false)]
    (doseq [topic-name (remove mq.impl/channel-busy? (listener/topic-names))]
      (let [offset (if (contains? @(::offsets state) topic-name)
                     (get @(::offsets state) topic-name)
                     (let [o (current-max-id topic-name)]
                       (swap! (::offsets state) assoc topic-name o)
                       o))
            rows   (poll-messages! topic-name offset)]
        (when (seq rows)
          (let [all-messages (into [] (mapcat (comp json/decode :messages)) rows)
                max-id       (:id (last rows))]
            (when (mq.impl/submit-delivery! topic-name all-messages nil nil nil)
              (swap! (::offsets state) assoc topic-name max-id)
              (reset! found-work? true))))))
    @found-work?))

(defmethod topic.backend/start! :topic.backend/appdb [_]
  (mq.polling/start-polling! (::poll-state state) "Topic" 2000 poll-iteration!))

(defmethod topic.backend/shutdown! :topic.backend/appdb [_]
  (mq.polling/stop-polling! (::poll-state state) "Topic")
  (reset! (::offsets state) {}))

(defmethod topic.backend/publish! :topic.backend/appdb
  [_ topic-name messages]
  (t2/insert-returning-pk! :topic_message_batch
                           {:topic_name (name topic-name)
                            :messages   (json/encode messages)})
  (when-not (mq.impl/channel-busy? topic-name)
    (mq.polling/notify! (::poll-state state))))

(defmethod topic.backend/subscribe! :topic.backend/appdb
  [_ topic-name]
  (let [offset (current-max-id topic-name)]
    (swap! (::offsets state) assoc topic-name offset)
    (log/infof "Subscribed to topic %s (starting offset %d)" (name topic-name) offset)))

(defmethod topic.backend/unsubscribe! :topic.backend/appdb
  [_ topic-name]
  (swap! (::offsets state) dissoc topic-name)
  (log/infof "Unsubscribed from topic %s" (name topic-name)))
