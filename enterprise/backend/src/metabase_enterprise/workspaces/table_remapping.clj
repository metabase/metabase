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

(defn remap-table
  "Returns `[to-schema to-table-name]` for the canonical `[from-schema from-table-name]`
   pair on `database-id`, or nil if no remapping exists.

   Matches by `(from_schema, from_table_name)` only — `from_db` is ignored. This is
   correct for current production callers (workspace transforms on Postgres-family
   drivers, where `from_db = \"\"` always) and for ClickHouse (where `from_db = \"\"`
   too — its db-name lives in `from_schema`). It is **not yet correct for BigQuery**:
   when BigQuery support lands, callers will need a 4-arg form that filters by `from_db`
   so two projects with same-named datasets don't collide."
  [database-id from-schema from-table-name]
  (when-let [mapping (t2/select-one :model/TableRemapping
                                    :database_id database-id
                                    :from_schema (normalize-level from-schema)
                                    :from_table_name from-table-name)]
    [(:to_schema mapping) (:to_table_name mapping)]))

(defenterprise workspace-remap-schema+name
  "Enterprise impl of the sync hook. Returns `[to-schema to-name]` for the
   isolated warehouse table when a `TableRemapping` row exists — sync asks the
   driver there, while app-db rows keep their logical identity. Deliberately
   ungated on premium features: if rows exist they must be respected, regardless
   of current token state (matches the rationale for
   `reconcile-workspace-database-refs-before-delete!`)."
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
  (into {}
        (map (fn [m]
               [[(:from_db m) (:from_schema m) (:from_table_name m)]
                [(:to_db m) (:to_schema m) (:to_table_name m)]]))
        (t2/select :model/TableRemapping :database_id database-id)))

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

;;; -------------------------------------------- Write API --------------------------------------------

(defn- unique-violation?
  "True if `e` or any cause is a SQL unique-constraint violation. Handles Postgres and H2
   via SQLSTATE `23505` (SQL:2003 standard) and MySQL/MariaDB via SQLSTATE `23000` plus
   vendor error code 1062. Walks past non-matching `SQLException`s in the cause chain so
   a shallow wrap can't mask a deeper constraint violation."
  [^Throwable e]
  (loop [^Throwable cause e]
    (cond
      (nil? cause) false
      (instance? java.sql.SQLException cause)
      (let [sql-ex ^java.sql.SQLException cause]
        (or (case (.getSQLState sql-ex)
              "23505" true
              "23000" (= 1062 (.getErrorCode sql-ex))
              false)
            (recur (.getCause cause))))
      :else (recur (.getCause cause)))))

(mu/defn add-mapping!
  "Insert a single `table_remapping` row.

   Idempotent: a duplicate insert (unique-constraint violation on
   `(database_id, from_db, from_schema, from_table_name)`) is swallowed and the fn
   returns nil. Makes concurrent writers race-free at the DB level — no
   check-then-insert TOCTOU window.

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
  (try
    (t2/insert! :model/TableRemapping
                {:database_id     database-id
                 :from_db         (normalize-level (:db from-spec))
                 :from_schema     (normalize-level (:schema from-spec))
                 :from_table_name (:table from-spec)
                 :to_db           (normalize-level (:db to-spec))
                 :to_schema       (normalize-level (:schema to-spec))
                 :to_table_name   (:table to-spec)})
    (catch Exception e
      (if (unique-violation? e)
        nil
        (throw e)))))

(defn remove-mapping!
  "Remove a remapping row by source `(schema, table-name)`. Matches rows where
   `from_db = \"\"` — the only callers today are Postgres-family drivers and ClickHouse,
   where that always holds."
  [database-id from-schema from-table-name]
  (t2/delete! :model/TableRemapping
              :database_id database-id
              :from_db no-level
              :from_schema (normalize-level from-schema)
              :from_table_name from-table-name))

(defn clear-mappings-for-db!
  "Remove all remappings for a given database."
  [database-id]
  (t2/delete! :model/TableRemapping :database_id database-id))

(defn add-transform-target-mapping!
  "Register a remapping for a transform target on a workspaced database. Resolves the
   destination schema from the database's provisioned `WorkspaceDatabase` row, then
   delegates to [[add-mapping!]] (which is itself idempotent).

   Inputs come from the transform's target — `(from-schema, from-table-name)` strings
   identifying the canonical target the transform was originally configured to write to,
   plus `to-table-name` (typically the same name, but in the workspace schema). The
   transform's actual write goes to `(workspace-schema, to-table-name)`; future reads
   of the canonical pair are redirected via the QP middleware.

   Today's transform path only writes 2-level remappings (schema + table). BigQuery
   transforms will need a separate writer that resolves `:db` from the database row.

   Throws when the database is not workspaced (`ws/db-workspace-schema` returns nil):
   a caller getting here in that case is a programming error — the transform-hook path
   should gate on [[ws/db-workspace-schema]] first."
  [db-id from-schema from-table-name to-table-name]
  (let [workspace-schema (ws/db-workspace-schema db-id)]
    (when-not workspace-schema
      (throw (ex-info "Cannot record transform-target remapping: database is not workspaced"
                      {:db-id db-id
                       :from-schema from-schema
                       :from-table-name from-table-name
                       :to-table-name to-table-name})))
    (add-mapping! db-id
                  {:schema from-schema      :table from-table-name}
                  {:schema workspace-schema :table to-table-name})))
