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

;;; `:hook/worktree-id` restricts every query Toucan builds over this table to the worktree being worked in, so a
;;; remapping recorded in one worktree is invisible to another. Without it the same canonical table remapped in two
;;; worktrees would resolve to whichever row the planner reached first: a table under a familiar name holding
;;; someone else's data, which reads as data rather than as an error.
(doto :model/WorkspaceTableRemapping
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?)
  (derive :hook/worktree-id))

(mu/defn- invalidate-cache! :- :nil
  "Drop the cached query results of the Database with `db-id`: they were produced against whichever table the
  remapping named before this write.

  Takes the id rather than the row, because a row here is a whole Toucan instance and the closed-schema check has
  no shape to hold it to."
  [db-id :- ::lib.schema.id/database]
  (cache/invalidate-config! {:databases [db-id]})
  nil)

(t2/define-after-insert :model/WorkspaceTableRemapping [row] (invalidate-cache! (:db_id row)) row)
(t2/define-after-update :model/WorkspaceTableRemapping [row] (invalidate-cache! (:db_id row)) row)
(t2/define-before-delete :model/WorkspaceTableRemapping [row] (invalidate-cache! (:db_id row)))
