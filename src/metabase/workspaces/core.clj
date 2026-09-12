(ns metabase.workspaces.core
  "Workspaces, an EE feature behind the `:workspaces` token flag.

  While workspaces are on, transform runs write into the workspace schema of each database under a random table
  name, and a *table remapping* records which canonical `(schema, table)` is backed by which workspace table. The
  app-db `:model/Table` row names the table sync found, workspace table included; the query processor is
  what makes reads name the workspace table instead.

  The remapping CRUD here is the EE half: tables are named by schema and name and returned as
  `{:schema ..., :name ...}` maps, with OSS bodies the identity and EE implementations in
  `metabase-enterprise.workspaces.core`."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.premium-features.core :refer [defenterprise-schema]]
   [metabase.workspaces.schema :as ws.schema]))

(def ^:dynamic *allow-table-remapping*
  "Whether the query processor may redirect canonical table references to their workspace tables. Bound to false
  where the compiled SQL is shown to or saved by a person rather than run: they think in canonical tables, and a
  query pinned to a workspace table would break as soon as the remapping changed."
  true)

(defn allow-table-remapping?
  "Whether the query processor may redirect canonical table references to their workspace tables."
  []
  *allow-table-remapping*)

(defmacro with-table-remapping-disabled
  "Execute `body` with [[*allow-table-remapping*]] set to `false`, so compiled queries name the canonical tables."
  [& body]
  `(binding [*allow-table-remapping* false]
     ~@body))

(defenterprise-schema enabled? :- :boolean
  "Whether workspaces are enabled on this instance."
  metabase-enterprise.workspaces.core
  []
  false)

(defenterprise-schema remap-table! :- ::ws.schema/table-info
  "Record (or reuse) the remapping of the canonical table `table-name` in `schema` and return its workspace table.
  Throws when the database has no schemas or its workspace schema does not exist."
  metabase-enterprise.workspaces.core
  [_db-id     :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  {:schema schema, :name table-name})

(defenterprise-schema unmap-table! :- :nil
  "Delete the remapping of the canonical table `table-name` in `schema`, if any."
  metabase-enterprise.workspaces.core
  [_db-id      :- ::lib.schema.id/database
   _schema     :- [:maybe :string]
   _table-name :- ::lib.schema.common/non-blank-string]
  nil)

(defenterprise-schema workspace-table :- ::ws.schema/table-info
  "The workspace table backing the canonical table `table-name` in `schema`, or that table when it has no remapping.
  Not gated on the mode: a remapping is in effect until the table is unmapped."
  metabase-enterprise.workspaces.core
  [_db-id     :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  {:schema schema, :name table-name})

(defenterprise-schema canonical-table :- ::ws.schema/table-info
  "The canonical table backed by the workspace table `table-name` in `schema`, or that table when it is not one."
  metabase-enterprise.workspaces.core
  [_db-id     :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- ::lib.schema.common/non-blank-string]
  {:schema schema, :name table-name})

(defenterprise-schema table-remappings :- [:sequential ::ws.schema/workspace-table-remapping]
  "Every remapping of the Database with `db-id`: rows with `:from_schema`/`:from_table` (the canonical table) and
  `:to_schema`/`:to_table` (its workspace table)."
  metabase-enterprise.workspaces.core
  [_db-id :- ::lib.schema.id/database]
  [])
