(ns metabase-enterprise.workspaces.table-remapping
  "Internal API for table-to-table remapping. Used by workspace isolation to redirect
   queries from production tables to workspace tables.

   A remapping is a single row in the app-db `table_remapping` table, consulted by the
   query processor middleware at query time.

   ## Public writers

   - [[add-mapping!]] — the writer. Takes `db-id` and two `::table-spec` maps
     (`{:db, :schema, :table}`). Idempotent on the unique constraint.
   - [[add-transform-target-mapping!]] — transform-hook integration. Called when a
     transform target is rewritten to a workspace schema; resolves the workspace output
     schema from the database's provisioned `WorkspaceDatabase` row and delegates to
     [[add-mapping!]]. Used by [[metabase-enterprise.workspaces.transform-hooks]].

   Callers with `:model/Database` and `:model/Table` rows can produce a `::table-spec`
   via [[spec-for-table]] and hand it to [[add-mapping!]] directly.

   ## Three-level identifiers

   `:model/TableRemapping` rows have three identifier columns per side: `db`, `schema`,
   `table_name`. Slot names are SQLGlot **AST positions**, not warehouse vocabulary:
   `:db` ↔ `Table.catalog`, `:schema` ↔ `Table.db`, `:table` ↔ `Table.name`. A driver
   populates a slot iff its [[metabase.driver/qualified-name-components]] includes it.

   | Driver                              | db          | schema       | table_name |
   |-------------------------------------|-------------|--------------|------------|
   | Postgres / Redshift / H2            | \"\"        | schema       | table      |
   | MySQL                               | \"\"        | \"\"         | table      |
   | ClickHouse                          | \"\"        | db-name      | table      |
   | Snowflake                           | database    | schema       | table      |
   | SQL Server                          | database    | schema       | table      |
   | BigQuery                            | project     | dataset      | table      |
   | Mongo                               | \"\"        | \"\"         | collection |

   ClickHouse calls its top level a \"database\" but it lives at AST `:schema` because
   that's where it appears in compiled SQL (`db.table`). The slot name follows the AST
   position, not what the warehouse vendor calls the level.

   Empty string (`\"\"`) is the sentinel for \"this driver does not emit this level.\"
   Empty string is preferred over `nil` because Postgres/MySQL/H2 treat NULL as
   not-equal-to-NULL in unique indexes — using `\"\"` keeps the
   `(database_id, db, schema, table_name)` unique constraint enforceable across DBs.
   The QP rewriter filters `\"\"` out before handing keys to SQLGlot.

   [[spec-for-table]] uses [[metabase.driver/qualified-name-components]] to fill the
   right slots from a `:model/Database` and `:model/Table` row."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.models.table-remapping]
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase.driver :as driver]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------- Schemas + sentinel -----------------------------------------

(def ^:private no-level
  "Sentinel string stored in `from_db` / `from_schema` / `to_db` / `to_schema` when the
   driver does not emit that identifier level. See namespace docstring."
  "")

(defn- normalize-level
  "Coerce a possibly-nil identifier-level value to the empty-string sentinel."
  [v]
  (or v no-level))

(mr/def ::table-spec
  "A driver-resolved table identifier. `:table` is required; `:schema` and `:db` default
   to the empty-string sentinel when absent. Produced by [[spec-for-table]] and consumed
   by [[add-mapping!]]."
  [:map
   [:table  :string]
   [:schema {:optional true} [:maybe :string]]
   [:db     {:optional true} [:maybe :string]]])

;;; ---------------------------------------- Driver-aware resolution ----------------------------------------

(defn- schema-position-value
  "Value to put in the `:schema` slot of a `::table-spec` for a Table row in `database`.
   Most drivers use the table's own `:schema` column. ClickHouse-style drivers don't
   have warehouse schemas — what they call \"database\" sits at the schema position in
   compiled SQL, so we read it from `database.:name` instead."
  [database table]
  (case (:engine database)
    :clickhouse (:name database)
    (:schema table)))

(defn- db-position-value
  "Value to put in the `:db` slot of a `::table-spec` for a Table row in `database`.
   Today only BigQuery emits a catalog-level identifier in compiled SQL — the project
   ID, sourced from connection details.

   Returns nil when the driver has no catalog level OR when a BigQuery connection
   doesn't carry an explicit `:project-id`. Service-account-derived projects are not
   resolved here — that lives in `bigquery.common/database-details->credential-project-id`
   which we can't reach from this module without a circular dep. When BigQuery
   workspace remapping lands, route through a driver multimethod instead."
  [database]
  (case (:engine database)
    :bigquery-cloud-sdk (:project-id (:details database))
    nil))

