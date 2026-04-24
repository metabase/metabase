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

(def ^:private active-poll-states
  "Set of poll states that currently have a running polling thread."
  (atom #{}))

(defn make-poll-state
  "Creates a polling state map with an atom for the background process and a notify object."
  []
  {:process  (atom nil)
   :running? (atom false)
   :notify   (Object.)})

(defn start-polling!
  "Starts a polling thread that calls `poll-fn` in a loop, waiting on the notify object
   for `wait-ms` between iterations. If `poll-fn` returns a truthy value (indicating work
   was found), the next iteration runs immediately without waiting. Idempotent — second
   call is a no-op."
  [{:keys [process running? notify] :as poll-state} label wait-ms poll-fn]
  (when (compare-and-set! running? false true)
    (log/infof "Starting %s polling thread" label)
    (swap! active-poll-states conj poll-state)
    (reset! process
            (future
              (try
                (loop []
                  (when @running?
                    (let [found-work? (try
                                        (poll-fn)
                                        (catch InterruptedException e (throw e))
                                        (catch Exception e
                                          (log/errorf e "Error in %s polling loop" label)
                                          false))]
                      (when-not found-work?
                        (locking notify (.wait ^Object notify (long wait-ms)))))
                    (recur)))
                (catch InterruptedException _
                  (log/infof "%s polling thread interrupted" label)))))))

(defn stop-polling!
  "Stops a polling thread."
  [{:keys [process running?] :as poll-state} label]
  (swap! active-poll-states disj poll-state)
  (reset! running? false)
  (when-let [f @process]
    (reset! process nil)
    (when (instance? Future f)
      (.cancel ^Future f true))
    (log/infof "%s polling thread stopped" label)))

(defn notify!
  "Wakes the polling thread so it runs immediately."
  [{:keys [notify]}]
  (locking notify (.notifyAll ^Object notify)))

(defn notify-all!
  "Wakes all active polling threads so they run immediately."
  []
  (doseq [ps @active-poll-states]
    (notify! ps)))
