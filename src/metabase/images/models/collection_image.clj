(ns metabase.images.models.collection-image
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :model/CollectionImage :metabase/model)

(methodical/defmethod t2/table-name :model/CollectionImage
  [_model]
  "collection_image")
