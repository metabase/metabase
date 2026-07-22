(ns metabase-enterprise.workspaces.table-remapping
  "Internal API for table-to-table remapping. Used by workspace isolation to redirect
   queries from production tables to workspace tables.

   A remapping is a single row in the app-db `table_remapping` table, consulted by the
   query processor middleware at query time.

   ## Public writers

   - [[add-mapping!]] — the writer. Takes `db-id` and two `::table-spec` maps
     (`{:db, :schema, :table}`). Idempotent on the unique constraint.
   - [[add-transform-target-mapping!]] — transform-hook integration for rewriting a
     transform target to a workspace schema. Resolves the workspace output schema from
     the database's provisioned `WorkspaceDatabase` row and delegates to [[add-mapping!]].

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
   [clojure.set :as set]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.models.table-remapping]
   [metabase-enterprise.workspaces.remapping.core :as ws.remapping]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util :as u]
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

(defn db-position-value
  "Value to put in the `:db` slot for `database`. Convenience accessor over
   [[ws/engine-namespace-positions]]. Only meaningful for drivers whose
   `qualified-name-components` includes `:db`."
  [database]
  (:db (ws/engine-namespace-positions database)))

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
  (let [components (set (driver/qualified-name-components (:engine database)))
        positions  (ws/engine-namespace-positions database table)]
    {:db     (normalize-level (when (:db components)     (:db positions)))
     :schema (normalize-level (when (:schema components) (:schema positions)))
     :table  (:name table)}))

(defn- short-hash
  "Short, stable, identifier-safe hash of `s`. Used as a disambiguating suffix
   when [[remapped-table-name]] must truncate to fit a driver's identifier limit.

   Uses base36 (`0-9a-z`) over the leading bytes of SHA-1: ~5.17 bits per character,
   versus hex's 4. Eight base36 chars carry ~41 bits of entropy; 2^41 inputs are
   needed for a ~50% birthday collision, which is well past any realistic per-database
   table count. The alphabet is unquoted-identifier-safe on every supported warehouse
   (base64 / base64-url include `+`, `/`, or `-` which are not)."
  [^String s]
  (let [md     (java.security.MessageDigest/getInstance "SHA-1")
        bytes  (.digest md (.getBytes s "UTF-8"))
        ;; First 8 bytes -> non-negative BigInteger (sign byte = 1).
        bi     (java.math.BigInteger. 1 ^bytes (java.util.Arrays/copyOfRange bytes 0 8))
        b36    (.toString bi 36)
        padded (str "00000000" b36)]
    ;; Take the rightmost 8 chars so leading-zero values still produce 8 chars.
    (subs padded (- (count padded) 8))))

(defn remapped-table-name-with-limit
  "Implementation of [[remapped-table-name]] taking an explicit `max-bytes`. Exposed so
   tests can exercise the truncation path with a small limit without driver dispatch.
   Production callers should use [[remapped-table-name]] which derives `max-bytes` from
   the driver. Counts and truncates by UTF-8 *bytes*, not characters -- Postgres et al.
   measure their identifier limits in bytes, and a multi-byte schema name (emoji,
   kanji) would overflow under naive char-based truncation. Truncation is codepoint-safe:
   we never split a multi-byte char in the middle."
  [from-spec max-bytes]
  (let [{:keys [schema table]} from-spec
        raw       (str (or schema "") "__" table)
        new-table (if (<= (u/string-byte-count raw) max-bytes)
                    raw
                    (let [suffix    (str "_" (short-hash raw))
                          head-room (max 0 (- max-bytes (u/string-byte-count suffix)))]
                      (str (u/truncate-string-to-byte-count raw head-room) suffix)))]
    (assoc from-spec :table new-table)))

