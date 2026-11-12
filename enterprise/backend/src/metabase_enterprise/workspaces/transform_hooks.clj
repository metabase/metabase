(ns metabase-enterprise.workspaces.transform-hooks
  "Enterprise hooks that integrate the transform execution path with workspace isolation."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- retarget
  "Point `target` at the workspace to-spec. Shared by [[resolve-transform-target]] and
   [[workspace-transform-target]] so the existence check and the write cannot drift."
  [target {to-db :db to-schema :schema to-name :name}]
  ;; **Replace** `:db` and `:schema` on the target with the to-spec's values
  ;; — not just merge in the populated ones. The canonical target carries the
  ;; input namespace; after rewriting, the target points at the iso namespace
  ;; which on MySQL lives at `:db`, not `:schema`. Failing to clear the
  ;; canonical `:schema` leaves the SQL compiler with two competing
  ;; qualifiers and the output lands in the wrong place.
  ;;
  ;; The to-spec arrives denormalized (`""` sentinels already converted to nil),
  ;; so we can `assoc` directly without a per-call shim.
  (assoc target :db to-db :schema to-schema :name to-name))

(defn- check-workspace-schema!
  "On a workspace instance, throws a 400 when database `db-id` has no `database-workspace-schema`, so that no
   transform writes to, or is checked against, a production table: fail closed."
  [db-id]
  (when (and (ws/workspace-mode?) (nil? (ws/db-workspace-namespace db-id)))
    (throw (ex-info (tru "Database {0} has no workspace schema (`database-workspace-schema`), and this instance is a workspace, so its transforms have no safe target."
                         db-id)
                    {:status-code 400 :database-id db-id}))))

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

   On a non-workspace instance the canonical target passes through unchanged. On a
   workspace instance, throws a 400 when the database has no `database-workspace-schema`,
   so that no transform writes to a production table.

   Deliberately ungated on premium features: a token expiry shouldn't silently cause
   workspace transforms to overwrite production tables. If a `WorkspaceDatabase` is
   provisioned, the rewrite must apply."
  :feature :none
  [db-id target]
  (check-workspace-schema! db-id)
  (if (some? (ws/db-workspace-namespace db-id))
    (retarget target (ws.table-remapping/add-transform-target-mapping! db-id target))
    target))

(defenterprise workspace-transform-target
  "Enterprise impl of the read-only transform-target hook: the target
   [[resolve-transform-target]] would return, computed via
   [[ws.table-remapping/transform-target-remapping]] so no `TableRemapping` is recorded.
   Throws the same 400 as [[resolve-transform-target]] on a workspace instance when the
   database has no `database-workspace-schema`, so that no check reads a production table.
   Ungated on premium features for the same reason as [[resolve-transform-target]]."
  :feature :none
  [db-id target]
  (check-workspace-schema! db-id)
  (if (some? (ws/db-workspace-namespace db-id))
    (retarget target (ws.table-remapping/transform-target-remapping db-id target))
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
