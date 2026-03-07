(ns metabase.mq.test-util
  (:require
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.sync :as q.sync]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.mq.topic.sync]))

(defmacro with-sync-mq
  "Binds both queue and topic systems to their synchronous backends, which
   invoke listeners inline during `publish!`. Optionally accepts a queue
   listeners map keyed by queue name. Values can be plain fns (wrapped in
   standard listener config) or full config maps with :listener, :max-batch-messages,
   and :max-next-ms. Listeners in the map are merged with any already-registered
   listeners; for existing keys a plain fn replaces only the :listener entry."
  [& body]
  (let [[listeners & body] (if (map? (first body))
                             body
                             (cons {} body))]
    `(binding [q.backend/*backend*      :queue.backend/sync
               q.impl/*listeners*       (atom {})
               q.impl/*accumulators*    (atom {})
               q.sync/*undelivered*     (atom {})
               topic.backend/*backend*  :topic.backend/sync
               topic.impl/*listeners*   (atom {})]
       ;; Register all listen!/batch-listen! implementations into the fresh test atoms
       (mq.impl/register-listeners!)
       ;; Merge any explicitly-provided listeners on top
       (let [listeners# ~listeners]
         (when (seq listeners#)
           (swap! q.impl/*listeners*
                  (fn [current#]
                    (reduce-kv (fn [m# k# v#]
                                 (assoc m# k# (if (fn? v#)
                                                (if-let [existing# (get current# k#)]
                                                  (assoc existing# :listener v#)
                                                  {:listener           v#
                                                   :max-batch-messages 1
                                                   :max-next-ms        0})
                                                v#)))
                               current#
                               listeners#)))))
       ~@body)))
