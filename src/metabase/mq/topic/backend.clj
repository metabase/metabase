(ns metabase.mq.topic.backend
  "Backend abstraction layer for the pub/sub system.
  Defines multimethods that different pub/sub implementations must provide.

  Topics are fire-and-forget: there is no retry logic. If a handler throws,
  the error is logged and the batch is skipped. This matches the semantics of
  the postgres LISTEN/NOTIFY backend where re-delivery is not possible."
  (:require
   [metabase.analytics.prometheus :as analytics]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::backend
  [:enum :topic.backend/appdb :topic.backend/memory :topic.backend/postgres])

(mr/def :metabase.mq.topic/topic-name
  [:and :keyword [:fn {:error/message "Topic name must be namespaced to 'topic'"}
                  #(= "topic" (namespace %))]])

(def ^:dynamic *backend*
  "Dynamic var specifying which pub/sub backend to use.
  Default is `:topic.backend/appdb` for production database-backed pub/sub.
  Can be bound to `:topic.backend/memory` for testing."
  :topic.backend/appdb)

(def ^:dynamic *handlers*
  "Atom containing a map of topic-name -> handler-fn."
  (atom {}))

(defmulti publish!
  "Publishes messages to the given topic. `messages` is a vector of values that will be JSON-encoded
  as an array and stored in a single row for batch efficiency."
  {:arglists '([backend topic-name messages])}
  (fn [backend _topic-name _messages]
    backend))

(defmulti subscribe!
  "Starts a polling loop for the given topic. Handlers are retrieved from `*handlers*`
  and dispatched via [[handle!]]. Returns nil."
  {:arglists '([backend topic-name])}
  (fn [backend _topic-name]
    backend))

(defmulti unsubscribe!
  "Stops the polling loop for the given topic."
  {:arglists '([backend topic-name])}
  (fn [backend _topic-name]
    backend))

(defmulti shutdown!
  "Shuts down all topic resources for this backend: unsubscribes all subscribers and releases any background threads."
  {:arglists '([backend])}
  identity)

(defmethod shutdown! :default [_] nil)

(mu/defn handle!
  "Handles a batch of messages from a topic by invoking the registered handler.
  On error, logs and continues."
  [backend :- ::backend
   topic-name :- :metabase.mq.topic/topic-name
   batch-id
   messages :- [:sequential :any]]
  (let [handler (get @*handlers* topic-name)
        start   (System/nanoTime)]
    (try
      (when-not handler
        (throw (ex-info "No handler defined for topic" {:topic topic-name :backend backend})))
      (doseq [message messages]
        (handler {:batch-id batch-id :topic topic-name :message message}))
      (analytics/inc! :metabase-mq/topic-batches-handled {:topic (name topic-name) :status "success"})
      (catch Exception e
        (log/error e "Error handling topic message" {:topic topic-name :batch-id batch-id :backend backend})
        (analytics/inc! :metabase-mq/topic-batches-handled {:topic (name topic-name) :status "error"}))
      (finally
        (analytics/observe! :metabase-mq/topic-handle-duration-ms
                            {:topic (name topic-name)}
                            (/ (double (- (System/nanoTime) start)) 1e6))))))
