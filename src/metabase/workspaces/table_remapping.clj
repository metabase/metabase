(ns metabase.workspaces.table-remapping
  "The OSS namespace for workspace table remapping."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise workspace-remap-schema+name
  "In workspace mode, a Table row at `(from-schema, from-name)` may be backed by a
  physically-different warehouse table at `(to-schema, to-name)` recorded in
  `table_remapping`. This hook returns `[to-schema to-name]` when a remapping
  exists so sync asks the driver about the isolated warehouse location; returns
  nil otherwise (OSS fallback) so the driver is queried at the logical identity."
  metabase-enterprise.workspaces.table-remapping
  [_db-id _schema _name]
  nil)

(defenterprise filter-workspace-side-tables
  "Drop tuples from a `describe-database` result whose `(schema, name)` matches
  the to-side of any active TableRemapping for `db-id`. The workspace's physical
  isolation tables are surfaced by the warehouse driver but must not become
  `:model/Table` rows in app-db -- they back canonical Tables via remap, not
  their own identity. OSS fallback is identity (no filtering). See DEV-1898."
  metabase-enterprise.workspaces.table-remapping
  [tuples _db-id]
  tuples)

(defenterprise expand-schema-names-with-workspace
  "Augment a list of `:schema-names` with workspace-isolation schemas
  (`to_schema` values) for any remap whose `from_schema` appears in the input.
  Lets sync's FK fetch reach the warehouse tables that physically back canonical
  Tables on a workspace child. OSS fallback is identity."
  metabase-enterprise.workspaces.table-remapping
  [schema-names _db-id]
  schema-names)

(defenterprise inject-workspace-canonical-tuples
  "Augment a `describe-database` result with synthetic canonical-side tuples for
  any `from_*` remap row whose to-side is materialized in the warehouse. The
  canonical name doesn't physically exist on a workspace child (only the
  isolation-schema copy does), so without this it'd be diffed against app-db's
  Table rows and silently retired. OSS fallback is identity."
  metabase-enterprise.workspaces.table-remapping
  [tuples _db-id]
  tuples)

(defenterprise rewrite-fk-result-canonical
  "Translate workspace-side identifiers in a `describe-fks` result back to canonical
  names. When sync redirects FK lookups to the workspace warehouse table, the
  returned rows reference workspace-side `(schema, name)` on both sides; app-db's
  view needs them in canonical terms so subsequent FK resolution finds the
  matching `:model/Table`. OSS fallback is identity (no rewriting)."
  metabase-enterprise.workspaces.table-remapping
  [rows _db-id]
  rows)

(defenterprise canonical-schema+name
  "Inverse of `workspace-remap-schema+name`. Given an isolation-schema
  `(to-schema, to-name)` pair, return `[from-schema from-name]` if a
  `TableRemapping` row records that pair as the workspace destination of a
  canonical table; return nil otherwise.

  Use at write-side `:model/Table` lookups where the transform pipeline has
  already mutated `:target.schema` to the workspace output schema, but the
  app-db Table row lives at the canonical schema. OSS fallback is nil so
  callers fall through to the unchanged identity."
  metabase-enterprise.workspaces.table-remapping
  [_db-id _schema _name]
  nil)
