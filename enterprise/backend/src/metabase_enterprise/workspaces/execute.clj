(ns metabase-enterprise.workspaces.execute
  "Async execution harness for workspace provisioning, modeled on
   [[metabase-enterprise.replacement.execute]]: launches work on a virtual
   thread and returns immediately. There is no separate run table — the
   `:status`/`:status_details` columns on the workspace rows are the durable
   record of progress and outcome."
  (:require
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn execute-async!
  "Run `thunk` on a virtual thread and return nil immediately. Failures are
   logged; callers observe the outcome through the workspace status columns."
  [thunk]
  (u.jvm/in-virtual-thread*
   (try
     (thunk)
     (catch Throwable t
       (log/error t "Async workspace task failed"))))
  nil)

(defn poll-until
  "Call `thunk` every `interval-ms` until `(done? result)` is truthy and return
   that result. Throws when `timeout-ms` elapses without a truthy `done?`."
  [{:keys [timeout-ms] :as opts}]
  (or (u.jvm/poll opts)
      (throw (ex-info "Timed out waiting for an async task to finish"
                      {:timeout-ms timeout-ms}))))
