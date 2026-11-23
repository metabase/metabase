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

(derive :model/TransformRunCancelation :metabase/model)

(mu/defn reducible-canceled-local-runs
  "Return a reducible sequence of local canceled runs."
  []
  (transforms.db/cancelations-reducible))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn mark-cancel-started-runs! :- :nil
  "Mark each started run of `run-ids` for cancelation."
  [run-ids :- [:sequential ms/PositiveInt]]
  (when (seq run-ids)
    (try
      (transforms.db/insert-cancelations-for-active-runs! run-ids)
      (transforms.db/mark-runs-canceling! run-ids)
      (doseq [run-id run-ids]
        (log/infof "Cancelation requested for transform run %s" run-id)
        (analytics/inc! :metabase-transforms/cancelation-requests {:status "ok"}))
      (catch Throwable t
        (doseq [_ run-ids]
          (analytics/inc! :metabase-transforms/cancelation-requests {:status "error"}))
        (throw t))))
  nil)

(mu/defn mark-cancel-started-run! :- :nil
  "Mark a started run for cancelation."
  [run-id :- ms/PositiveInt]
  (mark-cancel-started-runs! [run-id]))

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
