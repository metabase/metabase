(ns metabase.mq.polling
  "Shared polling infrastructure for appdb and memory mq backends:
  time-gated execution and polling thread lifecycle."
  (:require
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent Future)))

(set! *warn-on-reflection* true)

(defn periodically!
  "Runs `f` at most once per `interval-ms`. Uses `state-atom` (an atom holding a long timestamp)
   to track the last run time. Catches and logs exceptions using `label` for context."
  [state-atom interval-ms label f]
  (let [now (System/currentTimeMillis)]
    (when (> (- now @state-atom) interval-ms)
      (reset! state-atom now)
      (try
        (f)
        (catch Exception e
          (log/error e (str "Error in " label)))))))

(defn make-poll-state
  "Creates a polling state map with an atom for the background process and a notify object."
  []
  {:process (atom nil)
   :notify  (Object.)})

(defn start-polling!
  "Starts a polling thread that calls `poll-fn` in a loop, waiting on the notify object
   for `wait-ms` between iterations. Idempotent — second call is a no-op."
  [{:keys [process notify]} label wait-ms poll-fn]
  (when-not @process
    (log/infof "Starting %s polling thread" label)
    (reset! process
            (future
              (try
                (loop []
                  (when @process
                    (try
                      (poll-fn)
                      (catch InterruptedException e (throw e))
                      (catch Exception e
                        (log/errorf e "Error in %s polling loop" label)))
                    (locking notify (.wait ^Object notify (long wait-ms)))
                    (recur)))
                (catch InterruptedException _
                  (log/infof "%s polling thread interrupted" label)))))))

(defn stop-polling!
  "Stops a polling thread."
  [{:keys [process]} label]
  (when-let [f @process]
    (reset! process nil)
    (when (instance? Future f)
      (.cancel ^Future f true))
    (log/infof "%s polling thread stopped" label)))

(defn notify!
  "Wakes the polling thread so it runs immediately."
  [{:keys [notify]}]
  (locking notify (.notifyAll ^Object notify)))
