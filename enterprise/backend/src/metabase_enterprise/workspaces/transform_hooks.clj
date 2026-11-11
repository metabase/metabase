(ns metabase-enterprise.workspaces.transform-hooks
  "Enterprise hooks that integrate the transform execution path with workspace isolation."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(defenterprise resolve-transform-target
  "Enterprise impl of the transform-target rewrite hook.

   When a `WorkspaceDatabase` is provisioned for `db-id`, the transform should write to
   the workspace's output schema rather than the canonical target schema. This:

     1. Records a `TableRemapping` from the canonical `(schema, name)` to the workspace's
        `(workspace-schema, remapped-name)` via [[ws.table-remapping/add-transform-target-mapping!]].
        The remap is normalized per-driver (3-slot for SQL Server/BigQuery,
        2-slot for Postgres/ClickHouse, 1-slot for MySQL). The remapped table name is
        derived deterministically from the canonical `(schema, name)` so that two source
        tables sharing a name across different schemas land at distinct warehouse
        identifiers in the single workspace schema.
     2. Returns the target with `:schema` and `:name` rewritten to the recorded warehouse
        identifier, so the transform executor writes to the same place the row points.

   Subsequent reads of the canonical `(schema, name)` pair will resolve to the workspace
   copy via the QP middleware (see `metabase-enterprise.workspaces.query-processor.middleware`).

   When no workspace is active for `db-id`, the canonical target passes through unchanged.

   Deliberately ungated on premium features: a token expiry shouldn't silently cause
   workspace transforms to overwrite production tables. If a `WorkspaceDatabase` is
   provisioned, the rewrite must apply."
  :feature :none
  [db-id target]
  (if (some? (ws/db-workspace-namespace db-id))
    (let [{to-db :db to-schema :schema to-name :name}
          (ws.table-remapping/add-transform-target-mapping! db-id target)]
      ;; **Replace** `:db` and `:schema` on the target with the to-spec's values
      ;; — not just merge in the populated ones. The canonical target carries the
      ;; input namespace; after rewriting, the target points at the iso namespace
      ;; which on MySQL lives at `:db`, not `:schema`. Failing to clear the
      ;; canonical `:schema` leaves the SQL compiler with two competing
      ;; qualifiers and the output lands in the wrong place.
      ;;
      ;; `add-transform-target-mapping!` returns the to-side denormalized (`""`
      ;; sentinels already converted to nil), so we can `assoc` directly without
      ;; a per-call shim.
      (assoc target :db to-db :schema to-schema :name to-name))
    target))

(defenterprise rewrite-native-sql-for-workspace
  "Workspace-isolation SQL rewrite for the native-transform exec path. Reuses the same
   `rewrite-sql` primitive as the QP's Phase 2 middleware, so canonical refs in a native
   transform's SQL resolve to the same isolation-schema names the QP would emit.

   Short-circuits when no remappings are active for `db-id`.

   Deliberately ungated on premium features. See [[resolve-transform-target]] for the
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
