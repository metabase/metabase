(ns metabase-enterprise.transforms.models.transform-tags
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformTags [_model] :transform_tags)

(doto :model/TransformTags
  (derive :metabase/model)
  (derive :hook/entity-id))
