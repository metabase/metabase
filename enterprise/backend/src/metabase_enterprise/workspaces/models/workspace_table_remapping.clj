(ns metabase-enterprise.workspaces.models.workspace-table-remapping
  "Toucan 2 model for `workspace_table_remapping`. Writes invalidate the database's query cache, whose results were produced
  against the previous table."
  (:require
   [metabase.cache.core :as cache]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceTableRemapping [_model] :workspace_table_remapping)

(doto :model/WorkspaceTableRemapping
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(mu/defn- invalidate-cache! :- :nil
  [row :- [:map [:db_id ::lib.schema.id/database]]]
  (cache/invalidate-config! {:databases [(:db_id row)]})
  nil)

(t2/define-after-insert :model/WorkspaceTableRemapping [row] (invalidate-cache! row) row)
(t2/define-after-update :model/WorkspaceTableRemapping [row] (invalidate-cache! row) row)
(t2/define-before-delete :model/WorkspaceTableRemapping [row] (invalidate-cache! row))
