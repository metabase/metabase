(ns metabase.transforms.models.transform-transform-tag
  (:require
   [metabase.models.serialization :as serdes]
   [metabase.serialization.core :as serialization]
   [metabase.transforms.schema :as transforms.schema]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformTransformTag [_model] :transform_transform_tag)

(doto :model/TransformTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id))

(defmethod serdes/make-spec "TransformTransformTag"
  [_model-name _opts]
  {:schema    ::transforms.schema/external-transform-transform-tag
   :copy [:entity_id :position]
   :transform {:transform_id (serdes/parent-ref)
               :tag_id (serdes/fk :model/TransformTag)}})

(defmethod serialization/spec :model/TransformTransformTag [_]
  {:schema    ::transforms.schema/external-transform-transform-tag
   :copy      [:entity_id :position]
   :parent    {:model :model/Transform :key :transform_id :order (juxt :position :entity_id)}
   :transform {:transform_id serialization/import-only-transform
               :tag_id (serialization/fk-transform :model/TransformTag)}})
