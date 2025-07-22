(ns metabase-enterprise.transforms.models.transform
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Transform [_model] :transforms)

(doto :model/Transform
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/Transform
  {:source mi/transform-json
   :target mi/transform-json})
