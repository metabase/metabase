(ns metabase-enterprise.workspaces.core
  "Instance-side state for a Metabase running in workspace mode.

   On boot, the `:workspace` section loader (`metabase-enterprise.advanced-config.file.workspace`)
   parses `config.yml` and stores the resulting workspace map in [[workspace-instance-config]].
   Subsequent workspace-aware code (transform target rewriting, table-remapping QP middleware)
   reads from that atom via [[workspace-mode?]] / [[db-workspace-schema]].

   The atom is fresh per process — every boot re-reads `config.yml` and replaces the prior
   value. There is no durable storage of instance-side workspace state, by design: the file
   IS the source of truth, and a different file at boot means a different workspace, no
   questions asked."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defonce ^{:doc "The single workspace loaded into this instance from `config.yml`, or nil
  when no workspace was loaded.

  Shape:
    {:name <workspace-name>
     :databases {<database-id> {:input_schemas [...]
                                :output_schema <schema>}
                 ...}}"}
  workspace-instance-config
  (atom nil))

(defn set-instance-workspace!
  "Set the in-process workspace config for this instance. Called by the `:workspace`
  section loader at boot. Replaces any prior value."
  [config]
  (reset! workspace-instance-config config))

(defn clear-instance-workspace!
  "Clear the in-process workspace config. Mostly for tests."
  []
  (reset! workspace-instance-config nil))

(defn instance-workspace
  "Return the workspace loaded on this instance, or nil if none."
  []
  @workspace-instance-config)

(defenterprise workspace-mode?
  "EE impl: true iff this instance is running in workspace mode (a `:workspace`
   section was loaded from `config.yml` at boot). Single source of truth for
   gating features that conflict with workspace remapping (DB routing,
   impersonation, writeback, CSV upload, model persistence). Use
   [[db-workspace-schema]] when you need per-database scoping.

   Deliberately ungated on premium features: a workspace child instance bootstraps
   from `config.yml` *before* its token is installed; if the workspace map is
   loaded, we refuse incompatible features regardless of token state."
  :feature :none
  []
  (some? @workspace-instance-config))

(defn db-workspace-schema
  "Return the workspace-isolated output schema name for `db-id` on this instance,
   or nil when this instance is not running a workspace, or the workspace has no
   entry for `db-id`. Reads from the in-process atom populated by `config.yml`."
  [db-id]
  (get-in @workspace-instance-config [:databases db-id :output_schema]))

(defn list-remappings
  "Return all TableRemapping rows, ordered by id."
  []
  (t2/select :model/TableRemapping {:order-by [[:id :asc]]}))
