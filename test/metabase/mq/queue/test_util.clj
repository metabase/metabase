(ns metabase.mq.queue.test-util
  (:require
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.sync]))

(defmacro with-sync-queue
  "Binds the queue system to the synchronous backend, which invokes listeners
   inline during `publish!`. Optionally accepts an overrides map to replace
   existing listener fns by queue name. Override values can be plain fns (which
   replace the :listener in the existing config) or full config maps.
   Throws if an override key doesn't match an already-registered listener."
  [& body]
  (let [[overrides & body] (if (map? (first body))
                             body
                             (cons {} body))]
    `(let [current#   @q.impl/*listeners*
           overrides# ~overrides
           unknown#   (remove (set (keys current#)) (keys overrides#))]
       (when (seq unknown#)
         (throw (ex-info "Cannot override listeners that are not already registered"
                         {:unknown (vec unknown#)
                          :registered (vec (keys current#))})))
       (let [merged# (reduce-kv (fn [m# k# v#]
                                  (assoc m# k# (if (fn? v#)
                                                 (assoc (get current# k#) :listener v#)
                                                 v#)))
                                current#
                                overrides#)]
         (binding [q.backend/*backend*       :queue.backend/sync
                   q.impl/*listeners*     (atom merged#)
                   q.impl/*accumulators*  (atom {})]
           ~@body)))))
