(ns metabase.transforms.models.transform-run-cancelation
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.app-db.core :as mdb]
   [metabase.util.honey-sql-2 :as h2x]
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
    (log/infof "Cancelation requested for transform run %s" run-id)
    (prometheus/inc! :metabase-transforms/cancelation-requests {:status "ok"})
    nil
    (catch Throwable t
      (prometheus/inc! :metabase-transforms/cancelation-requests {:status "error"})
      (throw t))))

(defn reducible-canceled-local-runs
  "Return a reducible sequence of local canceled runs."
  []
  (t2/reducible-select :model/TransformRunCancelation))

(defn stale-canceling-cancelations
  "Return the cancelation rows whose runs are still active and whose request time is older than `age` `unit`.
  Used by the CancelOldTransformRuns sweep to observe the runs that are about to be force-canceled."
  [age unit]
  (t2/select :model/TransformRunCancelation
             {:select [:trc.run_id :trc.time]
              :from   [[:transform_run_cancelation :trc]]
              :join   [[:transform_run :wr] [:= :wr.id :trc.run_id]]
              :where  [:and
                       [:= :wr.is_active true]
                       [:<
                        :trc.time
                        (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)]]}))

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
