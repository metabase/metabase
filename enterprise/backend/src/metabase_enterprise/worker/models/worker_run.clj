(ns metabase-enterprise.worker.models.worker-run
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(methodical/defmethod t2/table-name :model/WorkerRun [_model] :worker_run)

(derive :model/WorkerRun :metabase/model)

(t2/deftransforms :model/WorkerRun
  {:work_type mi/transform-keyword
   :status mi/transform-keyword
   :run_method mi/transform-keyword})

(def ^:private model->work-type
  {:model/Transform :transform})

(mi/define-simple-hydration-method add-worker-runs
  :worker-runs
  "Add worker-runs for a transform or other work. Must have :id field."
  [work]
  (t2/select :model/WorkerRun
             :work_id (:id work)
             :work_type (model->work-type (t2/model work))
             {:order-by [[:start_time :desc] [:end_time :desc]]}))

(defn- latest-runs-query [work-type work-ids]
  {:with [[:ranked_runs
           {:select [:*
                     [[:over [[:row_number] {:partition-by :work_id, :order-by [[:start_time :desc]]}]] :rn]]
            :from [:worker_run]
            :where [:and
                    [:= :work_type work-type]
                    [:in :work_id work-ids]]}]]
   :select [:*]
   :from [:ranked_runs]
   :where [:= :rn [:inline 1]]})

(defn latest-runs
  "Return the latest runs for `work-type` and `work-ids`."
  [work-type work-ids]
  (when (seq work-ids)
    (into [] (map (comp t2.realize/realize #(dissoc % :rn)))
          (t2/reducible-select :model/WorkerRun (latest-runs-query (name work-type) work-ids)))))
