(ns metabase.mq.test-util
  (:require
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.sync]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.sync]))

(defmacro with-sync-mq
  "Binds both queue and topic systems to their synchronous backends, which
   invoke listeners inline during `publish!`. Optionally accepts a queue
   listeners map keyed by queue name. Values can be plain fns (wrapped in
   standard listener config) or full config maps with :listener and :max-batch-messages.
   Listeners in the map are merged with any already-registered
   listeners; for existing keys a plain fn replaces only the :listener entry."
  [& body]
  (let [[listeners & body] (if (map? (first body))
                             body
                             (cons {} body))]
    `(binding [q.backend/*backend*              :queue.backend/sync
               publish-buffer/*publish-buffer*    (atom {})
               publish-buffer/*publish-buffer-ms* 0
               topic.backend/*backend*            :topic.backend/sync]
       ;; Merge any explicitly-provided listeners on top of the already-registered listeners.
       ;; Don't rebind *listeners* to a fresh atom — listeners are eagerly registered at
       ;; def-listener! time into the root atom and must remain visible to all threads.
       (let [listeners# ~listeners]
         (when (seq listeners#)
           (swap! listener/*listeners*
                  (fn [current#]
                    (reduce-kv (fn [m# k# v#]
                                 (assoc m# k# (if (fn? v#)
                                                (if-let [existing# (get current# k#)]
                                                  (assoc existing# :listener v#)
                                                  {:listener           v#
                                                   :max-batch-messages 1})
                                                v#)))
                               current#
                               listeners#)))))
       ~@body)))
