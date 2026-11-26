(ns metabase.change-log.models.change-log
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ChangeLog [_model] :change_log)

(doto :model/ChangeLog
  (derive :metabase/model))

(defmethod app-db-copy/spec :model/ChangeLog [_model]
  {:skip? true})
