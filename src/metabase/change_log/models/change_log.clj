(ns metabase.change-log.models.change-log
  "The change log, an entry per write of a row of a tracked table, which `metabase.change-log.db` reads and writes as a
  table."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ChangeLog [_model] :change_log)

(derive :model/ChangeLog :metabase/model)

(defmethod app-db-copy/spec :model/ChangeLog [_model]
  {:skip? true})
