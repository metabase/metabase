(ns metabase.queue.listener
  "Message handling and listener registration for the queue system."
  (:require
   [metabase.queue.backend :as q.backend]
   [metabase.queue.impl :as q.impl]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn handle!
  "Handles a message from the queue by invoking the registered handler.
  On success, marks the message as successful. On failure, marks it as failed
  and logs the error. The message map should contain :queue, :id, and :payload keys."
  [{:keys [queue id] :as message}]
  (let [{:keys [handler]} (queue @q.impl/defined-queues)]
    (when-not handler
      (throw (ex-info "No handler defined for queue" {:queue queue})))
    (try
      (handler message)
      (log/info "Handled queue message" {:queue queue :message-id id})
      (q.backend/message-successful! q.backend/*backend* queue id)
      (catch Exception e
        (log/error e "Error handling queue message" {:queue queue :message-id id})
        (q.backend/message-failed! q.backend/*backend* queue id)))))

(defn listen!
  "Registers a handler function for the given queue and starts listening.
  The handler will be called with a message map containing :queue, :id, and :payload keys.
  Throws if the queue is not defined or if a handler is already registered."
  [queue-name handler]
  (q.impl/check-valid-queue queue-name)
  (when-not (nil? (get-in @q.impl/defined-queues [queue-name :handler]))
    (throw (ex-info "Queue handler already defined" {:queue queue-name})))
  (swap! q.impl/defined-queues update queue-name assoc :handler handler)
  (q.backend/listen! q.backend/*backend* queue-name))
