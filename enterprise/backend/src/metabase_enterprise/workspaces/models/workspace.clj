(ns metabase-enterprise.workspaces.models.workspace
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(t2/deftransforms :model/Workspace
  {:graph mi/transform-json})

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))
