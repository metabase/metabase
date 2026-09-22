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
   [metabase.util.i18n :refer [tru]]
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

(def ^:dynamic *current-workspace-id*
  "The Workspace whose table remappings are in force, or nil for none.

  One instance holds many workspaces, each with its own remapping of the same canonical table, so \"which
  workspace\" is a property of the caller rather than of the instance — hence a binding rather than a setting.
  Bind it with [[with-workspace]].

  Unbound (nil) means no remapping applies and queries read the canonical tables. That is the right default for
  reads: someone who never asked for a workspace gets production, as they did before workspaces existed. It is NOT
  a safe default for writes, so [[current-workspace-id-or-throw]] exists for the transform-execution path, where
  silently writing to the canonical table is the damaging outcome."
  nil)

(defn current-workspace-id
  "The Workspace whose remappings are in force, or nil for none."
  []
  *current-workspace-id*)

(defn current-workspace-id-or-throw
  "The Workspace whose remappings are in force. Throws when there is none.

  For paths that MATERIALIZE data — running a transform — where falling back to the canonical table would
  overwrite production output that dashboards read."
  []
  (or *current-workspace-id*
      (throw (ex-info (tru "No workspace is in effect: this operation must run inside a workspace.")
                      {:status-code 400}))))

(defmacro with-workspace
  "Execute `body` with the Workspace `workspace-id`'s table remappings in force. The query processor and transform
  execution read the binding rather than taking it as an argument, so every call underneath is scoped without
  threading an id through each one."
  [workspace-id & body]
  `(binding [*current-workspace-id* ~workspace-id]
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

(defenterprise-schema unmap-table! :- :boolean
  "Delete the remapping of the canonical table `table-name` in `schema`, returning whether there was one."
  metabase-enterprise.workspaces.core
  [_db-id      :- ::lib.schema.id/database
   _schema     :- [:maybe :string]
   _table-name :- ::lib.schema.common/non-blank-string]
  false)

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
