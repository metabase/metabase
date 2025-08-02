(ns metabase-enterprise.transforms.models.transform
  (:require
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

(mi/define-batched-hydration-method add-transform
  :transform
  "Add transform to a WorkRun"
  [runs]
  (let [work-ids (set (map :work_id runs))
        transforms (t2/select [:model/Transform :id :name]
                              {:where [:and
                                       [:in :id work-ids]]})
        id->transform (reduce (fn [idx transform]
                                (assoc idx (:id transform) transform))
                              {} transforms)]
    (for [run runs]
      (assoc run :transform (get id->transform (:work_id run))))))
