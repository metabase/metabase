(ns metabase.transforms.models.transform-run-cancelation
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.transforms.db :as transforms.db]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformRunCancelation [_model] :transform_run_cancelation)

(doto :model/TransformRunCancelation
  (derive :metabase/model)
  (derive :hook/worktree-id))

(mu/defn reducible-canceled-local-runs
  "Return a reducible sequence of local canceled runs."
  []
  (transforms.db/cancelations-reducible))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn- write-cancelations! :- :nil
  "Mark each started run of `run-ids` for cancelation with one write call of each kind, counting each request as ok."
  [run-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (transforms.db/insert-cancelations-for-active-runs! run-ids)
  (transforms.db/mark-runs-canceling! run-ids)
  (doseq [run-id run-ids]
    (log/infof "Cancelation requested for transform run %s" run-id)
    (analytics/inc! :metabase-transforms/cancelation-requests {:status "ok"})))

(mu/defn mark-cancel-started-runs! :- :boolean
  "Mark each started run of `run-ids` for cancelation together, returning false without counting an error when that
  throws an Exception, so the caller marks them one by one, and counting each as an error when it throws an Error."
  [run-ids :- [:sequential ms/PositiveInt]]
  (or (empty? run-ids)
      (try
        (write-cancelations! run-ids)
        true
        (catch Exception e
          (log/warnf "Failed to mark transform runs %s for cancelation together, marking them one by one: %s"
                     (vec run-ids) (ex-message e))
          false)
        (catch Throwable t
          (doseq [_ run-ids]
            (analytics/inc! :metabase-transforms/cancelation-requests {:status "error"}))
          (throw t)))))

(mu/defn mark-cancel-started-run! :- :nil
  "Mark a started run for cancelation, counting the request as an error when that throws."
  [run-id :- ms/PositiveInt]
  (try
    (write-cancelations! [run-id])
    (catch Throwable t
      (analytics/inc! :metabase-transforms/cancelation-requests {:status "error"})
      (throw t))))

(mu/defn delete-cancelation!
  "Delete a cancelation once it has been handled."
  [run-id :- ms/PositiveInt]
  (transforms.db/delete-cancelation-for-inactive-run! run-id))

(mu/defn delete-old-canceling-runs!
  "Delete cancelations for runs that are no longer running."
  []
  (transforms.db/delete-cancelations-for-inactive-runs!))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/TransformRunCancelation [_model]
  {:skip?    false
   :sequence false})
