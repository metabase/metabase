(ns metabase.test.initialize.mq
  "Initializes the MQ subsystem for test mode: sync backends, no buffering, register listeners."
  (:require
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.sync :as q.sync]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.sync :as topic.sync]))

(defn init! []
  (alter-var-root #'q.backend/*backend* (constantly q.sync/backend))
  (alter-var-root #'topic.backend/*backend* (constantly topic.sync/backend))
  (alter-var-root #'publish-buffer/*publish-buffer-ms* (constantly 0))
  ;; Load driver.init so namespaces containing def-listener! calls are loaded
  ;; before register-listeners! iterates them. In production, core/init.clj loads these.
  (require 'metabase.driver.init)
  (listener/register-listeners!))
