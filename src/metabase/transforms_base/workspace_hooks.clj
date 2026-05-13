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
