(ns metabase.table-remapping.model
  "Toucan 2 model for the `table_remapping` table. Maps production tables to workspace tables
   for query remapping."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TableRemapping [_model] :table_remapping)

(doto :model/TableRemapping
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))
