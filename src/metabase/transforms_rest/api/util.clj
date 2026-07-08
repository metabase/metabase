(ns metabase.transforms-rest.api.util
  "Helpers shared by the transforms REST API namespaces."
  (:require
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def MemberTransformRunResponse
  "Response schema for a member transform run of a coordinated (job or DAG) run, hydrated with its
  transform. Exactly one of `job_run_id`/`dag_run_id` is set, naming the coordinating run."
  [:map {:closed true}
   [:id pos-int?]
   [:transform_id [:maybe pos-int?]]
   [:job_run_id [:maybe pos-int?]]
   [:dag_run_id [:maybe pos-int?]]
   [:run_method :keyword]
   [:status [:enum :started :succeeded :failed :timeout :canceled :canceling]]
   [:is_active [:maybe :boolean]]
   [:start_time :any]
   [:end_time {:optional true} [:maybe :any]]
   [:message [:maybe :string]]
   [:user_id [:maybe pos-int?]]
   [:transform_name {:optional true} [:maybe :string]]
   [:transform_entity_id {:optional true} [:maybe :string]]
   [:transform {:optional true} [:maybe :map]]
   [:metered_as {:optional true} [:maybe :string]]
   [:checkpoint_filter_field_id {:optional true} [:maybe pos-int?]]
   [:checkpoint_lo_value {:optional true} [:maybe :string]]
   [:checkpoint_hi_value {:optional true} [:maybe :string]]])

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
