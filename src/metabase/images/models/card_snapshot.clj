(ns metabase.images.models.card-snapshot
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :model/CardSnapshot :metabase/model)

(methodical/defmethod t2/table-name :model/CardSnapshot
  [_model]
  "card_snapshot")
