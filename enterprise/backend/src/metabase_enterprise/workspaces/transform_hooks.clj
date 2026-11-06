(ns metabase-enterprise.workspaces.transform-hooks
  "Enterprise hooks that integrate the transform execution path with workspace isolation."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(defenterprise workspace-transform-target
  "Enterprise impl of the read-only transform-target hook.

   When a `WorkspaceDatabase` is provisioned for `db-id`, the transform writes to the
   workspace's output namespace rather than the canonical target. Returns the target with
   `:db`, `:schema` and `:name` rewritten to the to-side
   [[ws.table-remapping/transform-target-remapping]] computes, without recording anything.
   The remapped table name is derived deterministically from the canonical `(schema, name)`
   so that two source tables sharing a name across different schemas land at distinct
   warehouse identifiers in the single workspace namespace, and so that the row
   [[record-workspace-target-remapping!]] records later points at the same place.

   When no workspace is active for `db-id`, the canonical target passes through unchanged.

   Deliberately ungated on premium features: a token expiry shouldn't silently cause
   workspace transforms to overwrite production tables. If a `WorkspaceDatabase` is
   provisioned, the rewrite must apply."
  :feature :none
  [db-id target]
  (if (some? (ws/db-workspace-namespace db-id))
    (let [{to-db :db to-schema :schema to-name :name}
          (ws.table-remapping/transform-target-remapping db-id target)]
      ;; **Replace** `:db` and `:schema` on the target with the to-spec's values
      ;; — not just merge in the populated ones. The canonical target carries the
      ;; input namespace; after rewriting, the target points at the iso namespace
      ;; which on MySQL lives at `:db`, not `:schema`. Failing to clear the
      ;; canonical `:schema` leaves the SQL compiler with two competing
      ;; qualifiers and the output lands in the wrong place.
      (assoc target :db to-db :schema to-schema :name to-name))
    target))

(defenterprise record-workspace-target-remapping!
  "Enterprise impl: record the `TableRemapping` from the canonical transform `target` to its
   workspace copy via [[ws.table-remapping/add-transform-target-mapping!]] (idempotent, so a row
   from an earlier successful run stays as it was). Executors call this only after the run has
   succeeded, so a failed run leaves the canonical table's remapping state unchanged.

   Subsequent reads of the canonical `(schema, name)` pair resolve to the workspace copy via
   the QP middleware (see `metabase-enterprise.workspaces.query-processor.middleware`).
   Deliberately ungated on premium features, like [[workspace-transform-target]]."
  :feature :none
  [db-id target]
  (when (some? (ws/db-workspace-namespace db-id))
    (ws.table-remapping/add-transform-target-mapping! db-id target))
  nil)

(defenterprise rewrite-native-sql-for-workspace
  "Workspace-isolation SQL rewrite for the native-transform exec path. Reuses the same
   `rewrite-sql` primitive as the QP's Phase 2 middleware, so canonical refs in a native
   transform's SQL resolve to the same isolation-schema names the QP would emit.

   Short-circuits when no remappings are active for `db-id`.

   Deliberately ungated on premium features. See [[workspace-transform-target]] for the
   rationale -- if a workspace child has `TableRemapping` rows, isolation must engage
   regardless of token state."
  :feature :none
  [driver db-id sql]
  (if-not (ws.remapping/enabled-for-db? db-id)
    sql
    (let [remappings (ws.remapping/remappings-for-db db-id)]
      (if (empty? remappings)
        sql
        (ws.table-remapping/rewrite-sql driver sql remappings)))))
