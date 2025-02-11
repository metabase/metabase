(ns metabase.models.cell-edit
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(doto :model/CellEdit
  (derive :metabase/model)
  ;; anything else?
  )

(doto :model/TableEdit
  (derive :metabase/model)
  ;; anything else?
  )

(methodical/defmethod t2/table-name :model/TableEdit [_model] :table_edit_history)
