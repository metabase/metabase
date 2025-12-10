(ns metabase-enterprise.workspaces.models.workspace-output
  "Model for WorkspaceOutput - tables that workspace transforms produce."
  (:require
   [clojure.string :as str]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceOutput [_model] :workspace_output)

(doto :model/WorkspaceOutput
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/WorkspaceOutput
  {:ref_id {:in identity :out str/trim}})
