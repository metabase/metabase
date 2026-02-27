(ns metabase.mq.topic.test-util
  (:require
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.sync]))

(defmacro with-sync-topics
  "Binds the topic system to the synchronous backend, which invokes handlers
   inline during `publish!`. Optionally accepts an overrides map to replace
   existing handler fns by topic name."
  [& body]
  (let [[overrides & body] (if (map? (first body))
                             body
                             (cons {} body))]
    `(let [current#   @topic.backend/*handlers*
           overrides# ~overrides
           unknown#   (remove (set (keys current#)) (keys overrides#))]
       (when (seq unknown#)
         (throw (ex-info "Cannot override handlers that are not already registered"
                         {:unknown (vec unknown#)
                          :registered (vec (keys current#))})))
       (let [merged# (reduce-kv (fn [m# k# v#]
                                  (assoc m# k# v#))
                                current#
                                overrides#)]
         (binding [topic.backend/*backend*  :topic.backend/sync
                   topic.backend/*handlers* (atom merged#)]
           ~@body)))))
