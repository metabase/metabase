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

     1. Records a `TableRemapping` from the canonical `(schema, name)` to the workspace's
        `(workspace-schema, remapped-name)` via [[ws.table-remapping/add-transform-target-mapping!]].
        The remap is normalized per-driver (3-slot for Snowflake/SQL Server/BigQuery,
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
      ;; **Replace** `:db` and `:schema` on the target with the to-spec's
      ;; values — not just merge in the populated ones. The canonical target
      ;; carries the input namespace (e.g. `:schema \"test-data\"` for a MySQL
      ;; workspace where the input DB is `test-data`); after rewriting, the
      ;; target points at the iso namespace which on MySQL lives at `:db`,
      ;; not `:schema`. Failing to clear the canonical `:schema` leaves the
      ;; SQL compiler with two competing qualifiers and the output lands in
      ;; the wrong place.
      ;;
      ;; `add-transform-target-mapping!` returns the to-side denormalized
      ;; (`""` sentinels already converted to `nil`), so we can `assoc` the
      ;; values directly without a per-call shim.
      (assoc target :db to-db :schema to-schema :name to-name))
    target))
