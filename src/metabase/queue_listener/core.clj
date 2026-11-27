(ns metabase.queue-listener.core
  "Queue listeners: (possibly) multithreaded workers that process messages off a queue in batches.
  Listeners are usually started by an [[init-listener!]] method, which calls [[listen!]].
  [[start-listeners!]] and [[stop-listeners!]] start and stop them all, through the global system."
  (:require
   [com.climate.claypoole :as cp]
   [metabase.global-system.system :as global-system]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.queue :as queue])
  (:import
   (java.util.concurrent
    BlockingQueue
    ExecutorService
    ScheduledExecutorService
    TimeUnit)))

(set! *warn-on-reflection* true)

(mr/def ::listener-options
  [:map {:closed true}
   [:success-handler    {:optional true} fn?]
   [:err-handler        {:optional true} fn?]
   [:pool-size          {:optional true} number?]
   [:max-batch-messages {:optional true} number?]
   [:max-next-ms        {:optional true} number?]])

(defonce
  ^:private
  ^{:malli/schema [:map-of :string (ms/InstanceOfClass ScheduledExecutorService)]}
  listeners (atom {}))

(defn listener-exists?
  "Returns true if there is a running listener with the given name"
  [listener-name]
  (when-let [^ExecutorService executor (get @listeners listener-name)]
    (not (.isTerminated executor))))

(mu/defn- listener-thread [listener-name :- :string
                           queue :- (ms/InstanceOfClass BlockingQueue)
                           handler :- fn?
                           {:keys [success-handler err-handler max-batch-messages max-next-ms]} :- ::listener-options]
  (log/debugf "Thread for listener %s started" listener-name)
  (while true
    (try
      (log/debugf "Listener %s waiting for next batch..." listener-name)
      (let [batch (queue/take-batch! queue Long/MAX_VALUE max-batch-messages max-next-ms)]
        (if (seq batch)
          (do
            (log/debugf "Listener %s processing batch of %d" listener-name (count batch))
            (let [timer (u/start-timer)
                  output (handler batch)
                  duration (u/since-ms timer)]
              (log/debugf "Listener %s processed batch in %.0fms" listener-name duration)
              (success-handler output duration listener-name)))
          (log/debugf "Listener %s found no items to process" listener-name)))
      (catch InterruptedException e
        (log/debugf "Listener thread %s stopped" listener-name)
        (throw e))
      (catch Exception e
        (err-handler e listener-name)
        (log/errorf "Error in %s while processing batch: %s" listener-name (ex-message e))))))

(def ^:private ^:const max-restart-backoff-ms 30000)
(def ^:private ^:const initial-restart-backoff-ms 500)

(defn- listener-thread-with-restart
  "Wraps `listener-thread` in a restart loop with exponential backoff.
  If `listener-thread` exits unexpectedly (e.g. because the inner catch block itself throws),
  this will restart it as long as the executor has not been shut down."
  [listener-name queue handler options]
  (loop [backoff-ms initial-restart-backoff-ms]
    (try
      (listener-thread listener-name queue handler options)
      (catch InterruptedException _e
        (log/debugf "Listener thread %s stopped" listener-name)
        (throw (InterruptedException.)))
      (catch Throwable e
        (log/errorf "Listener thread %s crashed, restarting in %dms: %s" listener-name backoff-ms (ex-message e))))
    (Thread/sleep ^long backoff-ms)
    (when-not (.isShutdown ^ExecutorService (get @listeners listener-name))
      (recur (min max-restart-backoff-ms (* 2 backoff-ms))))))

