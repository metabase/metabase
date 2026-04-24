(ns metabase.test.initialize.mq
  "Initializes the MQ subsystem for test mode: memory backends, zero publish
  buffering, and registering all `def-listener!` implementations."
  (:require
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.mq.topic.memory :as topic.memory]))

(defn init! []
  (alter-var-root #'q.backend/*backend* (constantly q.memory/backend))
  (alter-var-root #'topic.backend/*backend* (constantly topic.memory/backend))
  (alter-var-root #'publish-buffer/*publish-buffer-ms* (constantly 0))
  ;; Load driver.init so namespaces containing def-listener! calls are loaded
  ;; before register-listeners! iterates them. In production, core/init.clj loads these.
  (require 'metabase.driver.init)
  (listener/register-listeners!))
