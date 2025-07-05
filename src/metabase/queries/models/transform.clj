(ns metabase.queries.models.transform
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Transform [_model] :report_card_transform)

(t2/deftransforms :model/Transform
  {:original_dataset_query mi/transform-metabase-query})

(doto :model/Transform
  (derive :metabase/model))

(methodical/defmethod t2/primary-keys :model/Transform [_model] [:id])

