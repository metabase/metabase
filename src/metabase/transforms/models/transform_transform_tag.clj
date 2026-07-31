(ns metabase.transforms.models.transform-transform-tag
  (:require
   [metabase.models.serialization :as serdes]
   [metabase.remote-sync.core :as remote-sync]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformTransformTag [_model] :transform_transform_tag)

(doto :model/TransformTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id))

(t2/define-before-insert :model/TransformTransformTag
  [tag-assignment]
  (remote-sync/inherit-worktree-id tag-assignment :model/Transform :transform_id))

(t2/define-before-update :model/TransformTransformTag
  [tag-assignment]
  (remote-sync/check-worktree-id-unchanged tag-assignment)
  (remote-sync/check-parent-same-worktree tag-assignment :model/Transform :transform_id)
  tag-assignment)

(t2/define-after-select :model/TransformTransformTag
  [tag-assignment]
  (remote-sync/remove-worktree-id-helper tag-assignment))

(defmethod serdes/make-spec "TransformTransformTag"
  [_model-name _opts]
  {:skip [:worktree_id :worktree_id_helper]
   :copy [:entity_id :position]
   :transform {:transform_id (serdes/parent-ref)
               :tag_id (serdes/fk :model/TransformTag)}})
