(ns metabase.mq.topic.impl
  "Internal implementation for the pub/sub system"
  (:require
   [metabase.analytics.prometheus :as analytics]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

;; log is used by the with-topic macro expansion
(comment log/keep-me)

(set! *warn-on-reflection* true)

(defonce ^:private started? (atom false))

(mu/defn handle!
  "Handles a batch of messages from a topic by invoking the registered handler.
  On error, logs and continues."
  [topic-name :- :metabase.mq.topic/topic-name
   messages :- [:sequential :any]]
  (mq.impl/invoke-handler!
   {:channel-name    topic-name
    :handler-fn      #(get @topic.backend/*handlers* topic-name)
    :invoke-fn       (fn [handler]
                       (doseq [message messages]
                         (handler message)))
    :on-success      nil
    :on-error        nil}))

(defn publish!
  "Publishes messages to the given topic. All active subscribers will receive them.
  `messages` is a vector of values stored as a JSON array in a single row."
  [topic-name messages]
  (topic.backend/publish! topic.backend/*backend* topic-name messages)
  (analytics/inc! :metabase-mq/topic-messages-published
                  {:topic (name topic-name)}
                  (count messages)))

(defn- make-instrumented-handler
  "Wraps a handler with Prometheus metrics instrumentation."
  [topic-name handler]
  (fn [msg]
    (try
      (handler msg)
      (analytics/inc! :metabase-mq/topic-messages-received
                      {:topic (name topic-name)})
      (catch Exception e
        (analytics/inc! :metabase-mq/topic-handler-errors
                        {:topic (name topic-name)})
        (throw e)))))

(defn subscribe!
  "Subscribes to a topic with the given handler function.
  The handler receives the message directly.
  Only one handler per topic is supported — calling subscribe! on an already-subscribed topic throws."
  [topic-name handler]
  (when (get @topic.backend/*handlers* topic-name)
    (throw (ex-info "Handler already registered for topic"
                    {:topic topic-name})))
  (let [instrumented (make-instrumented-handler topic-name handler)]
    (swap! topic.backend/*handlers* assoc topic-name instrumented)
    (when @started?
      (topic.backend/subscribe! topic.backend/*backend* topic-name))))

(defn start!
  "Starts backend polling loops for all currently registered topic handlers.
  Call this after the backend has been set."
  []
  (doseq [topic-name (keys @topic.backend/*handlers*)]
    (topic.backend/subscribe! topic.backend/*backend* topic-name))
  (reset! started? true))

(defn unsubscribe!
  "Unsubscribes from a topic, removing its handler and stopping the backend polling loop."
  [topic-name]
  (swap! topic.backend/*handlers* dissoc topic-name)
  (topic.backend/unsubscribe! topic.backend/*backend* topic-name))

(defmacro with-topic
  "Runs the body with the ability to add messages to the given topic.
  Messages are buffered and only published if the body completes successfully.
  If an exception occurs, no messages are published and the exception is rethrown.
  Publishing is best-effort and not transactional — if the body succeeds but
  `publish!` throws, the body's side effects will have already occurred."
  [topic-name [buffer-binding] & body]
  `(let [buffer# (atom [])
         ~buffer-binding (reify mq.impl/MessageBuffer
                           (put [_ msg#] (swap! buffer# conj msg#)))]
     (try
       (let [result# (do ~@body)]
         (let [msgs# @buffer#]
           (when (seq msgs#)
             (topic.backend/publish! topic.backend/*backend* ~topic-name msgs#)))
         result#)
       (catch Exception e#
         (log/error e# "Error in topic processing, no messages will be published to the topic")
         (throw e#)))))
