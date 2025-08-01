(ns metabase-enterprise.worker.models.worker-run
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkerRun [_model] :worker_runs)

(derive :model/WorkerRun :metabase/model)

(t2/deftransforms :model/WorkerRun
  {:work_type mi/transform-keyword
   :status mi/transform-keyword
   :run_method mi/transform-keyword})

(mi/define-simple-hydration-method add-user-permissions
  :worker-runs
  "Add worker-runs for a transform or other work. Must have :id field."
  [work]
  (t2/select :model/WorkerRun :work_id (:id work) {:order-by [[:start_time :desc] [:end_time :desc]]}))
