(ns metabase.mq.topic.test-util
  (:require
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.impl :as topic.impl]
   [metabase.mq.topic.sync]))

(defmacro with-sync-topics
  "Binds the topic system to the synchronous backend, which invokes listeners
   inline during `publish!`. Optionally accepts an overrides map to replace
   existing listener fns by topic name."
  [& body]
  (let [[overrides & body] (if (map? (first body))
                             body
                             (cons {} body))]
    `(let [current#   @topic.impl/*listeners*
           overrides# ~overrides
           unknown#   (remove (set (keys current#)) (keys overrides#))]
       (when (seq unknown#)
         (throw (ex-info "Cannot override listeners that are not already registered"
                         {:unknown (vec unknown#)
                          :registered (vec (keys current#))})))
       (let [merged# (reduce-kv (fn [m# k# v#]
                                  (assoc m# k# v#))
                                current#
                                overrides#)]
         (binding [topic.backend/*backend*  :topic.backend/sync
                   topic.impl/*listeners* (atom merged#)]
           ~@body)))))
