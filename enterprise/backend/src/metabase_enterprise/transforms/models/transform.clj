(ns metabase-enterprise.transforms.models.transform
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Transform [_model] :transform)

(doseq [trait [:metabase/model :hook/entity-id :hook/timestamped?]]
  (derive :model/Transform trait))

(t2/deftransforms :model/Transform
  {:source      mi/transform-json
   :target      mi/transform-json
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
          last-runs     (m/index-by :transform_id (transform-run/latest-runs transform-ids))]
      (for [transform transforms]
        (assoc transform :last_run (get last-runs (:id transform)))))))

(mi/define-batched-hydration-method transform-tag-ids
  :transform_tag_ids
  "Add tag_ids to a transform, preserving the order defined by position"
  [transforms]
  (if-not (seq transforms)
    transforms
    (let [transform-ids         (into #{} (map :id) transforms)
          tag-associations      (when (seq transform-ids)
                                  (t2/select [:model/TransformTransformTag :transform_id :tag_id :position]
                                             :transform_id [:in transform-ids]
                                             {:order-by [[:position :asc]]}))
          transform-id->tag-ids (reduce (fn [acc {:keys [transform_id tag_id]}]
                                          (update acc transform_id (fnil conj []) tag_id))
                                        {}
                                        tag-associations)]
      (for [transform transforms]
        (assoc transform :tag_ids (vec (get transform-id->tag-ids (:id transform) [])))))))

(defn update-transform-tags!
  "Update the tags associated with a transform using smart diff logic.
   Only modifies what has changed: deletes removed tags, updates positions for moved tags,
   and inserts new tags. Duplicate tag IDs are automatically deduplicated."
  [transform-id tag-ids]
  (when transform-id
    (t2/with-transaction [_conn]
      (let [;; Deduplicate while preserving order of first occurrence
            deduped-tag-ids      (vec (distinct tag-ids))
            ;; Get current associations
            current-associations (t2/select [:model/TransformTransformTag :tag_id :position]
                                            :transform_id transform-id
                                            {:order-by [[:position :asc]]})
            current-tag-ids      (mapv :tag_id current-associations)
            ;; Validate that new tag IDs exist
            valid-tag-ids        (when (seq deduped-tag-ids)
                                   (into #{} (t2/select-fn-set :id :model/TransformTag
                                                               :id [:in deduped-tag-ids])))
            ;; Filter to only valid tags, preserving order
            new-tag-ids          (if valid-tag-ids
                                   (filterv valid-tag-ids deduped-tag-ids)
                                   [])
            ;; Calculate what needs to change
            current-set          (set current-tag-ids)
            new-set              (set new-tag-ids)
            to-delete            (set/difference current-set new-set)
            to-insert            (set/difference new-set current-set)
            ;; Build position map for new ordering
            new-positions        (zipmap new-tag-ids (range))]

        ;; Delete removed associations
        (when (seq to-delete)
          (t2/delete! :model/TransformTransformTag
                      :transform_id transform-id
                      :tag_id [:in to-delete]))

        ;; Update positions for existing tags that moved
        (doseq [tag-id (filter current-set new-tag-ids)]
          (let [new-pos (get new-positions tag-id)]
            (t2/update! :model/TransformTransformTag
                        {:transform_id transform-id :tag_id tag-id}
                        {:position new-pos})))

        ;; Insert new associations with correct positions
        (when (seq to-insert)
          (t2/insert! :model/TransformTransformTag
                      (for [tag-id to-insert]
                        {:transform_id transform-id
                         :tag_id       tag-id
                         :position     (get new-positions tag-id)})))))))
