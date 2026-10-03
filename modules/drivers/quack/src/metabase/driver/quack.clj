(ns metabase.driver.quack
  "Metabase driver for DuckDB over the Quack RPC protocol.

  Parents on ``:sql-mbql5`` (an abstract child of ``:sql``), so MBQL→native
  SQL compilation goes through the MBQL5 compiler, and the SQL query processor
  + SQL utilities come for free transitively. We supply:

  * query execution (``execute-reducible-query``) over the Quack HTTP protocol,
  * connection check (``can-connect?``),
  * sync (``describe-database*`` / ``describe-fields``) via INFORMATION_SCHEMA
    queries run through our own client,
  * DuckDB type → Metabase base-type mapping, and
  * **federation-aware table qualification** (see ``->honeysql`` for
    ``:metadata/table``) so attached catalogs work in the GUI builder.

  No JDBC, no embedded DuckDB — Metabase talks HTTP to a Quack server.

  SSH tunnels: Metabase's tunnel machinery lives in the ``:sql-jdbc`` layer and
  is only invoked from the JDBC connection-pool path, which this driver never
  enters. To support the bastion feature anyway, we wire the tunnel ourselves
  around each operation via [[with-ssh-tunnel-conn-spec]] (see the dedicated
  section below)."
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.quack.actions] ; loads perform-action!* methods for :quack
   [metabase.driver.quack.client :as quack.client]
   [metabase.driver.quack.conn :as quack.conn]
   [metabase.driver.sql-jdbc :as driver.sql-jdbc]
   [metabase.driver.sql-jdbc.connection.ssh-tunnel :as ssh]
   [metabase.driver.sql.ddl :as sql.ddl]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [mapv some]]))

