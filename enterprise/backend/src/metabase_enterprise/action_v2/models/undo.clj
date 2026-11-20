(ns metabase-enterprise.action-v2.models.undo
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Undo [_model] :data_edit_undo_chain)

(t2/deftransforms :model/Undo
  {:row_pk     mi/transform-json
   :raw_before mi/transform-json
   :raw_after  mi/transform-json})

(doto :model/Undo
  (derive :metabase/model)
  (derive :hook/timestamped?))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Undo [_model]
  {:skip? true})