(mu/defn spec-for-table :- ::table-spec
  "Return `{:db, :schema, :table}` for `table` in `database`, populating only the
   identifier positions the driver emits per [[metabase.driver/qualified-name-components]].
   Absent positions are normalized to the empty-string sentinel.

   `database` is a `:model/Database` row (must have `:engine`, `:name`, `:details`).
   `table` is a `:model/Table` row (must have `:name` and `:schema`).

     (spec-for-table {:engine :postgres, :name \"db\"} {:name \"orders\", :schema \"public\"})
     ;; => {:db \"\", :schema \"public\", :table \"orders\"}

     (spec-for-table {:engine :clickhouse, :name \"analytics\"} {:name \"orders\", :schema nil})
     ;; => {:db \"\", :schema \"analytics\", :table \"orders\"}

     (spec-for-table {:engine :bigquery-cloud-sdk, :details {:project-id \"p\"}}
                     {:name \"orders\", :schema \"ds\"})
     ;; => {:db \"p\", :schema \"ds\", :table \"orders\"}"
  [database :- [:map [:engine :keyword]]
   table    :- [:map [:name :string]]]
  (let [components (set (driver/qualified-name-components (:engine database)))]
    {:db     (normalize-level (when (:db components) (db-position-value database)))
     :schema (normalize-level (when (:schema components) (schema-position-value database table)))
     :table  (:name table)}))

;;; -------------------------------------------- Read API --------------------------------------------
;;;
;;; All reads route through the active store ([[ws.remapping/*remapping-store*]]) so tests
;;; can swap in a [[ws.remapping/map-store]] without app-DB access. The store always returns
;;; canonical 3-tuple shapes; the helpers below project them into the various per-call shapes
;;; production callers want.

(defn remap-table
  "Returns `[to-schema to-table-name]` for the canonical `[from-schema from-table-name]`
   pair on `database-id`, or nil if no remapping exists.

   **Hot path** -- called per-table during sync via the `workspace-remap-schema+name`
   defenterprise hook. Routes through the store's targeted [[ws.remapping/get-mapping]]
   so the AppDB impl uses an indexed select-one (matches the unique constraint on
   `(database_id, from_db, from_schema, from_table_name)`) and the MapStore impl is a
   hash-map get. O(1) per call.

   Matches by `(from_schema, from_table_name)` only -- `from_db` is hardcoded to the
   `\"\"` sentinel. Correct for current production callers: Postgres-family drivers
   (where `from_db = \"\"` always) and ClickHouse (where `from_db = \"\"` too -- its
   db-name lives in `from_schema`). **Not yet correct for BigQuery**: when BigQuery
   workspaces land, callers will need a 4-arg form that filters by `from_db` so two
   projects with same-named datasets don't collide."
  [database-id from-schema from-table-name]
  (when-let [[_to-db to-schema to-table]
             (ws.remapping/get-mapping database-id [no-level (normalize-level from-schema) from-table-name])]
    [to-schema to-table]))

(defenterprise workspace-remap-schema+name
  "Enterprise impl of the sync hook. Returns `[to-schema to-name]` for the
   isolated warehouse table when a `TableRemapping` row exists — sync asks the
   driver there, while app-db rows keep their logical identity. Deliberately
   ungated on premium features: if rows exist they must be respected, regardless
   of current token state."
  :feature :none
  [db-id schema table-name]
  (remap-table db-id schema table-name))

(defn all-mappings-for-db
  "Return all remappings for a given database as a map of
   `[from-db, from-schema, from-table-name]` -> `[to-db, to-schema, to-table-name]`.

   Each tuple is 3-wide so QP middleware can handle drivers across all cardinalities
   uniformly. Empty-string sentinels in `from-db`/`to-db`/`from-schema`/`to-schema`
   indicate \"this driver does not emit this level\" and should be dropped before being
   handed to SQLGlot — see [[metabase-enterprise.workspaces.query-processor.middleware]]."
  [database-id]
  (ws.remapping/remappings-for-db database-id))

(defenterprise filter-workspace-side-tables
  "Enterprise impl of the table-list filter. Drops tuples whose `(schema, name)`
   matches the to-side of any active `TableRemapping` row for `db-id`. Workspace
   isolation tables show up in `describe-database` because the connection has
   GRANT on the isolation schema, but they must not become `:model/Table` rows —
   canonical Tables back them via remap. Like the read-side hook, deliberately
   ungated on premium features: if rows exist, the filter must apply. See DEV-1898."
  :feature :none
  [tuples db-id]
  (let [to-pairs (into #{}
                       (map (fn [[_to-db to-schema to-name]] [to-schema to-name]))
                       (vals (all-mappings-for-db db-id)))]
    (if (empty? to-pairs)
      tuples
      (into #{} (remove (fn [t] (contains? to-pairs [(:schema t) (:name t)]))) tuples))))

(defenterprise expand-schema-names-with-workspace
  "Enterprise impl: augment a `:schema-names` list with `to_schema` values for
   any active remap row whose `from_schema` matches one of the input schemas.
   Lets sync's FK fetch reach the workspace-isolated warehouse tables that
   physically back canonical Tables on a workspace child."
  :feature :none
  [schema-names db-id]
  (if (empty? schema-names)
    schema-names
    (let [from->to (into {}
                         (map (fn [[[_from-db from-schema _from-name]
                                    [_to-db to-schema _to-name]]]
                                [from-schema to-schema]))
                         (all-mappings-for-db db-id))
          extras   (into #{} (keep from->to) schema-names)]
      (vec (distinct (concat schema-names extras))))))

(defenterprise inject-workspace-canonical-tuples
  "Enterprise impl: augment a `describe-database` result with synthetic
   canonical-side `(from_schema, from_table_name)` tuples for every active
   remap row. Without this, `sync-tables-and-database!` would diff app-db's
   canonical Table rows against a `describe-database` result that excludes
   them (the canonical name only exists virtually, backed by the workspace
   warehouse table). The diff would then retire those rows on every sync.

   Adds one synthetic tuple per remap row, whether or not the canonical
   tuple is already present (`into` deduplicates; tuples are equal by value).
   Tuples carry only `:schema` and `:name` -- the only fields the
   `sync-tables-and-database!` diff keys on."
  :feature :none
  [tuples db-id]
  (let [mappings (all-mappings-for-db db-id)]
    (if (empty? mappings)
      tuples
      (let [synthetic (into #{}
                            (map (fn [[[_from-db from-schema from-name] _]]
                                   {:schema from-schema :name from-name}))
                            mappings)]
        (into tuples synthetic)))))

(defenterprise rewrite-fk-result-canonical
  "Enterprise impl: walk an FK-result collection, rewriting workspace-side
   `(schema, name)` pairs back to canonical `(from_schema, from_table_name)`
   on both fk-side and pk-side. Rows whose pairs don't match any active
   `to_*` tuple pass through unchanged — used for FKs to non-remapped tables
   and for the legacy `describe-table-fks` fallback whose fk-side is already
   canonical."
  :feature :none
  [rows db-id]
  (let [to->from (into {}
                       (map (fn [[[_from-db from-schema from-name]
                                  [_to-db to-schema to-name]]]
                              [[to-schema to-name] [from-schema from-name]]))
                       (all-mappings-for-db db-id))]
    (if (empty? to->from)
      rows
      (mapv (fn [row]
              (let [fk-key [(:fk-table-schema row) (:fk-table-name row)]
                    pk-key [(:pk-table-schema row) (:pk-table-name row)]]
                (cond-> row
                  (contains? to->from fk-key)
                  (assoc :fk-table-schema (first (to->from fk-key))
                         :fk-table-name   (second (to->from fk-key)))
                  (contains? to->from pk-key)
                  (assoc :pk-table-schema (first (to->from pk-key))
                         :pk-table-name   (second (to->from pk-key))))))
            rows))))

(defenterprise canonical-schema+name
  "Enterprise impl: invert an active workspace remapping. Given a
   workspace-side `(to-schema, to-name)` pair, return `[from-schema from-name]`
   when a TableRemapping row records that pair as the destination of a canonical
   table; nil otherwise. Mirror of `workspace-remap-schema+name` for write-side
   callers that already have the rewritten target on hand and need the canonical
   slot before touching `:model/Table` rows.

   `:db` slot is intentionally ignored on both sides today (matches the
   Postgres-shaped to-side `add-transform-target-mapping!` writes — H7
   second half pending). When that lands, both this lookup and the
   `to->from` index must widen to 3-tuples."
  :feature :none
  [db-id schema table-name]
  (let [to->from (into {}
                       (map (fn [[[_from-db from-schema from-name]
                                  [_to-db to-schema to-name]]]
                              [[to-schema to-name] [from-schema from-name]]))
                       (all-mappings-for-db db-id))]
    (to->from [schema table-name])))

(defenterprise call-with-display-context
  "Enterprise impl: bind `ws.remapping/*skip-remapping?*` true around `thunk` so Phase 1
   (metadata override) and Phase 2 (SQLGlot rewrite) both short-circuit. Used by display
   paths (e.g. the QB's `POST /api/dataset/native` SQL preview) so users see canonical
   SQL instead of the isolation schema. Deliberately ungated on premium features."
  :feature :none
  [thunk]
  (binding [ws.remapping/*skip-remapping?* true]
    (thunk)))

;;; -------------------------------------------- Write API --------------------------------------------
;;;
;;; The convenience layer over [[metabase-enterprise.workspaces.remapping.core]]. Accepts
;;; `::table-spec` maps, normalizes `nil`/missing slots to the `""` sentinel, hands
;;; pre-normalized 3-tuples to the active store. The store handles persistence
;;; (Toucan2 against `:model/TableRemapping` in production, atom in tests).
;;;
;;; Public callers should reach for these wrappers, NOT the raw store -- the wrappers
;;; enforce the `::table-spec` contract and the sentinel normalization at the boundary.

(defn- spec->tuple
  "Normalize a `::table-spec` map to a `[db schema table]` 3-tuple with `\"\"` sentinels.
   The boundary between user-facing maps and the store's tuple shape."
  [spec]
  [(normalize-level (:db spec))
   (normalize-level (:schema spec))
   (:table spec)])

(mu/defn add-mapping!
  "Idempotently ensure a remapping row exists, via the active store.

   Idempotent on the unique key `(database_id, from_db, from_schema, from_table_name)`:
   a duplicate is a no-op (the existing row is left untouched). Concurrent-insert races
   are handled portably by [[metabase.app-db.core/update-or-insert!]]. Returns truthy when
   the remapping is in place after the call.

   `from-spec` and `to-spec` are `::table-spec` maps. Nil/missing identifier levels
   are normalized to the empty-string sentinel before insert.

     (add-mapping! 6
       {:schema \"my-schema\" :table \"my-table\"}
       {:schema \"new-schema\" :table \"new-table-name\"})

     ;; BigQuery (3-level): include :db
     (add-mapping! 6
       {:db \"proj\" :schema \"ds\" :table \"orders\"}
       {:db \"proj\" :schema \"ws_ds\" :table \"orders\"})"
  [database-id :- :int
   from-spec   :- ::table-spec
   to-spec     :- ::table-spec]
  (ws.remapping/insert-mapping! database-id (spec->tuple from-spec) (spec->tuple to-spec)))

(mu/defn remove-mapping!
  "Remove a remapping row by source `from-spec`. Returns the number of rows removed (0 or 1)."
  [database-id :- :int
   from-spec   :- ::table-spec]
  (ws.remapping/remove-mapping! database-id (spec->tuple from-spec)))

(defn clear-mappings-for-db!
  "Remove all remappings for a given database. Returns the number of rows removed."
  [database-id]
  (ws.remapping/clear-for-db! database-id))

(defn add-transform-target-mapping!
  "Register a remapping for a transform target on a workspaced database. The from-side spec
   is normalized via [[spec-for-table]] so it carries the right slots for the driver
   (e.g., 3-slot for Snowflake/SQL Server/BigQuery, 2-slot for Postgres/ClickHouse,
   1-slot for MySQL). Delegates to [[add-mapping!]] (idempotent on the unique constraint).

   Inputs:
   - `db-id` -- the canonical `:model/Database` id.
   - `target` -- the transform's target map, with `:schema` and `:name` for the canonical
     identifier the transform was configured to write to. Same shape `resolve-transform-target`
     already passes around.

   Resolution:
   - From-side: a synthetic `:model/Database` + `:model/Table` shape is fed through
     `spec-for-table` so `:db` and `:schema` slots are filled per the driver's
     `qualified-name-components`.
   - To-side: workspace output schema comes from `ws/db-workspace-schema`. Today the
     atom only carries `output_schema` (single string), so `:db` is `\"\"` for all drivers.
     When the YAML transmission lands carrying `output_db` for cross-DB workspaces
     (Snowflake/BQ/SQL Server), this can be extended -- see audit H7.

   Throws when the database is not workspaced -- a caller getting here in that case is a
   programming error; the transform-hook path should gate on [[ws/db-workspace-schema]] first."
  [db-id target]
  (let [workspace-schema (ws/db-workspace-schema db-id)]
    (when-not workspace-schema
      (throw (ex-info "Cannot record transform-target remapping: database is not workspaced"
                      {:db-id db-id :target target})))
    (let [database     (or (t2/select-one :model/Database :id db-id)
                           (throw (ex-info "Database not found"
                                           {:db-id db-id :target target})))
          {table-name :name from-schema :schema} target
          ;; Synthesize a :model/Table shape so spec-for-table can populate the canonical
          ;; from-side slots per the driver's qualified-name-components.
          from-table   {:name table-name :schema from-schema}
          from-spec    (spec-for-table database from-table)
          ;; To-side: same :name (transforms today don't rename), workspace schema substituted.
          ;; :db slot stays "" until the atom carries output_db (audit H7 second half).
          to-spec      (assoc from-spec :schema workspace-schema)]
      (add-mapping! db-id from-spec to-spec))))
