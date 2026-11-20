(ns metabase-enterprise.replacement.execute
  "Async execution harness for source replacement. Launches work in a virtual thread,
   tracks progress in the `source_replacement_run` table, and provides a protocol for
   the work-fn to report progress and check for cancellation."
  (:require
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase.util.jvm :as u.jvm]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn check-no-active-run
  "Throws a 409 when another source replacement run is active."
  []
  (when (replacement-run/active-run)
    (throw (ex-info "A source replacement is already running" {:status-code 409}))))

(defn execute-async!
  "Start an async source replacement run. Inserts a run record, launches `work-fn` in a
   virtual thread, and returns the run record immediately.

   `work-fn` receives a single argument implementing `IRunnerProgress`.

   Throws 409 if another run is already active, including one that started at the same time."
  [work-fn progress]
  (check-no-active-run)
  (try
    (t2/with-transaction [_conn]
      (replacement.protocols/start-run! progress))
    (catch Throwable e
      (check-no-active-run)
      (throw e)))
  (u.jvm/in-virtual-thread*
   (try
     (work-fn progress)
     (replacement.protocols/succeed-run! progress)
     (catch Throwable t
       (when-not (replacement.protocols/canceled? progress)
         (replacement.protocols/fail-run! progress t))))))
