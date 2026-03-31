(ns metabase.test.initialize.mq
  "Initializes the MQ subsystem for test mode: sync backends, no buffering, register listeners."
  (:require
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.topic.backend :as topic.backend]))

(defn init! []
  (alter-var-root #'q.backend/*backend* (constantly :queue.backend/sync))
  (alter-var-root #'topic.backend/*backend* (constantly :topic.backend/sync))
  (alter-var-root #'publish-buffer/*publish-buffer-ms* (constantly 0))
  ;; Load driver.init so namespaces containing def-listener! calls are loaded
  ;; before register-listeners! iterates them. In production, core/init.clj loads these.
  (require 'metabase.driver.init)
  (listener/register-listeners!))
