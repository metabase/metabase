(ns metabase-enterprise.transforms.models.transform-watermark
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformWatermark
  [_model]
  :transform_watermark)

(derive :model/TransformWatermark :metabase/model)
(derive :model/TransformWatermark :hook/timestamped?)
