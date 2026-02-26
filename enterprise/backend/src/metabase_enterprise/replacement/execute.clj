(ns metabase-enterprise.replacement.execute
  "Async execution harness for source replacement. Launches work in a virtual thread,
   tracks progress in the `source_replacement_run` table, and provides a protocol for
   the work-fn to report progress and check for cancellation."
  (:require
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [potemkin.types :as p.types]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ^:const progress-batch-size
  "Write progress to DB every N items (and always on the final item)."
  50)

(defn execute-async!
  "Start an async source replacement run. Inserts a run record, launches `work-fn` in a
   virtual thread, and returns the run record immediately.

   `work-fn` receives a single argument implementing `IRunnerProgress`.

   Throws 409 if another run is already active."
  [{:keys [source-type source-id target-type target-id user-id]} work-fn]
  (when (replacement-run/active-run)
    (throw (ex-info "A source replacement is already running" {:status-code 409})))
  (let [run        (replacement-run/create-run! source-type source-id target-type target-id user-id)
        run-id     (:id run)
        progress   (let [total*     (atom 0)
                         completed* (atom 0)]
                     (reify replacement.protocols/IRunnerProgress
                       (set-total! [_ total] (reset! total* total))
                       (advance! [this] (replacement.protocols/advance! this 1))
                       (advance! [this n]
                         (let [c    (swap! completed* + n)
                               t    @total*
                               prev (- c n)
                               crossed-boundary? (or (= c t)
                                                     (not= (quot prev progress-batch-size)
                                                           (quot c progress-batch-size)))]
                           (when crossed-boundary?
                             (let [progress (if (pos? t) (double (/ c t)) 0.0)]
                               (replacement-run/update-progress! run-id progress)
                               (when (replacement.protocols/canceled? this)
                                 (throw (ex-info "Run canceled" {:run-id run-id})))))))
                       (canceled? [_]
                         (not (:is_active (t2/select-one [:model/ReplacementRun :is_active] :id run-id))))))]
    (u.jvm/in-virtual-thread*
     (try
       (work-fn progress)
       (replacement-run/succeed-run! run-id)
       (catch Throwable t
         (if (replacement.protocols/canceled? progress)
           (log/infof "Replacement run %d was canceled" run-id)
           (do
             (log/errorf t "Replacement run %d failed" run-id)
             (replacement-run/fail-run! run-id (ex-message t)))))))
    run))
