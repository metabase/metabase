(ns metabase.transforms.models.transform-job-transform-tag
  (:require
   [metabase.serialization.core :as serialization]
   [metabase.transforms.schema :as transforms.schema]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformJobTransformTag [_model] :transform_job_transform_tag)

(doto :model/TransformJobTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id))

(defmethod serialization/spec :model/TransformJobTransformTag [_]
  {:schema    ::transforms.schema/external-transform-job-transform-tag
   :copy      [:entity_id :position]
   :parent    {:model :model/TransformJob :key :job_id :order (juxt :position :entity_id)}
   :transform {:job_id serialization/import-only-transform
               :tag_id (serialization/fk-transform :model/TransformTag)}})
