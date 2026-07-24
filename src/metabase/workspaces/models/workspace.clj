(ns metabase.workspaces.models.workspace
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defmethod mi/can-read? :model/Workspace
  [& _]
  true)

(defmethod mi/can-write? :model/Workspace
  [& _]
  true)
