(ns metabase.images.models.image
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :model/Image :metabase/model)

(methodical/defmethod t2/table-name :model/Image
  [_model]
  "image")
