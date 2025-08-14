(ns metabase-enterprise.transforms.models.transform
  (:require
   [medley.core :as m]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Transform [_model] :transform)

(doseq [trait [:metabase/model :hook/entity-id :hook/timestamped?]]
  (derive :model/Transform trait))

(t2/deftransforms :model/Transform
  {:source mi/transform-json
   :target mi/transform-json
   :run_trigger mi/transform-keyword})

(mi/define-batched-hydration-method with-transform
  :transform
  "Add transform to a TransformRun"
  [runs]
  (if-not (seq runs)
    runs
    (let [transform-ids (into #{} (map :transform_id) runs)
          id->transform (t2/select-pk->fn identity [:model/Transform :id :name] :id [:in transform-ids])]
      (for [run runs]
        (assoc run :transform (get id->transform (:transform_id run)))))))

(mi/define-batched-hydration-method with-last-run
  :last_run
  "Add last_run to a transform"
  [transforms]
  (if-not (seq transforms)
    transforms
    (let [transform-ids (into #{} (map :id) transforms)
          last-runs (m/index-by :transform_id (transform-run/latest-runs transform-ids))]
      (for [transform transforms]
        (assoc transform :last_run (get last-runs (:id transform)))))))

(mi/define-batched-hydration-method transform-tag-ids
  :transform_tag_ids
  "Add tag_ids to a transform, preserving the order they were originally added"
  [transforms]
  (if-not (seq transforms)
    transforms
    (let [transform-ids (into #{} (map :id) transforms)
          tag-associations (when (seq transform-ids)
                             (t2/select [:transform_tags :transform_id :tag_id :id]
                                        :transform_id [:in transform-ids]
                                        {:order-by [[:id :asc]]}))
          transform-id->tag-ids (reduce (fn [acc {:keys [transform_id tag_id]}]
                                          (update acc transform_id (fnil conj []) tag_id))
                                        {}
                                        tag-associations)]
      (for [transform transforms]
        (assoc transform :tag_ids (vec (get transform-id->tag-ids (:id transform) [])))))))

(defn update-transform-tags!
  "Update the tags associated with a transform. Replaces all existing associations while preserving order.
   Duplicate tag IDs are automatically deduplicated, keeping the first occurrence."
  [transform-id tag-ids]
  (when transform-id
    (t2/with-transaction [_conn]
      ;; Delete existing associations
      (t2/delete! :transform_tags :transform_id transform-id)
      ;; Add new associations, preserving the order of tag-ids
      (when (seq tag-ids)
        (let [;; Deduplicate while preserving order of first occurrence
              deduped-tag-ids (distinct tag-ids)
              ;; Check which tags actually exist
              valid-tag-ids (into #{} (t2/select-fn-set :id :model/TransformTag :id [:in deduped-tag-ids]))
              ;; Filter to only include valid ones, preserving order
              ordered-valid-tag-ids (filter valid-tag-ids deduped-tag-ids)]
          (when (seq ordered-valid-tag-ids)
            (t2/insert! :transform_tags
                        (for [tag-id ordered-valid-tag-ids]
                          {:transform_id transform-id
                           :tag_id tag-id}))))))))
