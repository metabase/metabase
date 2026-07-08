(ns metabase.transforms-rest.api.util
  "Helpers shared by the transforms REST API namespaces."
  (:require
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(defn async-run-response
  "Launch `start!` — a fn of a start-promise — on a virtual thread and respond `202` as soon as the
  run row exists, without waiting for the run to finish. `start!` must deliver the promise
  `[:started run-id]` once the row is created, `nil` when nothing was run, or a Throwable on a
  pre-start failure (rethrown). The response body is `{:message message, <id-key> <run-id-or-nil>}`."
  [message id-key start!]
  (let [start-promise (promise)]
    (u.jvm/in-virtual-thread*
     (try
       (start! start-promise)
       (catch Throwable t
         ;; post-start failures: the run row was already failed by the runner; this is a fallback log
         (log/error t "Async run failed"))))
    (when (instance? Throwable @start-promise)
      (throw @start-promise))
    (let [result @start-promise
          run-id (when (and (vector? result) (= (first result) :started))
                   (second result))]
      (-> (response/response {:message message, id-key run-id})
          (assoc :status 202)))))
