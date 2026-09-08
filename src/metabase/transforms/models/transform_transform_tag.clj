(ns metabase.transforms.models.transform-transform-tag
  (:require
   [metabase.models.serialization :as serdes]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.transforms.db :as transforms.db]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformTransformTag [_model] :transform_transform_tag)

(doto :model/TransformTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/worktree-id))

(defn- check-parents-same-worktree
  "Both sides of a tag assignment must live in the same worktree as the assignment itself -- a worktree
  transform is never tagged with the main app's tag, nor the other way round."
  [{:keys [transform_id tag_id] :as tag-assignment}]
  (when transform_id
    (remote-sync/check-same-worktree tag-assignment
                                     (transforms.db/transform-worktree-id transform_id)))
  (when tag_id
    (remote-sync/check-same-worktree tag-assignment
                                     (transforms.db/tag-worktree-id tag_id))))

(t2/define-before-insert :model/TransformTransformTag
  [tag-assignment]
  (check-parents-same-worktree tag-assignment)
  tag-assignment)

(t2/define-before-update :model/TransformTransformTag
  [tag-assignment]
  (let [changes (t2/changes tag-assignment)]
    (when (or (contains? changes :transform_id) (contains? changes :tag_id))
      (check-parents-same-worktree tag-assignment)))
  tag-assignment)

(defmethod serdes/make-spec "TransformTransformTag"
  [_model-name _opts]
  {:skip [:worktree_id]
   :copy [:entity_id :position]
   :transform {:transform_id (serdes/parent-ref)
               :tag_id (serdes/fk :model/TransformTag)}})