;; Parents on `:sql-mbql5` (an abstract child of `:sql`), so MBQL→native SQL
;; compilation goes through the MBQL5 path (compile-mbql on MBQL5 stages) rather
;; than the legacy MBQL4 path. This is what opts the driver into MBQL5 — see
;; metabase PR #71439. The :sql parent and all its SQL-QP machinery are still
;; available transitively. Required groundwork for upstream features that gate
;; on MBQL5 (e.g. native GROUPING SETS pivots, PR #76560).
(driver/register! :quack, :parent :sql-mbql5)

;;; Connection-details / tunnel / execution helpers live in
;;; [[metabase.driver.quack.conn]] (split out so quack.actions can share them
;;; without a require cycle). We re-export the ones this file uses as private
;;; aliases for brevity and to keep call sites unchanged.
(def ^:private database->details         quack.conn/database->details)
(def ^:private database->conn-spec       quack.conn/database->conn-spec)
(def ^:private with-ssh-tunnel-conn-spec quack.conn/with-ssh-tunnel-conn-spec)

;;; ---------------------------------------------------------------------------
;;; can-connect?
;;; ---------------------------------------------------------------------------

;; Connect + run `SELECT 1`; true iff the Quack server accepts the token and answers.
;; Tunnel-aware: Metabase calls this directly with the raw (tunnel-bearing) details
;; during connection tests, so the tunnel must be opened here.
(defmethod driver/can-connect? :quack
  [_ details]
  (with-ssh-tunnel-conn-spec details
    (fn [conn-spec] (quack.client/can-connect? conn-spec))))

;;; ---------------------------------------------------------------------------
;;; Query execution
;;; ---------------------------------------------------------------------------

(defn- assert-no-parameters!
  "Reject SQL parameters that cannot be sent separately by the Quack protocol."
  [params]
  (when (seq params)
    (throw (ex-info "The Quack protocol does not support separate parameters"
                    {:type driver-api/qp.error-type.driver
                     :parameter-count (count params)}))))

(defmethod sql.qp/format-honeysql :quack
  [driver honeysql-form]
  ;; Quack sends only SQL text, so use HoneySQL's escaping instead of dropping
  ;; the separate parameter vector at execution time.
  (binding [driver/*compile-with-inline-parameters* true]
    ((get-method sql.qp/format-honeysql :sql) driver honeysql-form)))

(defmethod driver/execute-reducible-query :quack
  ;; Run native SQL over Quack and hand Metabase a reducible row stream. `respond`
  ;; MUST be called synchronously with (respond cols rows); the database is taken
  ;; from the QP metadata provider the query processor sets up.
  ;;
  ;; Tunnel-aware: when an SSH tunnel is configured we open it for the duration of
  ;; the call AND realize all rows before it closes — Metabase reduces `rows`
  ;; *after* `respond` returns, so a lazy reducible would outlive the tunnel.
  ;; Without a tunnel the client's lazy multi-batch reducible is preserved.
  [_driver {{sql :query params :params} :native, :as _outer-query} _context respond]
  (assert-no-parameters! params)
  (let [database (driver-api/database (driver-api/metadata-provider))
        details  (database->details database)
        tunnel?  (boolean (:tunnel-enabled details))
        {:keys [cols rows]}
        (with-ssh-tunnel-conn-spec details
          (fn [conn-spec]
            (let [result (quack.client/execute-query conn-spec sql)]
              (if tunnel?
                (update result :rows #(into [] %))
                result))))
        ;; cols metadata uses snake_case keys (:base_type, :database_type).
        cols-meta {:cols (mapv (fn [c]
                                 {:name          (:name c)
                                  :base_type     (:base-type c)
                                  :database_type (:database-type c)})
                               cols)}]
    (respond cols-meta rows)))

;;; ---------------------------------------------------------------------------
;;; Sync — DuckDB exposes information_schema, so we drive sync with SQL.
;; ---------------------------------------------------------------------------

(defn- run-sql
  "Run `sql` and realize all rows (sync queries are small metadata queries).
  Tunnel-aware: opens an SSH tunnel around the call when `details` enable one,
  and realizes the rows INSIDE the tunnel (via execute-sql!) so the borrowed
  connection is released before the tunnel closes."
  [details sql]
  (with-ssh-tunnel-conn-spec details
    (fn [conn-spec] (:rows (quack.client/execute-sql! conn-spec sql)))))

;; Federation: attached catalogs (pgsrc, mysqlsrc, ...) require 3-part names
;; `<catalog>.<schema>.<table>` in DuckDB. We encode the catalog into the
;; Metabase `:schema` field as `<catalog>.<schema>` for non-native catalogs,
;; and keep the native schema as-is. The `->honeysql` override below splits the
;; compound schema back into a 3-part identifier at SQL-generation time.
(def ^:private metabase-schema-sql
  "Fold a row's catalog + schema into one Metabase `:schema` string. For the
  native catalog (current_database()) keep the plain schema; for attached
  catalogs emit `<catalog>.<schema>` so Metabase addresses them via 3-part
  names. `catalog-col` is the name of the catalog column on whatever
  duckdb_*/information_schema table we're projecting from."
  "CASE WHEN {{catalog-col}} = current_database()
        THEN schema_name
        ELSE {{catalog-col}} || '.' || schema_name
   END")

(defn- schema-sql
  "Substitute the catalog column name into [[metabase-schema-sql]]."
  [catalog-col]
  (str/replace metabase-schema-sql "{{catalog-col}}" catalog-col))

(defmethod driver/describe-database* :quack
  ;; FEDERATION-AWARE + internal-flag filter. We read from `duckdb_tables()` and
  ;; `duckdb_views()` (the doc's native metadata functions) instead of
  ;; `information_schema.tables`: the duckdb_ functions expose a boolean
  ;; `internal` column that lets us exclude system schemas WITHOUT maintaining
  ;; a hardcoded name blocklist — so new internal schemas added by DuckDB core
  ;; or extensions (spatial, httpfs, iceberg, …) are auto-excluded instead of
  ;; silently leaking into Metabase sync.
  ;;
  ;; For attached catalogs (pgsrc, mysqlsrc, ...) the catalog is folded into
  ;; the schema as `<catalog>.<schema>` so Metabase addresses each via 3-part
  ;; names; the native catalog keeps a plain 2-part schema.
  ;; `duckdb_tables()` / `duckdb_views()` are DuckDB's built-in table-returning
  ;; metadata functions; each exposes the boolean `internal` column used in the
  ;; WHERE above (no hardcoded system-schema blocklist to maintain). The
  ;; catalog-folding scheme is explained in [[metabase-schema-sql]].
  [_driver database]
  (let [details (database->details database)
        fold    (schema-sql "database_name")
        rows    (run-sql details
                         (format "SELECT %s AS schema, table_name AS name
                                  FROM duckdb_tables()
                                  WHERE NOT internal
                                  UNION ALL
                                  SELECT %s AS schema, view_name AS name
                                  FROM duckdb_views()
                                  WHERE NOT internal
                                  ORDER BY 1, 2" fold fold))]
    {:tables (for [[schema table] rows]
               {:schema schema :name table})}))

(def ^:private duckdb-type->base-type
  "Read-side mapping from DuckDB's textual data_type (lowercased prefix match)
  to a Metabase base type. Mirrors the clickhouse pattern.

  ORDER MATTERS — the first prefix the lowercased type name starts-with? wins:
  `interval` must precede the integer family (it starts with `int`), and
  `timestamp` must precede `time`. Unsigned integer types (UTINYINT … UHUGEINT)
  start with `u` and don't collide with the signed prefixes; UINTEGER maps to
  :type/BigInteger because its range (0..4294967295) exceeds signed 32-bit."
  [["boolean"   :type/Boolean]
   ;; interval before the integer family: "interval" starts with "int".
   ["interval"  :type/*]
   ["tinyint"   :type/Integer]
   ["smallint"  :type/Integer]
   ["integer"   :type/Integer]
   ["int"       :type/Integer]
   ["bigint"    :type/BigInteger]
   ["hugeint"   :type/BigInteger]
   ["utinyint"  :type/Integer]
   ["usmallint" :type/Integer]
   ["uinteger"  :type/BigInteger]
   ["ubigint"   :type/BigInteger]
   ["uhugeint"  :type/BigInteger]
   ["decimal"   :type/Decimal]
   ["float"     :type/Float]
   ["double"    :type/Float]
   ["real"      :type/Float]
   ["date"      :type/Date]
   ;; timestamp before time: "timestamp" starts with "time".
   ["timestamp" :type/DateTime]
   ["time"      :type/Time]
   ["varchar"   :type/Text]
   ["char"      :type/Text]
   ["text"      :type/Text]
   ["blob"      :type/*]
   ["uuid"      :type/UUID]
   ["list"      :type/Array]
   ["array"     :type/Array]
   ["struct"    :type/Dictionary]
   ["map"       :type/Dictionary]])

(defn- data-type->base-type
  "Map DuckDB's textual data_type (lowercased prefix match) to a Metabase base type."
  [^String data-type]
  (let [s (u/lower-case-en data-type)]
    (or (some (fn [[prefix bt]] (when (str/starts-with? s prefix) bt)) duckdb-type->base-type)
        :type/*)))

(defn- sql-string-literal
  "Single-quote a SQL string literal (escape embedded single quotes by
  doubling them). Used to inline filter values into the metadata queries —
  the Quack client has no parameter-binding channel, so values are inlined."
  ^String [^String s]
  (str "'" (str/replace s "'" "''") "'"))

(defn- in-clause
  "Build a SQL `col IN (...)` predicate from a seq of string values; returns
  nil for an empty seq so callers can thread it through `some->` and elide it
  from the generated WHERE clause."
  [col values]
  (when (seq values)
    (format "%s IN (%s)"
            col
            (str/join ", " (map #(sql-string-literal (str %)) values)))))

(defmethod driver/describe-fields :quack
  ;; Describe fields across all visible tables, with the same catalog-folding
  ;; scheme as describe-database* (schema = `<catalog>.<schema>` for federated
  ;; tables). Uses `duckdb_columns()` + the `internal` flag (see
  ;; describe-database* for why we prefer it over a hardcoded system-schema
  ;; name blocklist).
  ;;
  ;; Also surfaces is_nullable / column_default so the GUI can show nullability
  ;; and defaults (:describe-is-nullable, :describe-default-expr feature flags).
  ;; Note: we do NOT surface is_generated — DuckDB doesn't populate it (always
  ;; NULL), so :describe-is-generated is intentionally not advertised.
  ;;
  ;; FILTER HONORING (THE TRANSFORM FIX): Metabase's sync calls this method
  ;; with `:schema-names ["<schema>"]` and `:table-names ["<table>"]` to
  ;; fetch ONE table's fields (see metabase.sync.fetch-metadata/
  ;; table-fields-metadata). The reference JDBC drivers push these into the
  ;; SQL WHERE clause. If we IGNORE them and return every field of every
  ;; table, Metabase attributes ALL of them to the single table being synced
  ;; and the METABASE_FIELD unique index on (name, table_id) blows up — which
  ;; is exactly the symptom seen when running a transform: the output table's
  ;; sync receives fields from every other table in the database
  ;; (tournament_id, team_id, ...) and fails with a unique-constraint
  ;; violation. So we MUST honor the filters. We wrap the fold CASE in a
  ;; subquery so we can filter on the computed schema alias.
  [_driver database & {:keys [schema-names table-names] :as _opts}]
  (let [details      (database->details database)
        fold         (schema-sql "database_name")
        schema-pred  (some-> (in-clause "schema" schema-names)  (str "AND "))
        table-pred   (some-> (in-clause "name" table-names)    (str "AND "))
        rows (run-sql details
                      (format "SELECT * FROM (
                                 SELECT %s AS schema, table_name AS name,
                                        column_name, data_type,
                                        column_index AS ordinal_position,
                                        NOT is_nullable AS is_not_nullable,
                                        column_default
                                 FROM duckdb_columns()
                                 WHERE NOT internal
                               ) c
                               WHERE %s%sTRUE
                               ORDER BY 1, 2, 5"
                              fold (or schema-pred "") (or table-pred "")))]
    (for [[schema table col data-type pos is-not-nullable column-default] rows]
      (cond-> {:table-schema      schema
               :table-name        table
               :name              col
               :database-type     data-type
               :base-type         (data-type->base-type data-type)
               :database-position pos}
        ;; duckdb_columns.is_nullable is a BOOLEAN: NOT nullable → required.
        (boolean is-not-nullable)  (assoc :database-required true)
        ;; column_default carries the default OR the generated expression (DuckDB
        ;;        doesn't distinguish the two via information_schema, so we surface it
        ;;        for :describe-default-expr but not :database-is-generated).
        (some? column-default)     (assoc :database-default column-default)))))

;;; ---------------------------------------------------------------------------
;;; Federation-aware table qualification
;;; ---------------------------------------------------------------------------
;; Metabase qualifies every identifier (tables AND fields) as `<schema>...`, and
;; our sync stores schema as `<catalog>.<schema>` for non-native catalogs. So we
;; split any identifier component containing a `.` into two at the lowest level
;; (the identifier ->honeysql), which makes DuckDB emit proper 3-part names for
;; both FROM clauses and column references. Native tables have simple schemas
;; (no dot) and pass through unchanged (2-part, resolved via the default catalog).

(defmethod sql.qp/->honeysql [:quack ::h2x/identifier]
  ;; Federation-aware identifier emission. Sync stored federated schemas as
  ;; `<catalog>.<schema>`; split any component containing a `.` so emitted SQL uses
  ;; proper 3-part names for BOTH tables and columns. Native schemas (no dot) pass
  ;; through as 2-part, resolved by DuckDB's default catalog. This is the fix that
  ;; makes the GUI builder work against any attached source.
  [_driver [_tag identifier-type components]]
  (let [components' (vec (mapcat (fn [c]
                                   (if (str/includes? c ".")
                                     (str/split c #"\.")
                                     [c]))
                                 components))]
    (apply h2x/identifier identifier-type components')))

;;; ---------------------------------------------------------------------------
;;; Feature support + misc
;;; ---------------------------------------------------------------------------

(doseq [[feature supported?] {:nested-fields                 false
                              :describe-fields               true
                              :now                           true
                              :set-timezone                  true
                              :convert-timezone              true
                              :split-part                    true
                              :datetime-diff                 true
                              :metadata/key-constraints      true
                              :transforms/table              true
                              :create-or-replace-table       true
                              :rename                        true
                              :atomic-renames                true
                              ;; Opt into model persistence (caching model
                              ;; results into DuckDB tables). :persist-models-enabled
                              ;; is derived from this by the :sql parent.
                              :persist-models                true
                              ;; Uploads: DuckDB accepts CTAS/INSERT/TRUNCATE/
                              ;; ALTER over the Quack client; the upload-type map
                              ;; below maps Metabase inference types to DuckDB.
                              :uploads                       true
                              ;; Auto-PK DISABLED: DuckDB (tested v1.5.4) does NOT
                              ;; implement identity columns — both
                              ;; `GENERATED ALWAYS AS IDENTITY` and
                              ;; `GENERATED BY DEFAULT AS IDENTITY` throw
                              ;; "Constraint not implemented!" at prepare time.
                              ;; A SEQUENCE+DEFAULT workaround works for the
                              ;; DuckDB-native catalog but NOT for federated upload
                              ;; targets (a DuckDB sequence can't back a DEFAULT on
                              ;; a Postgres/MySQL-attached table), so it doesn't
                              ;; generalize. With this off, uploads create a plain
                              ;; table with no _mb_row_id PK — uniform across native
                              ;; + federated. Flip back on (and re-add the
                              ;; :auto-incrementing-int-pk type-spec) once DuckDB
                              ;; ships identity support.
                              :upload-with-auto-pk           false
                              ;; Writeback actions (implicit row CRUD + custom).
                              :actions                       true
                              :actions/data-editing          true
                              :actions/custom                true
                              ;; Pure capability flags — no associated QP method,
                              ;; behavior already backed by DuckDB / inherited
                              ;; from :sql.
                              :metadata/table-existence-check true
                              :uuid-type                      true
                              :identifiers-with-spaces        true
                              :expression-literals            true
                              ;; Cast expressions: inherited from :sql
                              ;; (coerce-integer/coerce-float use h2x/cast with
                              ;; BIGINT/DOUBLE — both valid DuckDB types).
                              :expressions/integer            true
                              :expressions/float              true
                              ;; Sync metadata extras: surfaced from
                              ;; duckdb_columns() in describe-fields below.
                              ;; (Note: DuckDB does NOT populate is_generated, so
                              ;; :describe-is-generated is intentionally NOT advertised.)
                              :describe-is-nullable          true
                              :describe-default-expr         true}]
  (defmethod driver/database-supports? [:quack feature] [_driver _feature _db] supported?))

(defmethod driver/db-default-timezone :quack [_ _] "UTC")

(defmethod driver/db-start-of-week :quack [_] :sunday)

;;; ---------------------------------------------------------------------------
;;; Foreign keys (duckdb_constraints())
;;; ---------------------------------------------------------------------------
;; DuckDB exposes FK metadata via duckdb_constraints(). We query it and map to
;; the ::FKMetadataEntry shape Metabase expects. Federation-aware: FK tables
;; get the same catalog.schema compound schema as describe-database*.

(defmethod driver/describe-fks :quack
  [_driver database & {:keys [schema-names table-names] :as _opts}]
  ;; duckdb_constraints() exposes database_name (no table_catalog); use the
  ;; same catalog-folding CASE as describe-database* so federated FK tables get
  ;; the same compound schema as their describe-database* entry.
  ;;
  ;; Honors :schema-names / :table-names for the FK side, matching the
  ;; describe-fields fix: Metabase's per-table FK sync
  ;; (sync-fks-for-table!) passes :table-names [table-name] and expects only
  ;; that table's FKs back. Without the filter we'd return every FK in the DB
  ;; and rely on Metabase to drop the non-matching ones — wasteful, and
  ;; risky if a same-named table exists in another schema.
  (let [details      (database->details database)
        fold         (schema-sql "c.database_name")
        fk-schema-pred (some-> (in-clause "fk_schema" schema-names) (str "AND "))
        fk-table-pred  (some-> (in-clause "fk_table" table-names)  (str "AND "))
        rows (run-sql details
                      (format "SELECT * FROM (
                                 SELECT %s AS fk_schema, c.table_name AS fk_table,
                                        UNNEST(c.constraint_column_names) AS fk_col,
                                        %s AS pk_schema, c.referenced_table AS pk_table,
                                        UNNEST(c.referenced_column_names) AS pk_col
                                 FROM duckdb_constraints() c
                                 WHERE c.constraint_type = 'FOREIGN KEY'
                               ) f
                               WHERE %s%sTRUE
                               ORDER BY 1, 2, 3"
                              fold fold (or fk-schema-pred "") (or fk-table-pred "")))]
    (for [[fk-schema fk-table fk-col pk-schema pk-table pk-col] rows]
      {:fk-table-schema fk-schema
       :fk-table-name   fk-table
       :fk-column-name  fk-col
       :pk-table-schema pk-schema
       :pk-table-name   pk-table
       :pk-column-name  pk-col})))

;;; ---------------------------------------------------------------------------
;;; Temporal bucketing (date truncation + extraction)
;;; ---------------------------------------------------------------------------
;; DuckDB uses the same date_trunc(unit, expr) / date_part(unit, expr) syntax as
;; Postgres. Modelled on the Postgres driver's implementation but simplified —
;; DuckDB handles TIME/DATE/TIMESTAMP casts uniformly without the Postgres quirks.
;; Without these methods, any GUI query with a temporal filter/breakout fails with
;; "No method in multimethod 'date' for dispatch value: [:quack :hour]".

(defn- date-trunc [unit expr]
  [:date_trunc (h2x/literal unit) expr])

(defn- extract-int [unit expr]
  (h2x/->integer [:date_part (h2x/literal unit) expr]))

(defmethod sql.qp/date [:quack :default]          [_ _ expr] expr)
(defmethod sql.qp/date [:quack :second]           [_ _ expr] (date-trunc :second expr))
(defmethod sql.qp/date [:quack :second-of-minute] [_ _ expr] (extract-int :second expr))
(defmethod sql.qp/date [:quack :minute]           [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:quack :minute-of-hour]   [_ _ expr] (extract-int :minute expr))
(defmethod sql.qp/date [:quack :hour]             [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:quack :hour-of-day]      [_ _ expr] (extract-int :hour expr))
(defmethod sql.qp/date [:quack :day]              [_ _ expr] (h2x/->date expr))
(defmethod sql.qp/date [:quack :day-of-month]     [_ _ expr] (extract-int :day expr))
(defmethod sql.qp/date [:quack :day-of-year]      [_ _ expr] (extract-int :dayofyear expr))
(defmethod sql.qp/date [:quack :day-of-week]
  [driver _ expr]
  ;; DuckDB dayofweek returns 1=Sunday..7=Saturday, same as Metabase's default.
  (sql.qp/adjust-day-of-week driver (extract-int :dayofweek expr)))
(defmethod sql.qp/date [:quack :week]
  [driver _ expr]
  (sql.qp/adjust-start-of-week driver (partial date-trunc :week) expr))
(defmethod sql.qp/date [:quack :week-of-year]     [_ _ expr] (extract-int :week expr))
(defmethod sql.qp/date [:quack :week-of-year-iso] [_ _ expr] (extract-int :week expr))
(defmethod sql.qp/date [:quack :month]            [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:quack :month-of-year]    [_ _ expr] (extract-int :month expr))
(defmethod sql.qp/date [:quack :quarter]          [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:quack :quarter-of-year]  [_ _ expr] (extract-int :quarter expr))
(defmethod sql.qp/date [:quack :year]             [_ _ expr] (date-trunc :year expr))
(defmethod sql.qp/date [:quack :year-of-era]      [_ _ expr] (extract-int :year expr))

;;; ---------------------------------------------------------------------------
;;; add-interval (for relative-datetime filters like "previous 30 days")
;;; ---------------------------------------------------------------------------
;; DuckDB supports standard INTERVAL syntax: expr + INTERVAL '30' DAY.
;; Without this, any :time-interval filter fails with
;; "No method in multimethod 'add-interval-honeysql-form'".

(defmethod sql.qp/add-interval-honeysql-form :quack
  [_driver hsql-form amount unit]
  (let [unit' (if (= unit :quarter) :month unit)
        amt'  (if (= unit :quarter) (* 3 amount) amount)]
    (h2x/+ hsql-form [:raw (format "INTERVAL '%s' %s" amt' (name unit'))])))

;;; ---------------------------------------------------------------------------
;;; datetime-diff (for :datetime-diff feature support)
;;; ---------------------------------------------------------------------------

(defmethod sql.qp/datetime-diff [:quack :default]
  [_driver _unit _x _y]
  nil)

(defmethod sql.qp/datetime-diff [:quack :second]
  [_ _ x y] (h2x/->integer [:datediff h2x/second x y]))
(defmethod sql.qp/datetime-diff [:quack :minute]
  [_ _ x y] (h2x/->integer [:datediff h2x/minute x y]))
(defmethod sql.qp/datetime-diff [:quack :hour]
  [_ _ x y] (h2x/->integer [:datediff h2x/hour x y]))
(defmethod sql.qp/datetime-diff [:quack :day]
  [_ _ x y] (h2x/->integer [:datediff h2x/day x y]))
(defmethod sql.qp/datetime-diff [:quack :week]
  [_ _ x y] (h2x/->integer [:datediff h2x/week x y]))
(defmethod sql.qp/datetime-diff [:quack :month]
  [_ _ x y] (h2x/->integer [:datediff h2x/month x y]))
(defmethod sql.qp/datetime-diff [:quack :quarter]
  [_ _ x y] (h2x/->integer [:datediff h2x/quarter x y]))
(defmethod sql.qp/datetime-diff [:quack :year]
  [_ _ x y] (h2x/->integer [:datediff h2x/year x y]))

;;; ---------------------------------------------------------------------------
;;; convert-timezone / split-part (string + temporal functions)
;;; ---------------------------------------------------------------------------
;; DuckDB supports `timezone(zone, ts)` as a function — the SAME form Postgres
;; uses (honeysql `[:timezone zone expr]` → `timezone(zone, expr)`), verified
;; against DuckDB CLI. For a TIMESTAMPTZ input it yields a naive TIMESTAMP in
;; the target zone's wall-clock; for a naive input wrapped via the source zone
;; first, it reinterprets then converts. We mirror the Postgres impl, which
;; validates arg shapes via sql.u/validate-convert-timezone-args.
(defmethod sql.qp/->honeysql [:quack :convert-timezone]
  [driver [_ _opts arg target-timezone source-timezone]]
  (let [expr         (sql.qp/->honeysql driver (cond-> arg
                                                 (string? arg) u.date/parse))
        timestamptz? (or (sql.qp.u/field-with-tz? arg)
                         (h2x/is-of-type? expr "timestamp with time zone")
                         (h2x/is-of-type? expr "timestamptz"))
        _            (sql.u/validate-convert-timezone-args timestamptz? target-timezone source-timezone)
        expr         [:timezone target-timezone (if (not timestamptz?)
                                                  [:timezone source-timezone expr]
                                                  expr)]]
    (h2x/with-database-type-info expr "timestamp")))

;; DuckDB's native split_part(str, delim, idx) is 1-based and returns '' for
;; out-of-range positions, matching Metabase's contract exactly — no CASE
;; wrapping needed (unlike the MySQL impl, which simulates it).
(defmethod sql.qp/->honeysql [:quack :split-part]
  [driver [_ text divider position]]
  [:split_part
   (sql.qp/->honeysql driver text)
   (sql.qp/->honeysql driver divider)
   (sql.qp/->honeysql driver position)])

(defmethod driver/connection-spec :quack
  [_driver database]
  (database->conn-spec database))

;; Tunnel-aware execution primitives (with-db-transaction) live in
;; quack.conn and are used directly via quack.conn/… by uploads/persistence/
;; actions code below.

;;; ---------------------------------------------------------------------------
;;; SSH tunnel (Metabase bastion feature)
;;; ---------------------------------------------------------------------------
;; Metabase's tunnel machinery lives in the :sql-jdbc layer; since this driver
;; parents on :sql and speaks HTTP (not JDBC), it never enters the JDBC
;; connection-pool path that invokes incorporate-ssh-tunnel-details. We therefore
;; wire the tunnel ourselves: every operation that dials the server goes through
;; with-ssh-tunnel-conn-spec (defined above), which opens a local port-forward
;; through the bastion and rewrites host/port to its localhost entrance.
;;
;; We also implement incorporate-ssh-tunnel-details for API completeness and
;; consistency with :sql-jdbc / :h2. Metabase only calls it from the JDBC pool
;; path today, so the per-operation wrapping above is what actually does the
;; work — but implementing it keeps the driver's feature surface honest and
;; future-proofs it if Metabase ever dispatches on it generically.

(defmethod driver/incorporate-ssh-tunnel-details :quack
  [_driver db-details]
  (cond
    ;; no ssh tunnel in use
    (not (ssh/use-ssh-tunnel? db-details)) db-details
    ;; tunnel in use, and is already open
    (ssh/ssh-tunnel-open? db-details)       db-details
    ;; tunnel in use, and is not open — open it (rewrites host/port)
    :else (ssh/include-ssh-tunnel! (ssh/resolve-known-hosts db-details :quack))))

;;; ---------------------------------------------------------------------------
;;; Transforms / writes (DDL + DML)
;;; ---------------------------------------------------------------------------
;; DuckDB supports CREATE TABLE, CREATE TABLE AS SELECT, INSERT, DROP TABLE.
;; These methods enable Metabase transforms (CTAS/INSERT into any writable
;; catalog — native DuckDB, Postgres, MySQL, SQLite). The :sql parent provides
;; SQL generation and orchestration; we override compile-transform/insert/
;; drop-table to handle compound schemas (catalog.schema) correctly.
;; Without the override, HoneySQL treats "worldcup.main" as a single literal
;; schema name instead of splitting it into catalog.schema.

(defn- qualified-table-name
  "Format a compound schema table ref for DuckDB: split `catalog.schema` →
  `\"catalog\".\"schema\".\"table\"`. Native schemas (no dot) pass through
  as `\"schema\".\"table\"` or just `\"table\"`."
  [table]
  (let [kw (keyword table)
        schema (namespace kw)
        name (name kw)]
    (if schema
      (if (str/includes? schema ".")
        ;; Compound: catalog.schema → split and quote each part
        (let [parts (str/split schema #"\.")]
          (str/join "." (map #(format "\"%s\"" %) (conj (vec parts) name))))
        ;; Simple schema
        (format "\"%s\".\"%s\"" schema name))
      ;; No schema
      (format "\"%s\"" name))))

(defmethod driver/compile-transform :quack
  ;; CREATE OR REPLACE TABLE makes transforms idempotent: a previous run that
  ;; crashed mid-sync (e.g. the METABASE_FIELD unique-index failure from the
  ;; describe-fields filter bug) leaves the target table behind, and a plain
  ;; CREATE TABLE would fail with "table already exists" on retry. DuckDB
  ;; supports CREATE OR REPLACE TABLE natively, so the retry atomically swaps
  ;; the table.
  [_driver {:keys [query output-table]}]
  (let [{sql-query :query sql-params :params} query
        target (qualified-table-name output-table)]
    [(format "CREATE OR REPLACE TABLE %s AS %s" target sql-query)
     sql-params]))

(defmethod driver/compile-insert :quack
  [_driver {:keys [query output-table]}]
  (let [{sql-query :query sql-params :params} query
        target (qualified-table-name output-table)]
    [(format "INSERT INTO %s %s" target sql-query)
     sql-params]))

(defmethod driver/compile-drop-table :quack
  [_driver table]
  (let [target (qualified-table-name table)]
    (format "DROP TABLE IF EXISTS %s" target)))

(defmethod driver/execute-raw-queries! :quack
  ;; `conn-spec` may be a Database (has :details) or an already-flat conn-spec;
  ;; both flow through with-ssh-tunnel-conn-spec, which opens a tunnel when the
  ;; carried tunnel keys enable one.
  [_driver conn-spec queries]
  (let [details (if (:details conn-spec)
                  (driver/connection-spec :quack conn-spec)
                  conn-spec)]
    (with-ssh-tunnel-conn-spec details
      (fn [cs]
        (doseq [query queries]
          (let [[sql params] (if (string? query) [query nil] query)]
            (assert-no-parameters! params)
            (when (seq sql)
              ;; execute-sql! drains the result so the pooled connection is
              ;; released; execute-query would leak it (the reducible is never
              ;; reduced here).
              (quack.client/execute-sql! cs sql))))))
    [{:rows-affected 0}]))

(defmethod driver/table-exists? :quack
  [_driver database {:keys [name schema] :as _table}]
  (when-not (str/blank? name)
    (let [details (database->details database)
          fold    (schema-sql "database_name")
          ;; schema may be a compound `catalog.schema`; duckdb_tables has
          ;; database_name + schema_name separately (folded by the CASE expr).
          ;; We UNION duckdb_tables + duckdb_views and SUM the counts so a VIEW
          ;; (count 0 from the tables side, 1 from the views side) is detected —
          ;; `(ffirst rows)` would miss it.
          rows (run-sql details
                        (format "SELECT sum(n) AS total FROM (
                                   SELECT count(*) AS n FROM duckdb_tables()
                                   WHERE table_name = '%s'%s
                                   UNION ALL
                                   SELECT count(*) AS n FROM duckdb_views()
                                   WHERE view_name = '%s'%s
                                 ) x"
                                (str/replace name "'" "''")
                                (if schema
                                  (format " AND %s = '%s'" fold (str/replace schema "'" "''"))
                                  "")
                                (str/replace name "'" "''")
                                (if schema
                                  (format " AND %s = '%s'" fold (str/replace schema "'" "''"))
                                  "")))]
      (pos? (ffirst rows)))))

(defmethod driver/create-table! :quack
  [driver database-id table-name column-definitions & {:keys [primary-key]}]
  (let [database (driver-api/cached-database database-id)
        details  (database->details database)
        sql (#'driver.sql-jdbc/create-table!-sql driver table-name column-definitions :primary-key primary-key)]
    (with-ssh-tunnel-conn-spec details
      (fn [conn-spec] (quack.client/execute-sql! conn-spec sql)))))

(defmethod driver/drop-table! :quack
  [driver database-id table-name]
  (let [database (driver-api/cached-database database-id)
        details  (database->details database)
        sql (first (sql.qp/format-honeysql driver {:drop-table [:if-exists (keyword table-name)]}))]
    (with-ssh-tunnel-conn-spec details
      (fn [conn-spec] (quack.client/execute-sql! conn-spec sql)))))

(defmethod driver/syncable-schemas :quack
  [_driver database]
  ;; Return all writable user schemas across ALL catalogs, using the SAME
  ;; catalog-fold as describe-database* (plain schema for the native catalog
  ;; current_database(), "<catalog>.<schema>" for attached). This is critical:
  ;; the upload/transform "schema" dropdown feeds these strings straight into
  ;; table-identifier (schema.name), so the schema labels here MUST match the
  ;; labels describe-database* syncs — otherwise the dropdown (e.g. "quack.main")
  ;; and the data browser ("main") disagree about the same physical schema.
  ;;
  ;; A catalog is writable iff NOT read-only AND NOT internal (duckdb_databases),
  ;; so Mongo (READ_ONLY) and system/temp catalogs are auto-excluded. We also
  ;; drop genuinely-internal schemas (pg_catalog, information_schema) via
  ;; duckdb_schemas().internal — BUT explicitly KEEP `main`:
  ;;
  ;;   DuckDB marks `main` as internal=true in duckdb_schemas() (for the native
  ;;   catalog AND attached file dbs), even though duckdb_tables() correctly
  ;;   reports main's tables as NOT internal (which is why sync sees `main`'s
  ;;   tables but this query used to drop the schema itself). `main` is the
  ;;   default USER schema in every writable catalog, so we always include it.
  ;;
  ;; Writable-by-DuckDB-scanner sources: duckdb (native), postgres, mysql, sqlite.
  ;; Mongo and ODBC/MSSQL are read-only.
  ;; See: https://duckdb.org/docs/current/core_extensions/postgres/overview#writing-data-to-postgresql
  ;;      DuckDB's built-in `duckdb_databases()` / `duckdb_schemas()` metadata
  ;;      functions expose the `internal` / `readonly` flags used in the WHERE.
  (let [details (database->details database)
        fold    (schema-sql "s.database_name")
        rows    (run-sql details
                         (format "WITH writable_dbs AS (
                                     SELECT database_name
                                     FROM duckdb_databases()
                                     WHERE NOT internal AND NOT readonly
                                 )
                                 SELECT %s AS schema
                                 FROM writable_dbs d
                                 JOIN duckdb_schemas() s
                                   ON s.database_name = d.database_name
                                 WHERE (NOT s.internal OR s.schema_name = 'main')
                                 ORDER BY 1" fold))]
    (set (map first rows))))

;;; ---------------------------------------------------------------------------
;;; Model persistence (materialize model results into DuckDB cache tables)
;;; ---------------------------------------------------------------------------
;; Metabase can persist a model's result set into a real table inside the
;; source database, then transparently rewrite downstream queries to read from
;; that cache instead of re-running the model (see
;; metabase/docs/data-modeling/model-persistence.md). The cache lives in a
;; dedicated schema `metabase_cache_<site-uuid-prefix>_<db-id>` (computed by
;; [[ddl.i/schema-name]]), with one table per model plus a `cache_info` KV
;; table for bookkeeping.
;;
;; The read-path rewrite is generic — it comes for free from the :sql parent's
;; QP (resolve-persisted-source-sql) plus query_processor/middleware/persistence.
;; A driver only has to (a) advertise :persist-models (done above) and (b)
;; implement the three ddl.i multimethods below, each sending generated SQL over
;; the Quack HTTP client, tunnel-aware, exactly like the transforms methods.
;;
;; Quack transactions are connection-scoped. [[ddl.i/refresh!]] materializes a
;; replacement table first, then holds one connection for the transactional
;; DROP + RENAME swap so readers see either the old or new table.

(defn- persist-exec!
  "Run a DDL/DML `sql` string over the Quack client and discard the (empty)
  result. `conn-spec` must already be tunnel-resolved — callers wrap with
  [[with-ssh-tunnel-conn-spec]]."
  [conn-spec sql]
  ;; Drain the result (even though DML/DDL rows are empty) so the pooled
  ;; connection is released — a discarded execute-query reducible would leak it
  ;; (see quack.pool's docstring on borrowed-but-unreduced connections).
  (quack.client/execute-sql! conn-spec sql))

(defn- quote-ident
  "Quote a single DuckDB identifier (schema or unqualified table name) using the
  driver's ANSI quoting. For hand-built SQL strings where HoneySQL isn't worth
  the ceremony (RENAME TO targets, IF EXISTS probes, etc.)."
  [identifier]
  (sql.u/quote-name :quack :table identifier))

(defmethod ddl.i/check-can-persist :quack
  ;; Probe that we can create the cache schema + a scratch table, read it, drop
  ;; it, and create+populate the cache_info KV table. Each probe is its own
  ;; Quack request (no transaction); on any failure we best-effort drop the
  ;; scratch table and return the failing step so the API surfaces a sensible
  ;; permission error (see ddl.i/error->message). Mirrors
  ;; driver/postgres/ddl.clj minus the JDBC plumbing.
  [{:as database}]
  (let [details     (database->details database)
        schema-name (ddl.i/schema-name database (driver-api/site-uuid))
        table-name  (format "persistence_check_%s" (rand-int 100000))]
    (with-ssh-tunnel-conn-spec details
      (fn [cs]
        (let [cleanup! (fn []
                         (try (persist-exec! cs (sql.ddl/drop-table-sql database table-name))
                              (catch Throwable _)))
              steps    [[:persist.check/create-schema
                         (fn []
                           ;; DuckDB supports IF NOT EXISTS; idempotent across re-checks.
                           (persist-exec! cs (format "CREATE SCHEMA IF NOT EXISTS %s"
                                                     (quote-ident schema-name))))]
                        [:persist.check/create-table
                         (fn []
                           (persist-exec! cs (sql.ddl/create-table-sql
                                              database
                                              {:table-name      table-name
                                               :field-definitions [{:field-name "field"
                                                                    :base-type  :type/Text}]}
                                              "SELECT 1")))]
                        [:persist.check/read-table
                         (fn []
                           (persist-exec! cs (format "SELECT * FROM %s.%s"
                                                     (quote-ident schema-name)
                                                     (quote-ident table-name))))]
                        [:persist.check/delete-table
                         (fn []
                           (persist-exec! cs (sql.ddl/drop-table-sql database table-name)))]
                        [:persist.check/create-kv-table
                         (fn []
                           ;; Drop any stale cache_info from a prior half-run,
                           ;; then (re)create it via the shared honeysql form.
                           ;; Formatted with the ANSI dialect (not format-honeysql,
                           ;; which forces :quoted true and would wrongly quote
                           ;; the TEXT column type) — same as driver/postgres/ddl.clj.
                           (persist-exec! cs (format "DROP TABLE IF EXISTS %s.cache_info"
                                                     (quote-ident schema-name)))
                           (let [sql-str (first (sql/format (ddl.i/create-kv-table-honey-sql-form schema-name)
                                                            {:dialect :ansi :inline true}))]
                             (persist-exec! cs sql-str)))]
                        [:persist.check/populate-kv-table
                         (fn []
                           (let [sql-str (first (sql/format (ddl.i/populate-kv-table-honey-sql-form schema-name)
                                                            {:dialect :ansi :inline true}))]
                             (persist-exec! cs sql-str)))]]]
          ;; NOTE: ddl.i/error->message only knows :create-schema, :create-table,
          ;; :read-table, :delete-table (it is a `case` with no default). The
          ;; kv-table steps would throw "No matching clause" if returned as-is.
          ;; Postgres has the same latent issue but its kv steps never fail in
          ;; practice (same JDBC txn). For Quack each step is its own HTTP
          ;; request, so map any kv-table failure to :create-table (the closest
          ;; known keyword) and log the real exception so it is diagnosable.
          (loop [[[step stepfn] & remaining] steps]
            (let [result (try (stepfn)
                              ::ok
                              (catch Throwable e
                                (log/warnf e "Error in `%s` while checking model persistence permissions for %s"
                                           step (:name database))
                                step))]
              (cond
                (and (= result ::ok) (seq remaining)) (recur remaining)
                (= result ::ok)                       [true :persist.check/valid]
                :else                                 (do (cleanup!)
                                                          [false (if (#{:persist.check/create-kv-table
                                                                        :persist.check/populate-kv-table}
                                                                      result)
                                                                   :persist.check/create-table
                                                                   result)])))))))))

(defmethod ddl.i/refresh! :quack
  ;; Rebuild a persisted model's cache table via a temp-table + rename swap:
  ;;
  ;;   1. DROP IF EXISTS the `<table>__mb_refresh` temp (cleans up any orphan
  ;;      left by a previously crashed refresh — deterministic suffix means a
  ;;      later run always reclaims it).
  ;;   2. CREATE TABLE <temp> AS <model SQL>  — the expensive step. The existing
  ;;      cache table stays in place and fully queryable throughout.
  ;;   3–4. Inside a single DuckDB transaction (held Quack connection):
  ;;        DROP IF EXISTS <current>;  ALTER TABLE <temp> RENAME TO <current>.
  ;;        Atomic — a crash between the two rolls back, leaving the OLD cache
  ;;        table in place rather than none. This closes the narrow window the
  ;;        first version of this method had (each statement was its own
  ;;        connection, so a crash mid-swap orphaned the cache).
  [_driver database definition dataset-query]
  ;; The Quack client speaks one SQL string per request with no param-binding
  ;; channel, so inline any prepared-statement params up front.
  (let [{model-sql :query} (binding [driver/*compile-with-inline-parameters* true]
                             (driver-api/compile dataset-query))
        details  (database->details database)
        schema   (ddl.i/schema-name database (driver-api/site-uuid))
        table    (:table-name definition)
        temp     (str table "__mb_refresh")
        ident    (fn [t] (format "%s.%s" (quote-ident schema) (quote-ident t)))]
    (with-ssh-tunnel-conn-spec details
      (fn [cs]
        (persist-exec! cs (format "DROP TABLE IF EXISTS %s" (ident temp)))
        (persist-exec! cs (format "CREATE TABLE %s AS %s" (ident temp) model-sql))
        ;; Atomic drop + rename: a held-connection DuckDB transaction. On any
        ;;        failure ROLLBACK restores the pre-swap state (old cache intact).
        (quack.client/do-with-transaction
         cs
         (fn [conn-id]
           (quack.client/exec-on-connection
            cs conn-id (format "DROP TABLE IF EXISTS %s" (ident table)))
           (quack.client/exec-on-connection
            cs conn-id (format "ALTER TABLE %s RENAME TO %s"
                               (ident temp) (quote-ident table)))))))
    {:state :success}))

(defmethod ddl.i/unpersist! :quack
  ;; Drop a persisted model's cache table. Best-effort about a missing table
  ;; (already dropped, or a refresh! that crashed before the rename): we log
  ;; and rethrow so the prune task records the failure, matching Postgres.
  [_driver database persisted-info]
  (let [details (database->details database)]
    (with-ssh-tunnel-conn-spec details
      (fn [cs]
        (try
          (persist-exec! cs (sql.ddl/drop-table-sql database (:table_name persisted-info)))
          (catch Throwable e
            (log/warn e "Error unpersisting model" (:table_name persisted-info))
            (throw e)))))))

;;; ---------------------------------------------------------------------------
;;; Uploads (CSV → DuckDB tables)
;;; ---------------------------------------------------------------------------
;; Metabase's upload pipeline drives these driver multimethods. The Quack
;; driver already implements create-table! / drop-table! / table-exists? /
;; syncable-schemas (above + transforms section), so only the row-write and
;; schema-evolution methods are added here. Each runs SQL over the Quack client,
;; tunnel-aware. Multi-row INSERTs are batched to keep request size sane.

(defmethod driver/table-name-length-limit :quack
  ;; Required by the upload pipeline: metabase.upload.impl/unique-table-name
  ;; calls this for every :uploads driver, and (unlike column-name-length-limit)
  ;; there is NO :default method on the multimethod — so omitting it made
  ;; POST /api/upload/csv fail with:
  ;;   "No method in multimethod 'table-name-length-limit' for dispatch value: :quack"
  ;;
  ;; DuckDB does not document a hard identifier-length limit (names are stored
  ;; as unbounded strings), so we return a generous value rather than nil: the
  ;; Metabase app-DB :model/Table :name column caps names at 256 bytes anyway
  ;; (upload.impl/min-safe), so this is never the binding constraint — it just
  ;; has to be a positive int (see metabase upload/impl_test's `pos?` assertion
  ;; and driver_test's `get-method` conformance check).
  [_driver]
  1024)

(def ^:private insert-batch-rows
  "Rows per INSERT statement. Mirrors the :sql-jdbc default (100) — large enough
  to amortize per-request overhead, small enough to stay under any wire limit."
  100)

(defmethod driver/insert-into! :quack
  [driver db-id table-name column-names values]
  (let [database  (driver-api/cached-database db-id)
        details   (database->details database)
        dialect   (sql.qp/quote-style driver)
        ;; Reuse the :sql-jdbc INSERT-shape generator (same batching + quoting)
        ;;        — it's pure SQL-string generation, no JDBC. We inline values so the
        ;;        Quack client gets one self-contained SQL string per batch (no param
        ;;        channel exists over the protocol).
        sqls      (->> (partition-all insert-batch-rows values)
                       (map (fn [chunk]
                              (first (sql/format {:insert-into (keyword table-name)
                                                  :columns     (mapv keyword column-names)
                                                  :values      chunk}
                                                 :inline true
                                                 :quoted true
                                                 :dialect dialect)))))]
    (with-ssh-tunnel-conn-spec details
      (fn [cs]
        (doseq [insert-sql sqls]
          (persist-exec! cs insert-sql))))
    {:created-rows (count (into [] values))}))

(defmethod driver/truncate! :quack
  [_driver db-id table-name]
  (let [database (driver-api/cached-database db-id)
        details  (database->details database)
        sql      (first (sql/format {:truncate [(keyword table-name)]}
                                    :quoted true
                                    :dialect :ansi))]
    (with-ssh-tunnel-conn-spec details
      (fn [cs] (persist-exec! cs sql)))))

(defmethod driver/add-columns! :quack
  ;; ALTER TABLE t ADD COLUMN c TYPE [constraints]. `column-definitions` is a
  ;; map of {col-keyword type-or-honeysql-vec}. Primary-key support is best-effort
  ;; (DuckDB allows inline PRIMARY KEY on ADD COLUMN).
  [_driver db-id table-name column-definitions & {:keys [primary-key]}]
  (let [database (driver-api/cached-database db-id)
        details  (database->details database)
        pk-set   (set primary-key)
        col-clauses (for [[col type] column-definitions]
                      (let [type-str (if (string? type)
                                       type
                                       (str/join " " (map name type)))
                            base (format "%s %s" (quote-ident (name col)) type-str)]
                        (if (pk-set col)
                          (str base " PRIMARY KEY")
                          base)))
        sql (format "ALTER TABLE %s ADD COLUMN %s"
                    (qualified-table-name table-name)
                    (str/join ", ADD COLUMN " col-clauses))]
    (with-ssh-tunnel-conn-spec details
      (fn [cs] (persist-exec! cs sql)))))

(defmethod driver/alter-table-columns! :quack
  ;; ALTER TABLE t ALTER COLUMN c SET DATA TYPE newtype. DuckDB supports type
  ;; widening/casts for non-constrained columns. `column-definitions` is a map
  ;; {col-keyword honeysql-type-vec-or-string}; we emit one ALTER per column.
  [_driver db-id table-name column-definitions & _opts]
  (let [database (driver-api/cached-database db-id)
        details  (database->details database)
        target  (qualified-table-name table-name)
        sqls    (for [[col type] column-definitions]
                  (let [type-str (if (string? type)
                                   type
                                   (str/join " " (map name type)))]
                    (format "ALTER TABLE %s ALTER COLUMN %s SET DATA TYPE %s"
                            target (quote-ident (name col)) type-str)))]
    (with-ssh-tunnel-conn-spec details
      (fn [cs] (doseq [s sqls] (persist-exec! cs s))))))

(defmethod driver/upload-type->database-type :quack
  ;; Map Metabase's CSV-inferred upload types to DuckDB column types. The type-spec
  ;; shape here is rendered by the SHARED sql-jdbc create-table!-sql (HoneySQL
  ;; :with-columns), so it must match what HoneySQL emits — see upload-type->sql-test.
  ;;
  ;; Two shapes that are easy to get wrong:
  ;;   * varchar-255 MUST be [[:varchar 255]] (nested). A flat [:varchar 255] renders
  ;;     as the invalid "VARCHAR 255"; the nesting makes HoneySQL emit VARCHAR(255).
  ;;     (DuckDB accepts VARCHAR(n); the length is just a hint.)
  ;;   * The auto-incrementing PK maps to DuckDB's intended SQL-standard
  ;;     "GENERATED ALWAYS AS IDENTITY" (HoneySQL renders the keywords uppercased,
  ;;     hyphens→spaces). NOTE: as of DuckDB v1.5.4 this is NOT IMPLEMENTED —
  ;;     prepare throws "Constraint not implemented!" for both ALWAYS and BY DEFAULT.
  ;;     So :upload-with-auto-pk is currently DISABLED (see feature flags) and this
  ;;     case is unused. It's kept here as the correct mapping to flip back on the
  ;;     day DuckDB ships identity support.
  [_driver upload-type]
  (case upload-type
    :metabase.upload/varchar-255              [[:varchar 255]]
    :metabase.upload/text                     [:text]
    :metabase.upload/int                      [:bigint]
    :metabase.upload/auto-incrementing-int-pk [:integer :generated-always :as :identity]
    :metabase.upload/float                    [:double]
    :metabase.upload/boolean                  [:boolean]
    :metabase.upload/date                     [:date]
    :metabase.upload/datetime                 [:timestamp]
    :metabase.upload/offset-datetime          [:timestamp-with-time-zone]))

(defmethod driver/allowed-promotions :quack
  ;; DuckDB can widen int→float and boolean→int/float via implicit cast.
  [_driver]
  {:metabase.upload/int     #{:metabase.upload/float}
   :metabase.upload/boolean #{:metabase.upload/int
                              :metabase.upload/float}})

;;; ---------------------------------------------------------------------------
;;; Table rename (transforms atomic-renames strategy + general :rename)
;;; ---------------------------------------------------------------------------

(defmethod driver/rename-tables!* :quack
  ;; Rename tables atomically inside a single DuckDB transaction (held Quack
  ;;        connection). `sorted-rename-map` is already topologically sorted by
  ;;        driver/rename-tables!. Table keys may be schema-qualified keywords
  ;;        (:schema/table); qualified-table-name splits catalog.schema correctly.
  [_driver db-id sorted-rename-map]
  (let [database (driver-api/cached-database db-id)
        details  (database->details database)
        sqls     (for [[from to] sorted-rename-map]
                   (format "ALTER TABLE %s RENAME TO %s"
                           (qualified-table-name from)
                           (quote-ident (name to))))]
    (with-ssh-tunnel-conn-spec details
      (fn [cs]
        (quack.client/do-with-transaction
         cs
         (fn [conn-id]
           (doseq [sql sqls]
             (quack.client/exec-on-connection cs conn-id sql))))))))

;;; ---------------------------------------------------------------------------
;;; Custom writeback actions (:actions/custom)
;;; ---------------------------------------------------------------------------
;; driver/execute-write-query! powers custom (native-SQL) writeback actions.
;; The query arrives as an MBQL native query {:type :native :native {:query sql}};
;; we run it over the Quack client. DuckDB reports rows-affected for DML but the
;; Quack prepare path returns a result set, so we surface a conservative count.

(defmethod driver/execute-write-query! :quack
  [_driver {{sql :query} :native}]
  {:pre [(string? sql)]}
  (let [database (driver-api/database (driver-api/metadata-provider))
        details  (database->details database)]
    (with-ssh-tunnel-conn-spec details
      (fn [cs] (persist-exec! cs sql)))
    ;; DuckDB doesn't expose a reliable affected-row count over the Quack
    ;;        protocol for arbitrary DML; report 0 (matches the transforms
    ;;        execute-raw-queries! convention for this driver).
    {:rows-affected 0}))
