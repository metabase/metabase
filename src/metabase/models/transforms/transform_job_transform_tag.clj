(ns metabase.models.transforms.transform-job-transform-tag
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformJobTransformTag [_model] :transform_job_transform_tag)

(doto :model/TransformJobTransformTag
  (derive :metabase/model))
