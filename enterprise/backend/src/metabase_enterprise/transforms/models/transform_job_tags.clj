(ns metabase-enterprise.transforms.models.transform-job-tags
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformJobTags [_model] :transform_job_tags)

(doto :model/TransformJobTags
  (derive :metabase/model))
