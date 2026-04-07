(ns metabase.mq.test-util
  (:require
   [metabase.mq.init :as mq.init]
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.sync]
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
    `(binding [listener/*listeners*              (atom {})
               publish-buffer/*publish-buffer*    (atom {})
               publish-buffer/*publish-buffer-ms* 0]
       (let [handle# (mq.init/start! :queue.backend/sync :topic.backend/sync)]
         (try
           ;; Merge any explicitly-provided listeners on top
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
           ~@body
           (finally
             (mq.init/stop! handle#)))))))
