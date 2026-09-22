(ns metabase.transforms.models.transform-transform-tag
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.transforms.schema]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformTransformTag [_model] :transform_transform_tag)

(doto :model/TransformTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/worktree-id))

(defmethod mi/worktree-container :model/TransformTransformTag [_model]
  [[:transform_id :model/Transform]])

(defmethod serdes/make-spec "TransformTransformTag"
  [_model-name _opts]
  {:copy [:entity_id :position]
   :skip [:worktree_id]
   :transform {:transform_id (serdes/parent-ref)
               :tag_id (serdes/fk :model/TransformTag)}})
