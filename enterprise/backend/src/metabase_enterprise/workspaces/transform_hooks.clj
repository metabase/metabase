(ns metabase-enterprise.workspaces.transform-hooks
  "Enterprise hooks that integrate the transform execution path with workspace isolation."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(defenterprise resolve-transform-target
  "Enterprise impl of the transform-target rewrite hook.

   When a `WorkspaceDatabase` is provisioned for `db-id`, the transform should write to
   the workspace's output schema rather than the canonical target schema. This:

     1. Records a `TableRemapping` from the canonical `(schema, name)` to the workspace
        `(workspace-schema, name)` via [[ws.table-remapping/add-transform-target-mapping!]].
     2. Returns the target with `:schema` rewritten to the workspace output schema.

   Subsequent reads of the canonical `(schema, name)` pair will resolve to the workspace
   copy via the QP middleware (see `metabase-enterprise.workspaces.query-processor.middleware`).

   When no workspace is active for `db-id`, the canonical target passes through unchanged.

   Deliberately ungated on premium features: a token expiry shouldn't silently cause
   workspace transforms to overwrite production tables. If a `WorkspaceDatabase` is
   provisioned, the rewrite must apply."
  :feature :none
  [db-id target]
  (if-let [workspace-schema (ws/db-workspace-schema db-id)]
    (let [{from-schema :schema, from-name :name} target]
      (ws.table-remapping/add-transform-target-mapping! db-id from-schema from-name from-name)
      (assoc target :schema workspace-schema))
    target))
