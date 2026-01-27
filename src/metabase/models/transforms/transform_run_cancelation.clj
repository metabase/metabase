(ns metabase.models.transforms.transform-run-cancelation
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformRunCancelation [_model] :transform_run_cancelation)

(derive :model/TransformRunCancelation :metabase/model)

(defn mark-cancel-started-run!
  "Mark a started run for cancelation."
  [run-id]
  (t2/query-one
   [(str "INSERT INTO transform_run_cancelation (run_id) "
         "SELECT transform_run.id "
         "FROM transform_run "
         "WHERE transform_run.id = ? "
         "AND transform_run.is_active "
         "AND NOT EXISTS (SELECT 1 FROM transform_run_cancelation WHERE run_id = ?)")
    run-id run-id])
  (t2/update! :model/TransformRun
              :id run-id
              {:status "canceling"})
  nil)

(defn reducible-canceled-local-runs
  "Return a reducible sequence of local canceled runs."
  []
  (t2/reducible-select :model/TransformRunCancelation))

(defn delete-cancelation!
  "Delete a cancelation once it has been handled."
  [run-id]
  (t2/delete! :model/TransformRunCancelation
              :run_id run-id
              :run_id [:not-in {:select :wr.id
                                :from   [[:transform_run :wr]]
                                :where  :wr.is_active}]))

(defn delete-old-canceling-runs!
  "Delete cancelations for runs that are no longer running."
  []
  (t2/delete! :model/TransformRunCancelation
              :run_id [:not-in {:select :wr.id
                                :from   [[:transform_run :wr]]
                                :where  :wr.is_active}]))
