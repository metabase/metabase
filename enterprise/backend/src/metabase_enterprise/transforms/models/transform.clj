(ns metabase-enterprise.transforms.models.transform
  (:require
   [medley.core :as m]
   [metabase-enterprise.worker.core :as worker]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Transform [_model] :transform)

(doseq [trait [:metabase/model :hook/entity-id :hook/timestamped?]]
  (derive :model/Transform trait))

(t2/deftransforms :model/Transform
  {:source mi/transform-json
   :target mi/transform-json
   :execution_trigger mi/transform-keyword})

(mi/define-batched-hydration-method with-transform
  :transform
  "Add transform to a WorkRun"
  [runs]
  (if-not (seq runs)
    runs
    (let [work-ids (into #{} (map :work_id) runs)
          id->transform (t2/select-pk->fn identity [:model/Transform :id :name] :id [:in work-ids])]
      (for [run runs]
        (assoc run :transform (get id->transform (:work_id run)))))))

(mi/define-batched-hydration-method with-last-execution
  :last_execution
  "Add last_execution to a transform"
  [transforms]
  (if-not (seq transforms)
    transforms
    (let [transform-ids (into #{} (map :id) transforms)
          last-executions (m/index-by :work_id (worker/latest-runs :transform transform-ids))]
      (for [transform transforms]
        (assoc transform :last_execution (get last-executions (:id transform)))))))
