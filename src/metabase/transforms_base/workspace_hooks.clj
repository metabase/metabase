(ns metabase.transforms-base.workspace-hooks
  "Workspace-isolation hooks for transform execution paths that bypass the QP middleware
   pipeline. EE implementations live in `metabase-enterprise.workspaces.transform-hooks`."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(defenterprise rewrite-native-sql-for-workspace
  "Rewrite canonical table references in `sql` to their workspace-isolation counterparts.

   Called from the native-transform exec path -- transforms hand compiled SQL directly to
   `driver/run-transform!`, so the QP's Phase 2 SQL rewriter never sees it.

   OSS / no-workspace fallback: returns the SQL unchanged."
  metabase-enterprise.workspaces.transform-hooks
  [_driver _db-id sql]
  sql)
