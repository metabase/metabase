(ns metabase.transforms-base.workspace-hooks
  "Workspace-isolation hooks for transform execution paths that bypass the QP middleware
   pipeline. EE implementations live in `metabase-enterprise.workspaces.transform-hooks`."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(defenterprise rewrite-native-sql-for-workspace
  "Rewrite canonical table references in `sql` to their workspace-isolation counterparts.

   Hook for native-transform exec paths that hand compiled SQL directly to
   `driver/run-transform!` and bypass the QP's Phase 2 SQL rewriter.

   OSS / no-workspace fallback: returns the SQL unchanged."
  metabase-enterprise.workspaces.transform-hooks
  [_driver _db-id sql]
  sql)

(defenterprise workspace-transform-target
  "The target a transform targeting `target` on `db-id` would write to, without recording
   anything. On a workspaced database that is the workspace's remapped copy; checks such as
   \"does the target table already exist\" must ask about that table, not the canonical one.

   OSS / no-workspace fallback: returns `target` unchanged."
  metabase-enterprise.workspaces.transform-hooks
  [_db-id target]
  target)

(defenterprise record-workspace-target-remapping!
  "Record the `TableRemapping` from the canonical `target` on `db-id` to the workspace copy
  [[workspace-transform-target]] resolves it to. A run calls this once its write has returned and
  before it is marked succeeded, so a run that fails before writing leaves no remapping behind
  and the post-run sync, which reads it, finds it.

  OSS / no-workspace fallback: no-op."
  metabase-enterprise.workspaces.transform-hooks
  [_db-id _target]
  nil)
