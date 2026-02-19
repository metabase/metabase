(ns metabase.models.transforms.transform-transform-tag
  (:require
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformTransformTag [_model] :transform_transform_tag)

(doto :model/TransformTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id))

(defmethod serdes/hash-fields :model/TransformTransformTag
  [_transform-transform-tag]
  [:transform_id :tag_id :position])

(defmethod serdes/make-spec "TransformTransformTag"
  [_model-name _opts]
  {:copy [:entity_id :position]
   :transform {:transform_id (serdes/parent-ref)
               :tag_id (serdes/fk :model/TransformTag)}})