(mu/defn remapped-table-name :- ::table-spec
  "Rewrite `:table` of `from-spec` into a deterministic, collision-resistant
   name suitable for the workspace schema on `driver`. Concatenates
   `:schema` + '__' + `:table` so two source tables with the same `:table`
   under different `:schema` values land at distinct identifiers in the
   single workspace schema (e.g. `schemaA.orders` and `schemaB.orders`
   become `schemaA__orders` and `schemaB__orders`).

   Honors `(driver/table-name-length-limit driver)` -- when the
   concatenation exceeds the limit (measured in UTF-8 bytes, since that is
   what every supported warehouse counts), truncates and appends an 8-char
   base36 SHA-1 suffix of the full original concatenation so distinct
   inputs stay distinct after truncation. Truncation is codepoint-safe.
   Leftward slots (`:db`, `:schema`) are not modified here; callers
   `assoc` the workspace schema themselves.

   Note: MySQL has no schema dimension (`qualified-name-components` is `[]`),
   so cross-schema collisions cannot occur there. The function still runs and
   produces `\"__<table>\"` (empty prefix) for consistency across drivers."
  [driver    :- :keyword
   from-spec :- ::table-spec]
  (remapped-table-name-with-limit
   from-spec
   (or (driver/table-name-length-limit driver) Integer/MAX_VALUE)))

;;; ---------------------------------- canonical / isolated translators ----------------------------------

