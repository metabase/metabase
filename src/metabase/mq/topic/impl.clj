(ns metabase.mq.topic.impl
  "Internal implementation for the pub/sub system"
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

;; log is used by the with-topic macro expansion
(comment log/keep-me)

(set! *warn-on-reflection* true)

(mr/def :metabase.mq.topic/topic-name
  [:and :keyword [:fn {:error/message "Topic name must be namespaced to 'topic'"}
                  #(= "topic" (namespace %))]])

(def ^:dynamic *listeners*
  "Atom containing a map of topic-name -> listener-fn."
  (atom {}))

(mu/defn handle!
  "Handles a batch of messages from a topic by invoking the registered listener.
  On error, logs and continues."
  [topic-name :- :metabase.mq.topic/topic-name
   messages :- [:sequential :any]]
  (mq.impl/invoke-listener!
   {:channel-name    topic-name
    :listener-fn     #(get @*listeners* topic-name)
    :invoke-fn       (fn [listener]
                       (doseq [message messages]
                         (try
                           (listener message)
                           (catch Exception e
                             (log/errorf e "Error handling topic message for %s, skipping" (name topic-name))))))
    :on-success      nil
    :on-error        nil}))

(defn- publish!
  "Publishes messages to the given topic. All active subscribers will receive them.
  `messages` is a vector of values stored as a JSON array in a single row."
  [topic-name messages]
  (topic.backend/publish! topic.backend/*backend* topic-name messages)
  (mq.impl/analytics-inc! :metabase-mq/topic-messages-published
                          {:topic (name topic-name)}
                          (count messages)))

(defn- make-instrumented-listener
  "Wraps a listener with Prometheus metrics instrumentation."
  [topic-name listener]
  (fn [msg]
    (try
      (listener msg)
      (mq.impl/analytics-inc! :metabase-mq/topic-messages-received
                              {:topic (name topic-name)})
      (catch Exception e
        (mq.impl/analytics-inc! :metabase-mq/topic-handler-errors
                                {:topic (name topic-name)})
        (throw e)))))

(defn- register-listener!
  "Atomically registers a listener for the given topic, throwing if one already exists."
  [topic-name listener]
  (let [already-registered? (atom false)]
    (swap! *listeners*
           (fn [m]
             (if (contains? m topic-name)
               (do (reset! already-registered? true) m)
               (assoc m topic-name listener))))
    (when @already-registered?
      (throw (ex-info "Listener already registered for topic"
                      {:topic topic-name})))))

(defmethod mq.impl/listen! "topic"
  [topic-name listener]
  (let [instrumented (make-instrumented-listener topic-name listener)]
    (register-listener! topic-name instrumented)
    (topic.backend/subscribe! topic.backend/*backend* topic-name)))

(defn start!
  "Starts the backend polling loop. Call this after the backend has been set.
  The backend dynamically discovers topics from `*listeners*`."
  []
  (topic.backend/start! topic.backend/*backend*))

(defmethod mq.impl/unlisten! "topic"
  [topic-name]
  (swap! *listeners* dissoc topic-name))

(defmacro with-topic
  "Runs the body with the ability to add messages to the given topic.
  Messages are buffered and only published if the body completes successfully.
  If an exception occurs, no messages are published and the exception is rethrown.
  Publishing is best-effort and not transactional — if the body succeeds but
  `publish!` throws, the body's side effects will have already occurred."
  [topic-name [buffer-binding] & body]
  `(mq.impl/with-buffer
     (fn [msgs#]
       (#'publish! ~topic-name msgs#))
     "Error in topic processing, no messages will be published to the topic"
     [~buffer-binding]
     ~@body))
