(ns metabase.workspaces.core
  "Hooks for workspace mode, the sidecar state in which remapping is on.

  A workspace maps each main schema of a database to its own scratch namespace. A transform that targets a main table
  writes to the scratch namespace instead and records a remapping, and reads of that main table go to the scratch table
  while content keeps naming the main one. The EE module implements the hooks; every EE implementation returns the OSS
  value without touching the app DB unless [[workspace-mode?]] is true, so an instance that doesn't use workspaces pays
  nothing for them.

  Remappings are `{from-spec to-spec}` maps of `{:schema :table}` specs, the shape `metabase.sql-tools.core/replace-names`
  takes for table replacements."
  (:require
   [clojure.set :as set]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.malli.registry :as mr]))

(mr/def ::table-spec
  "A table as a remapping names it: its schema (nil for a driver without schemas) and its name."
  [:map {:closed true}
   [:schema [:maybe :string]]
   [:table  :string]])

(mr/def ::remappings
  "Main table -> the scratch table that backs it, for one database."
  [:map-of ::table-spec ::table-spec])

(mr/def ::schema-map
  "Main schema -> the scratch namespace a workspace maps it to, for one database."
  [:map-of :string :string])

(defenterprise workspace-mode?
  "True if this instance is a workspace sidecar: a workspace is installed, so transforms write to scratch namespaces and
  reads of remapped tables go there."
  metabase-enterprise.workspaces.core
  []
  false)

(defenterprise table-remappings
  "The [[::remappings]] recorded for the database with id `database-id`, or nil when there are none or this instance is
  not in workspace mode."
  metabase-enterprise.workspaces.core
  [_database-id]
  nil)

(defenterprise workspace-schemas
  "The [[::schema-map]] the installed workspace gives `database` (matched on its `:name`), or nil when `database` is
  not part of a workspace."
  metabase-enterprise.workspaces.core
  [_database]
  nil)

(defenterprise resolve-transform-target
  "The target a transform targeting `target` on the database with id `database-id` writes to. In workspace mode that is
  the same table in the scratch namespace mapped to the target's schema; a schema the workspace does not map is
  refused. Otherwise `target` itself. Records nothing: see [[record-transform-output!]]."
  metabase-enterprise.workspaces.core
  [_database-id target]
  target)

(defenterprise record-transform-output!
  "Called once a transform has written `target` (as [[resolve-transform-target]] returned it) on the database with id
  `database-id`. In workspace mode, records that the main table now lives in the scratch namespace, so reads of the
  main table go there. Recording only after the write succeeds keeps a failed run from pointing reads at a scratch
  table that does not exist."
  metabase-enterprise.workspaces.core
  [_database-id _target]
  nil)

(defenterprise transform-output-to-drop
  "The table to drop when deleting the output of a transform that targets `target` on the database with id
  `database-id`. In workspace mode that is the scratch table; a schema the workspace does not map is refused, so the
  main table is never dropped. Otherwise `target` itself. Call [[forget-transform-output!]] once it is dropped."
  metabase-enterprise.workspaces.core
  [_database-id target]
  target)

(defenterprise forget-transform-output!
  "Called once the output of a transform that targets `target` has been dropped. In workspace mode, deletes the
  remapping of `target`'s main table, so reads of it go to the main table again."
  metabase-enterprise.workspaces.core
  [_database-id _target]
  nil)

(defenterprise rewrite-sql
  "Rewrite every reference in `sql` to a main table in `remappings` to its scratch table. Throws when `sql` can't be
  parsed, so a query that might read a main table it should not never runs. Only called with remappings, which only
  exist in workspace mode; without the EE implementation it refuses."
  metabase-enterprise.workspaces.core
  [_driver _remappings _sql]
  (throw (ex-info "Workspace remapping is not available on this instance." {})))

;;; ------------------------------------------------- Pure helpers ---------------------------------------------------

(defn canonical-target
  "`target` (a map with `:schema`) with a scratch namespace in `schema-map` swapped back for its main schema; the app DB
  names a transform's output by its main table. `target` unchanged when its schema is not a scratch namespace."
  [schema-map target]
  (if-let [main-schema (get (set/map-invert schema-map) (:schema target))]
    (assoc target :schema main-schema)
    target))

(defn scratch-target
  "`target` (a map with `:schema`) moved to the scratch namespace `schema-map` maps its schema to: where a workspace
  writes it. `target` unchanged when its schema is not mapped."
  [schema-map target]
  (if-let [scratch (get schema-map (:schema target))]
    (assoc target :schema scratch)
    target))

(defn remapped-table
  "`table` (a map with `:schema` and `:name`) moved to the scratch table that backs it in `remappings`, or nil when it
  is not remapped."
  [remappings table]
  (when-let [{:keys [schema], to-name :table} (get remappings {:schema (:schema table), :table (:name table)})]
    (assoc table :schema schema :name to-name)))

(defn workspace-tables-xf
  "Transducer over the tables a driver describes for a workspace database. Scratch tables are dropped, except a scratch
  table that backs a remapped main table, which is reported under the main table's name; the main table itself is
  dropped, so a remapped table exists exactly as long as its scratch table does."
  [schema-map remappings]
  (let [scratch-namespaces (set (vals schema-map))
        canonical          (set/map-invert remappings)]
    (keep (fn [table]
            (let [spec {:schema (:schema table), :table (:name table)}]
              (cond
                (contains? canonical spec)
                (let [{:keys [schema], main-name :table} (canonical spec)]
                  (assoc table :schema schema :name main-name))

                (or (contains? scratch-namespaces (:schema table))
                    (contains? remappings spec))
                nil

                :else
                table))))))
