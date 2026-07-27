(ns metabase.test.initialize.mq
  "Initializes the MQ subsystem for test mode: memory backends, zero publish
  buffering, and registering all `def-listener!` implementations."
  (:require
   [metabase.mq.init :as mq.init]
   [metabase.mq.publish-buffer :as publish-buffer]))

(defn init! []
  (alter-var-root #'publish-buffer/*publish-buffer-ms* (constantly 0))
  ;; Load driver.init so namespaces containing def-listener! calls are loaded
  ;; before register-listeners! (called inside mq.init/start!) iterates them.
  ;; In production, core/init.clj loads these.
  (require 'metabase.driver.init)
  ;; Drive through mq.init/start! so the worker pool, publish-buffer flush thread,
  ;; and the memory backend's polling loop all come up — otherwise MQ-driven behaviour
  ;; outside `with-test-mq` would silently drop messages onto a non-polling queue.
  (mq.init/start! :queue.backend/memory))
