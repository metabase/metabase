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

(mi/define-batched-hydration-method transform-tag-ids
  :transform_tag_ids
  "Add tag_ids to a transform"
  [transforms]
  (if-not (seq transforms)
    transforms
    (let [transform-ids (into #{} (map :id) transforms)
          tag-associations (when (seq transform-ids)
                             (t2/select [:transform_tags :transform_id :tag_id]
                                        :transform_id [:in transform-ids]))
          transform-id->tag-ids (reduce (fn [acc {:keys [transform_id tag_id]}]
                                          (update acc transform_id (fnil conj []) tag_id))
                                        {}
                                        tag-associations)]
      (for [transform transforms]
        (assoc transform :tag_ids (vec (sort (get transform-id->tag-ids (:id transform) []))))))))

(defn update-transform-tags!
  "Update the tags associated with a transform. Replaces all existing associations."
  [transform-id tag-ids]
  (when transform-id
    (t2/with-transaction [_conn]
      ;; Delete existing associations
      (t2/delete! :transform_tags :transform_id transform-id)
      ;; Add new associations
      (when (seq tag-ids)
        (let [valid-tag-ids (into #{} (t2/select-fn-set :id :model/TransformTag :id [:in tag-ids]))]
          (when (seq valid-tag-ids)
            (t2/insert! :transform_tags
                        (for [tag-id valid-tag-ids]
                          {:transform_id transform-id
                           :tag_id tag-id}))))))))

(defmethod worker/model->work-type :model/Transform
  [_]
  :transform)
