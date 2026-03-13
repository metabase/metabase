(ns metabase-enterprise.replacement.execute
  "Async execution harness for source replacement. Launches work in a virtual thread,
   tracks progress in the `source_replacement_run` table, and provides a protocol for
   the work-fn to report progress and check for cancellation."
  (:require
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- start-run-or-409!
  "Attempt to start a run. Throws 409 if another run is already active."
  [progress]
  (when (replacement-run/active-run)
    (throw (ex-info "A source replacement is already running" {:status-code 409})))
  (try
    (replacement.protocols/start-run! progress)
    (catch Throwable t
      ;; The unique constraint on is_active catches the race between checking active-run
      ;; and calling start-run!. Surface it as a clean 409 instead of a 500.
      (log/warn t "Failed to start run (likely concurrent start)")
      (throw (ex-info "A source replacement is already running" {:status-code 409})))))

(defn execute-async!
  "Start an async source replacement run. Inserts a run record, launches `work-fn` in a
   virtual thread, and returns the run record immediately.

   `work-fn` receives a single argument implementing `IRunnerProgress`.

   Throws 409 if another run is already active."
  [work-fn progress]
  (start-run-or-409! progress)
  (u.jvm/in-virtual-thread*
   (try
     (work-fn progress)
     (replacement.protocols/succeed-run! progress)
     (catch Throwable t
       (when-not (replacement.protocols/canceled? progress)
         (replacement.protocols/fail-run! progress t))))))

(defn execute-swap!
  "Run a source swap synchronously (for use when already in a virtual thread).
   Checks for active runs, starts the run, executes work-fn, and handles success/failure.

   Throws 409 if another run is already active."
  [progress work-fn]
  (start-run-or-409! progress)
  (try
    (work-fn progress)
    (replacement.protocols/succeed-run! progress)
    (catch Throwable t
      (when-not (replacement.protocols/canceled? progress)
        (replacement.protocols/fail-run! progress t))
      (throw t))))
