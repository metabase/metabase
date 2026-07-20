(ns metabase.mq.init
  "Initializes the mq subsystem at startup."
  (:require
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.queue.polling :as q.polling]
   [metabase.mq.queue.quartz :as q.quartz]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.settings :as mq.settings]
   [metabase.mq.task.outbox]
   [metabase.mq.task.queue-reaper]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]))

(def ^:private queue-backends
  {q.quartz/backend-id q.quartz/backend
   q.memory/backend-id q.memory/backend})

(def ^:private valid-queue-backends (set (keys queue-backends)))

(defn- resolve-backend [label table kw-or-instance]
  (if (keyword? kw-or-instance)
    (or (get table kw-or-instance)
        (throw (ex-info (str "Unknown " label " backend: " kw-or-instance)
                        {:backend kw-or-instance :valid (set (keys table))})))
    kw-or-instance))

(defn start!
  "Initializes the MQ subsystem with the given backend. Returns a handle that must be
   passed to [[stop!]] to shut down and restore the previous backend state.

   `queue-be` may be either a keyword identifier (e.g. `:queue.backend/memory`)
   or a concrete backend instance.

   Called by [[startup/def-startup-logic!]] with production backends (handle discarded;
   production shutdown uses [[startup/def-shutdown-logic!]] instead) and by
   `metabase.mq.test-util/with-test-mq` with isolated memory backends.

   Backends are set globally via `alter-var-root`. For test isolation, bind
   `listener/*listeners*` and `publish-buffer/*publish-buffer*` with fresh atoms.

   The returned handle records whether THIS call started the global worker pool and
   publish-buffer flush executor (`:owns-worker-pool?`, `:owns-buffer-flush?`). The
   matching [[stop!]] only shuts those down if this call started them — so a test
   fixture running against an already-live server can no-op the global teardown."
  [queue-be]
  (let [queue-instance     (resolve-backend "queue" queue-backends queue-be)
        prev-queue-be      q.backend/*backend*]
    (alter-var-root #'q.backend/*backend* (constantly queue-instance))
    (log/infof "Queue backend: %s" queue-be)
    (q.registry/register-queues!)
    (listener/register-listeners!)
    (let [owns-buffer-flush? (publish-buffer/start-publish-buffer-flush!)
          owns-worker-pool?  (q.polling/start-worker-pool!)]
      (q.backend/start! queue-instance)
      {:prev-queue-be      prev-queue-be
       :queue-be           queue-instance
       :owns-buffer-flush? owns-buffer-flush?
       :owns-worker-pool?  owns-worker-pool?})))

(defn stop!
  "Shuts down the MQ subsystem.

   Called with no arguments (production): shuts down all services using the current backend vars.

   Called with a handle (the map returned by [[start!]]): additionally restores the previous
   backend state and only shuts down globals (worker pool, publish-buffer flush) if this call
   owned them. Used by `metabase.mq.test-util/with-test-mq` for test isolation — a test
   that borrows an already-running server's globals leaves them alone on teardown."
  ([]
   (publish-buffer/stop-publish-buffer-flush!)
   (when-let [qb q.backend/*backend*] (q.backend/shutdown! qb))
   (q.polling/shutdown-worker-pool!)
   (reset! listener/*listeners* {}))
  ([{:keys [prev-queue-be queue-be
            owns-buffer-flush? owns-worker-pool?]}]
   ;; Always force-drain the (currently bound) publish buffer so test fixtures that bound a
   ;; fresh `*publish-buffer*` don't lose buffered messages when their teardown runs without
   ;; owning the global flush executor. The executor itself is only shut down if THIS call
   ;; started it.
   (publish-buffer/flush-publish-buffer! true)
   (when owns-buffer-flush? (publish-buffer/stop-publish-buffer-flush!))
   (when queue-be (q.backend/shutdown! queue-be))
   (when owns-worker-pool? (q.polling/shutdown-worker-pool!))
   (reset! listener/*listeners* {})
   (alter-var-root #'q.backend/*backend* (constantly prev-queue-be))))

(defn- resolve-queue-be []
  (let [queue-be (keyword "queue.backend" (mq.settings/queue-backend))]
    (when-not (contains? valid-queue-backends queue-be)
      (throw (ex-info (str "Invalid queue backend: " queue-be
                           ". Valid backends: " valid-queue-backends)
                      {:backend queue-be :valid valid-queue-backends})))
    queue-be))

(defmethod startup/def-startup-logic! ::MqStart [_]
  (start! (resolve-queue-be)))

;; Run after all other startup logic so listener registration, transports, and polling threads
;; only come up once the rest of the system is ready.
(defmethod startup/startup-priority ::MqStart [_] Long/MAX_VALUE)

(defmethod startup/def-shutdown-logic! ::MqShutdown [_]
  (stop!))
