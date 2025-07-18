(ns metabase.queue.listener
  (:require [metabase.queue.backend :as q.backend]
            [metabase.queue.impl :as q.impl]
            [metabase.util.log :as log]))

(defn handle! [& {:keys [queue] :as message}]
  (let [{:keys [handler]} (queue @q.impl/defined-queues)]
    (when-not handler
      (throw (ex-info "No handler defined for queue" {:queue queue})))
    (apply handler message)))

(defn listen!
  [queue-name handler]
  (q.impl/check-valid-queue queue-name)
  (when-not (nil? (get-in @q.impl/defined-queues [queue-name :handler]))
    (throw (ex-info "Queue handler already defined" {:queue queue-name})))
  (swap! q.impl/defined-queues update queue-name assoc :handler handler)
  (q.backend/listen! q.backend/*backend* queue-name))