(mu/defn listen!
  "Starts an async listener on the given queue.
  This should generally be called from [[init-listener!]] in a task namespace.

  Arguments:
  - listener-name: A unique string. Calls to register another listener with the same name will be a no-op
  - queue: The queue to listen on
  - handler: A function taking a list of 1 or more values that have been sent to the queue.

  Options:
  - success-handler: A function called when handler does not throw an exception.
    Accepts [result-of-handler, duration-in-ms, listener-name]
  - err-handler: A function called when the handler throws an exception. Accepts [exception, listener-name]
  - pool-size: Number of threads in the listener. Default: 1
  - max-batch-messages: Max number of items to batch up before calling handler. Default 50
  - max-next-ms: Max number of ms to wait for each additional message before calling the handler. Default 100"
  [listener-name :- :string
   queue :- (ms/InstanceOfClass BlockingQueue)
   handler :- fn?
   {:keys [success-handler
           err-handler
           pool-size
           max-batch-messages
           max-next-ms]
    :or   {success-handler    (constantly nil)
           err-handler        (constantly nil)
           pool-size          1
           max-batch-messages 50
           max-next-ms        100}} :- ::listener-options]
  (if (listener-exists? listener-name)
    (log/errorf "Listener %s already exists" listener-name)
    (let [executor (cp/threadpool pool-size {:name (str "queue-" listener-name)})]
      (log/infof "Starting listener %s with %d threads %s"
                 (u/format-color 'green listener-name) pool-size (u/emoji "\uD83C\uDFA7"))
      (dotimes [_ pool-size]
        (cp/future executor (listener-thread-with-restart listener-name queue handler
                                                          {:success-handler    success-handler
                                                           :err-handler        err-handler
                                                           :max-batch-messages max-batch-messages
                                                           :max-next-ms        max-next-ms})))
      (swap! listeners assoc listener-name executor))))

(mu/defn stop-listening!
  "Stops the listener previously started with [[listen!]].
  If there is no running listener with the given name, it is a no-op"
  [listener-name :- :string]
  (if-let [^ExecutorService executor (get @listeners listener-name)]
    (do
      (log/infof "Stopping listener %s..." listener-name)
      (cp/shutdown! executor)
      ;; wait up to 10 seconds for executor to stop, largely so tests such as listener-handler-test see it gone
      (.awaitTermination executor 10 TimeUnit/SECONDS)
      (swap! listeners dissoc listener-name)
      (log/infof "Stopping listener %s...done" listener-name))
    (log/infof "No running listener named %s" listener-name)))

(defmulti init-listener!
  "Initialize a listener with a given name. All implementations of this method are called once and only
  once when the server is starting up. Task namespaces (`metabase.*.task`) should add new
  implementations of this method to start new listeners they define (i.e., with a call to [[listen!]].)

  The dispatch value for this function can be any unique keyword, but by convention is a namespaced keyword version of
  the name of the listener being initialized; for sake of consistency with the listener name itself, the keyword should
  be left CamelCased.

    (defmethod queue-listener/init-listener! ::ExampleListener [_]
      (queue-listener/listen! \"example-listener\" queue handler)"
  {:arglists '([job-name-string])}
  keyword)

(defn- stop-all-listening! []
  (doseq [listener-name (keys @listeners)]
    (stop-listening! listener-name)))

;; Every listener as one global-system component, so halting the system stops them too.
(def ^:private listeners-component
  (global-system/mutable-component-handle ::listeners (constantly nil)))

(defn- init-listeners! []
  (doseq [[k f] (methods init-listener!)]
    (try
      (f k)
      (catch Throwable e
        (log/errorf "Error initializing listener %s: %s" k (ex-message e))))))

(defn start-listeners!
  "Call every implementation of [[init-listener!]], unless they were already started.
  Throws if they are not running and the global system has halted, until [[global-system/reopen!]]."
  []
  (global-system/start! listeners-component
                        (fn []
                          (init-listeners!)
                          listeners)
                        (fn [_] (stop-all-listening!)))
  nil)

(defn stop-listeners!
  "Stop every running listener, including those started outside [[start-listeners!]]."
  []
  (when-not (global-system/stop! listeners-component)
    (stop-all-listening!)))