(mu/defn canonical->isolated :- [:maybe ::table-spec]
  "Look up the isolated `::table-spec` for canonical `table` in `remappings`. Returns
   nil when no remap exists.

   Driver-aware projection: only the slots `(qualified-name-components driver)`
   plus `:table` participate in the match. Slots the driver doesn't emit (e.g. `:db`
   on Postgres) are ignored even if present on `table` or on the remapping keys, so
   the empty-string sentinel can't cause a false miss."
  [driver     :- :keyword
   remappings :- [:map-of ::table-spec ::table-spec]
   table      :- ::table-spec]
  (let [target-keys       (into [:table] (driver/qualified-name-components driver))
        driver-remappings (update-keys remappings #(select-keys % target-keys))]
    (get driver-remappings (select-keys table target-keys))))

(mu/defn isolated->canonical :- [:maybe ::table-spec]
  "Inverse of [[canonical->isolated]]: look up the canonical `::table-spec` for an
   isolated `table` in `remappings`."
  [driver     :- :keyword
   remappings :- [:map-of ::table-spec ::table-spec]
   table      :- ::table-spec]
  (canonical->isolated driver (set/map-invert remappings) table))

;;; -------------------------------------------- Read API --------------------------------------------
;;;
;;; All reads route through the active store ([[ws.remapping/*remapping-store*]]) so tests
;;; can swap in a [[ws.remapping/map-store]] without app-DB access. The store returns
;;; `{from-spec to-spec}` maps; consumer-facing helpers below project them into the
;;; `:model/Table`-row vocabulary (`{:db :schema :name}` with nil sentinels) where needed.

(defn denormalize-level
  "Inverse of `normalize-level`: `\"\"` (the storage sentinel meaning \"this driver
   doesn't emit this level\") becomes `nil` (what `:model/Table` rows actually carry
   for the same level). Anything else passes through unchanged.

   Public so consumers outside the storage layer (the QP middleware) can apply the
   same `\"\"`/`nil` equivalence without redefining it."
  [v]
  (when-not (or (nil? v) (= no-level v)) v))

(defn prune-no-level
  "Remove map keys whose values are the storage `\"\"` sentinel. Used by callers
   that need to drop absent slots before passing the map to a downstream tool
   (e.g. SQLGlot's `replace-names` matcher, which treats absent keys as wildcards
   but would match an empty string literally)."
  [m]
  (into {} (remove (fn [[_ v]] (= no-level v))) m))

;;; ----------------------------------------- SQL rewriting -----------------------------------------
;;;
;;; Pure SQL rewrite primitives keyed off `::table-spec`. Pure relative to a `{from-spec to-spec}`
;;; remappings map -- fetched from the active store and passed in. Shared between the QP
;;; middleware Phase 2 rewriter and the native-transform exec hook.

(defn table-spec->sqlglot-key
  "Translate our `::table-spec` (`{:db :schema :table}` with our AST-position vocab,
   where `:db` ↔ `Table.catalog` and `:schema` ↔ `Table.db`) into the slot vocabulary
   `metabase.sql-parsing/replace-names` (SQLGlot) expects.

   SQLGlot's `replace-names` matcher uses `:schema` for the db-position qualifier
   (the leftmost in `db.tbl`) and `:catalog` for the catalog-position (the leftmost
   in `catalog.db.tbl`). Empirically:

     {:db \"x\"         :table \"t\"} -> doesn't match `x.t` on MySQL
     {:schema \"x\"     :table \"t\"} -> matches `x.t` (and `db.x.t`)
     {:catalog \"x\" :db \"y\" :table \"t\"} -> matches `x.y.t`

   The translation:
     - Our `:schema` -> SQLGlot's `:schema` (same name, same slot — unchanged).
     - Our `:db`     -> SQLGlot's `:catalog` *if* `:schema` is also populated
                        (i.e. 3-part SQL Server/BigQuery shape),
                        otherwise SQLGlot's `:schema` (the 2-part MySQL case
                        where our `:db` IS the leftmost qualifier in the SQL).

   `\"\"` sentinels are pruned (`prune-no-level`) so SQLGlot treats absent slots
   as wildcards rather than matching the literal empty string."
  [{:keys [db schema table] :as spec}]
  (let [pruned (prune-no-level spec)
        db?    (contains? pruned :db)
        sch?   (contains? pruned :schema)]
    (cond-> {:table table}
      (and db? sch?) (assoc :catalog db :schema schema)
      (and db? (not sch?)) (assoc :schema db)
      (and (not db?) sch?) (assoc :schema schema))))

(defn build-table-replacements
  "Convert a `{from-spec to-spec}` remappings map into the format expected by
   `sql-tools/replace-names`. SQLGlot handles quoting internally based on the
   dialect, so we pass raw identifiers."
  [remappings]
  (into {}
        (map (fn [[from-spec to-spec]]
               [(table-spec->sqlglot-key from-spec)
                (table-spec->sqlglot-key to-spec)]))
        remappings))

(defn rewrite-sql
  "Parse `sql` and rewrite every table reference whose `(catalog, schema, table)` matches a
   `from-spec` key in `remappings` to its `to-spec` counterpart. Returns the rewritten SQL.

   `remappings` is a `{from-spec to-spec}` map of `::table-spec`s. Caller is responsible for
   fetching it (typically `ws.remapping/remappings-for-db`).

   Fail-closed: throws `ex-info` with `:type qp.error-type/qp` on parse failure. A workspace
   child must not silently pass canonical refs through to the warehouse."
  [driver sql remappings]
  (try
    (let [replacements {:tables (build-table-replacements remappings)}]
      (sql-tools/replace-names driver sql replacements {:allow-unused? true}))
    (catch Exception e
      (throw (ex-info "Workspace table remapping failed: cannot parse SQL"
                      {:type   qp.error-type/qp
                       :sql    sql
                       :driver driver}
                      e)))))

; TODO Is this the same as prune-no-level?
(defn- spec->consumer-shape
  "Project a storage `::table-spec` (`{:db :schema :table}` with `\"\"` sentinels) into
   the consumer-shaped `{:db :schema :name}` map (with `nil` for absent slots). The
   storage sentinel stays below this line; consumers (`:model/Table` predicates,
   transform targets, sync's describe-fields lookups) work with `nil`."
  [{:keys [db schema table]}]
  {:db     (denormalize-level db)
   :schema (denormalize-level schema)
   :name   table})

(defn- consumer-shape->spec
  "Project a `{:db :schema :name}` consumer-shape map into a storage `::table-spec`,
   normalizing nil slots to the empty-string sentinel."
  [{:keys [db schema name]}]
  {:db     (normalize-level db)
   :schema (normalize-level schema)
   :table  name})

(defn- enrich-from-spec
  "Fill identifier slots the driver emits but the caller omitted from `from-spec`.

   Callers in `metabase.sync.fetch-metadata` only carry the `:schema` and `:name`
   they read off the `:model/Table` row — they don't know how to compute `:db`
   for drivers like MySQL (whose canonical namespace is the connection's bound
   database, not the Table's `:schema` column). Use `engine-namespace-positions`
   to derive any missing slot from the `database`, so the driver-aware match in
   `canonical->isolated` doesn't false-miss on a populated remap row."
  [database from-spec]
  (let [positions (ws/engine-namespace-positions database {:name   (:name from-spec)
                                                           :schema (:schema from-spec)})]
    (cond-> from-spec
      (nil? (:db from-spec))     (assoc :db     (:db positions))
      (nil? (:schema from-spec)) (assoc :schema (:schema positions)))))

(defn remap-table
  "Returns `{:db :schema :name}` for the workspace destination of canonical
   `from-spec`, or nil if no remapping exists.

   Called per-table during sync via the `workspace-remap-schema+name` defenterprise hook.
   Uses driver-aware key projection so engines like MySQL (whose canonical/isolated
   tables differ at the `:db` AST position rather than `:schema`) match correctly.

   `from-spec` is `{:db :schema :name}`. Output uses nil-instead-of-empty-string for
   slots the driver doesn't emit."
  [database-id from-spec]
  (when-let [database (t2/select-one :model/Database :id database-id)]
    (let [driver   (keyword (:engine database))
          enriched (enrich-from-spec database from-spec)]
      (some-> (canonical->isolated driver
                                   (ws.remapping/remappings-for-db database-id)
                                   (consumer-shape->spec enriched))
              spec->consumer-shape))))

(defenterprise workspace-remap-schema+name
  "Enterprise impl of the sync hook. Returns `{:db :schema :name}` for the
   isolated warehouse table when a `TableRemapping` row exists — sync asks the
   driver there, while app-db rows keep their logical identity. Deliberately
   ungated on premium features: if rows exist they must be respected, regardless
   of current token state."
  :feature :none
  [db-id from-spec]
  (remap-table db-id from-spec))

(defn all-mappings-for-db
  "Return all remappings for a given database as a map of `from-spec` to `to-spec`,
   each a `::table-spec` (`{:db :schema :table}`).

   Empty-string sentinels in `:db` / `:schema` indicate \"this driver does not emit
   this level\" and should be dropped before being handed to SQLGlot — see
   [[metabase-enterprise.workspaces.query-processor.middleware]]."
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
  ;; Storage rows carry the `""` sentinel for absent slots; sync tuples carry
  ;; `nil` (e.g. MySQL `:schema` is always nil). Denormalize both sides so the
  ;; comparison matches across the boundary.
  (let [to-pairs (into #{}
                       (map (fn [to-spec] [(denormalize-level (:schema to-spec)) (:table to-spec)]))
                       (vals (all-mappings-for-db db-id)))]
    (if (empty? to-pairs)
      tuples
      (into #{} (remove (fn [t] (contains? to-pairs [(denormalize-level (:schema t)) (:name t)]))) tuples))))

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
                         (map (fn [[from-spec to-spec]]
                                [(:schema from-spec) (:schema to-spec)]))
                         (all-mappings-for-db db-id))
          extras   (into #{} (keep from->to) schema-names)]
      (vec (distinct (concat schema-names extras))))))

(defn- iso-db-swap-maps-for-fk-probe
  "Return a seq of swap-maps to apply per `describe-fks` invocation. Each entry is
   either `{:db <iso-db>}` (run describe-fks with the JDBC connection pointed at
   that iso DB) or nil (run with no swap, against the canonical connection).

   When the database has any active remap rows whose `to_db` differs from the
   canonical bound database (today: MySQL workspaces with cross-DB swaps), return
   only the iso swap-maps -- on a workspace child the canonical DB holds no real
   tables, so probing it would waste a round-trip and the rows it returns wouldn't
   correspond to any `:model/Table`. Otherwise return a single nil entry so the
   probe runs once against the canonical connection, preserving non-workspace
   behavior.

   3-slot engines (BigQuery, SQL Server) populate `:db` on both sides of the
   remap row but the canonical `:db` already routes through the existing
   connection, so the iso `:db` matches canonical and this collapses to the
   single-canonical-run path."
  [db-id]
  (let [database     (t2/select-one :model/Database :id db-id)
        canonical-db (-> database :details :db)
        iso-dbs      (into #{}
                           (comp (map (comp denormalize-level :db second))
                                 (remove nil?)
                                 (remove #(= % canonical-db)))
                           (all-mappings-for-db db-id))]
    (if (seq iso-dbs)
      (map (fn [iso-db] {:db iso-db}) iso-dbs)
      [nil])))

(defenterprise call-with-fk-probe-iso-dbs
  "Enterprise impl: invoke `f` once for the canonical bound DB, then once for each
   distinct iso `:db` differing from the canonical, each iteration inside a
   `with-swapped-connection-details` scope. Returns a vector of `f`'s results so
   the caller can concatenate row batches before back-translation.

   Cross-DB MySQL workspaces store the iso table in a different bound database
   than the canonical one. Without a per-iso-DB describe-fks call, the JDBC
   connection only ever talks to the canonical DB and the iso DB's FK rows go
   undiscovered."
  :feature :none
  [db-id f]
  (mapv (fn [swap-map]
          (if swap-map
            (driver.conn/with-swapped-connection-details db-id swap-map
              (f))
            (f)))
        (iso-db-swap-maps-for-fk-probe db-id)))

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
  ;; Storage rows carry the `""` sentinel for absent slots; the sync diff
  ;; matches against `nil`-schema tuples on schema-less drivers (MySQL). Use
  ;; `denormalize-level` so synthetic tuples match the diff key shape.
  (let [mappings (all-mappings-for-db db-id)]
    (if (empty? mappings)
      tuples
      (let [synthetic (into #{}
                            (map (fn [[from-spec _]]
                                   {:schema (denormalize-level (:schema from-spec))
                                    :name   (:table from-spec)}))
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
  ;; Storage `:schema` is the `""` sentinel for absent slots; FK-result rows
  ;; carry `nil` on schema-less drivers (MySQL). Denormalize on both sides of
  ;; the lookup so the rewrite matches across the boundary. Output `:schema`
  ;; values come from the canonical from-spec — also denormalized.
  (let [to->from (into {}
                       (map (fn [[from-spec to-spec]]
                              [[(denormalize-level (:schema to-spec)) (:table to-spec)]
                               [(denormalize-level (:schema from-spec)) (:table from-spec)]]))
                       (all-mappings-for-db db-id))]
    (if (empty? to->from)
      rows
      (mapv (fn [row]
              (let [fk-key [(denormalize-level (:fk-table-schema row)) (:fk-table-name row)]
                    pk-key [(denormalize-level (:pk-table-schema row)) (:pk-table-name row)]]
                (cond-> row
                  (contains? to->from fk-key)
                  (assoc :fk-table-schema (first (to->from fk-key))
                         :fk-table-name   (second (to->from fk-key)))
                  (contains? to->from pk-key)
                  (assoc :pk-table-schema (first (to->from pk-key))
                         :pk-table-name   (second (to->from pk-key))))))
            rows))))

(defenterprise canonical-schema+name
  "Enterprise impl: invert an active workspace remapping. Given a workspace-side
   `to-spec` (`{:db :schema :name}`), return a `{:db :schema :name}` map for the
   canonical table if a TableRemapping row records that pair as the destination
   of a canonical table; nil otherwise. Mirror of `workspace-remap-schema+name`
   for write-side paths that already have the rewritten target on hand and need
   the canonical slot before touching `:model/Table` rows.

   Driver-aware: matches against the slots the driver actually emits, so an
   engine like MySQL (whose canonical and isolated tables differ at `:db` rather
   than `:schema`) inverts correctly. Output `:db` / `:schema` slots are nil
   when the driver doesn't populate them, so the empty-string sentinel never
   leaks above this boundary."
  :feature :none
  [db-id to-spec]
  (when-let [driver (some-> (t2/select-one [:model/Database :engine] :id db-id) :engine keyword)]
    (some-> (isolated->canonical driver
                                 (all-mappings-for-db db-id)
                                 (consumer-shape->spec to-spec))
            spec->consumer-shape)))

(defenterprise call-with-display-context
  "Enterprise impl: bind `ws.remapping/*skip-remapping?*` true around `thunk` so Phase 1
   (metadata override) and Phase 2 (SQLGlot rewrite) both short-circuit. For display
   paths that want users to see canonical SQL instead of the isolation schema.
   Deliberately ungated on premium features."
  :feature :none
  [thunk]
  (binding [ws.remapping/*skip-remapping?* true]
    (thunk)))

;;; -------------------------------------------- Write API --------------------------------------------
;;;
;;; The convenience layer over [[metabase-enterprise.workspaces.remapping.core]]. Accepts
;;; `::table-spec` maps, normalizes `nil`/missing slots to the `""` sentinel, hands them
;;; to the active store. The store handles persistence (Toucan2 against
;;; `:model/TableRemapping` in production, atom in tests).
;;;
;;; Public callers should reach for these wrappers, NOT the raw store -- the wrappers
;;; enforce the `::table-spec` contract and the sentinel normalization at the boundary.

(defn- normalize-spec
  "Coerce nil `:db` / `:schema` slots to the empty-string sentinel so storage rows
   carry the canonical shape the unique constraint expects."
  [spec]
  (-> spec
      (update :db     normalize-level)
      (update :schema normalize-level)))

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
  (ws.remapping/insert-mapping! database-id (normalize-spec from-spec) (normalize-spec to-spec)))

(mu/defn remove-mapping!
  "Remove a remapping row by source `from-spec`. Returns the number of rows removed (0 or 1)."
  [database-id :- :int
   from-spec   :- ::table-spec]
  (ws.remapping/remove-mapping! database-id (normalize-spec from-spec)))

(defn clear-mappings-for-db!
  "Remove all remappings for a given database. Returns the number of rows removed."
  [database-id]
  (ws.remapping/clear-for-db! database-id))

(defn add-transform-target-mapping!
  "Register a remapping for a transform target on a workspaced database. The from-side spec
   is normalized via [[spec-for-table]] so it carries the right slots for the driver
   (e.g., 3-slot for SQL Server/BigQuery, 2-slot for Postgres/ClickHouse,
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
   - To-side: workspace output namespace comes from `ws/db-workspace-namespace`,
     a `{:db ?, :schema ?}` map sourced from `config.yml`. The `:db` and
     `:schema` slots both flow into the `TableRemapping` row's `to_db` /
     `to_schema` columns - so cross-DB SQL Server / BigQuery workspaces are
     now expressible end-to-end.

   Returns the to-side as a denormalized `{:db :schema :name}` map (consumer
   shape: `nil` for slots the driver doesn't fill, string otherwise). The
   storage layer's `\"\"` sentinel never leaks above this boundary, so the value
   can be `assoc`ed onto a transform target without a per-call denormalization shim.

   Throws when the database is not workspaced -- reaching this with a non-workspaced
   db is a programming error; gate on [[ws/db-workspace-namespace]] first."
  [db-id target]
  (let [workspace-ns (ws/db-workspace-namespace db-id)]
    (when-not workspace-ns
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
          ;; To-side: rename via [[remapped-table-name]] so two source tables sharing a
          ;; name across different schemas (schemaA.orders vs schemaB.orders) land at
          ;; distinct warehouse identifiers in the single workspace namespace. Both :db
          ;; and :schema slots come from `db-workspace-namespace` so cross-DB workspaces
          ;; (SQL Server / BigQuery) get full namespace remapping. Slots not
          ;; populated by the workspace config are normalized to "" via `normalize-level`
          ;; so the storage row's unique constraint stays enforceable.
          to-spec      (-> (remapped-table-name (:engine database) from-spec)
                           (assoc :db     (normalize-level (:db workspace-ns))
                                  :schema (normalize-level (:schema workspace-ns))))]
      (add-mapping! db-id from-spec to-spec)
      ;; Hand callers the denormalized shape so storage's `""` sentinel stays
      ;; below the line. Symmetric with the read hooks (`workspace-remap-schema+name`,
      ;; `canonical-schema+name`) which also denormalize at the boundary.
      (spec->consumer-shape to-spec))))
