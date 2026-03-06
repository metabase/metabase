(ns metabase.models.transforms.transform-job-transform-tag
  (:require
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformJobTransformTag [_model] :transform_job_transform_tag)

(doto :model/TransformJobTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id))

(defmethod serdes/hash-fields :model/TransformJobTransformTag
  [_job-tag]
  [:job_id :tag_id :position])

(defmethod serdes/make-spec "TransformJobTransformTag"
  [_model-name _opts]
  {:copy [:entity_id :position]
   :transform {:job_id (serdes/parent-ref)
               :tag_id (serdes/fk :model/TransformTag)}})
