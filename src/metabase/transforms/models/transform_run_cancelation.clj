(ns metabase.transforms.models.transform-run-cancelation
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.transforms.db :as transforms.db]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformRunCancelation [_model] :transform_run_cancelation)

(derive :model/TransformRunCancelation :metabase/model)

(defn mark-cancel-started-run!
  "Mark a started run for cancelation."
  [run-id]
  (try
    (transforms.db/insert-cancelation-for-active-run! run-id)
    (transforms.db/mark-run-canceling! run-id)
    (log/infof "Cancelation requested for transform run %s" run-id)
    (analytics/inc! :metabase-transforms/cancelation-requests {:status "ok"})
    nil
    (catch Throwable t
      (analytics/inc! :metabase-transforms/cancelation-requests {:status "error"})
      (throw t))))

(defn reducible-canceled-local-runs
  "Return a reducible sequence of local canceled runs."
  []
  (transforms.db/cancelations-reducible))

(defn delete-cancelation!
  "Delete a cancelation once it has been handled."
  [run-id]
  (transforms.db/delete-cancelation-for-inactive-run! run-id))

(defn delete-old-canceling-runs!
  "Delete cancelations for runs that are no longer running."
  []
  (transforms.db/delete-cancelations-for-inactive-runs!))
