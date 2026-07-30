(ns metabase-enterprise.transforms-verification.scratch
  "Scratch-table lifecycle for transform test runs.

  Scratch tables are ephemeral warehouse tables created during a
  test run to hold fixture data and capture transform output without touching real
  production tables.

  ## Naming convention

  All scratch tables use the name pattern:

    mb_transform_temp_table_test_<epoch36>_<nonce>_<suffix>

  where:
    - The prefix `mb_transform_temp_table_test_` extends
      `transforms-base.u/transform-temp-table-prefix` (sync skips any name starting
      with that prefix, so test tables are sync-invisible).
    - `epoch36` — epoch seconds encoded in base 36 (6 chars for current epoch).
    - `nonce`   — 8-character random string for per-run uniqueness.
    - `suffix`  — `in_<table-id>` for input tables, `out` for the output target.

  Production transform temp tables use `mb_transform_temp_table_<hex-millis>`.
  The `_test_` segment cannot appear in a hex-only name, so a janitor call
  cannot drop a live production transform's temp table.

  ## Connection context

  The write/DDL seams (`seed!`, `cleanup!`, `cleanup-all-test-tables!`) self-elevate
  to `driver.conn/with-transform-connection` around their DDL; callers otherwise run
  under the ambient least-privilege `:default` connection. They supply `db-id` and
  the `:model/Database` row."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-verification.errors :as errors]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.query-processor.core :as qp]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.log :as log])
  (:import
   (java.util UUID)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Constants
;;; ---------------------------------------------------------------------------

(def ^:private test-segment
  "The segment that marks a scratch table as a test table (vs. a production temp table)."
  "test")

(def ^:private test-table-prefix
  "Full prefix for test scratch table names.
  Built from the canonical transform-temp-table-prefix so sync skips these tables."
  (str transforms-base.u/transform-temp-table-prefix "_" test-segment "_"))

;;; ---------------------------------------------------------------------------
;;; Naming: encode
;;; ---------------------------------------------------------------------------

(defn new-nonce
  "Generate a unique 8-character nonce for a test run."
  []
  ;; First 8 hex chars of a random UUID — same convention as transforms-base.u/temp-table-name.
  (subs (str/replace (str (UUID/randomUUID)) "-" "") 0 8))

(defn scratch-table-name
  "Build a scratch table name string from `nonce` and `suffix`.

  `nonce`  — 8-char string from [[new-nonce]].
  `suffix` — `\"in_<table-id>\"` for an input table; `\"out\"` for the output target.

  The epoch-seconds component encodes the wall-clock creation time so the janitor
  can age-gate from the name alone without relying on warehouse table-creation
  metadata (which Postgres does not expose).

  Returns a bare string (no schema prefix)."
  ^String [nonce ^String suffix]
  (let [epoch-secs (quot (System/currentTimeMillis) 1000)
        epoch36    (Long/toString epoch-secs 36)]
    (str test-table-prefix epoch36 "_" nonce "_" suffix)))

;;; ---------------------------------------------------------------------------
;;; Naming: parse + predicate
;;; ---------------------------------------------------------------------------

(defn parse-scratch-table-name
  "Parse a scratch table name string back to a map.

  Returns `{:epoch-seconds <long> :nonce <string> :suffix <string>}` when the
  name matches the test scratch pattern, or `nil` otherwise (including any
  non-string input).

  The `:epoch-seconds` value is decoded from the base-36 component and can be
  compared directly to `(quot (System/currentTimeMillis) 1000)` for age-gating."
  [table-name]
  (when (and (string? table-name) (str/starts-with? ^String table-name test-table-prefix))
    ;; Remaining after prefix: <epoch36>_<nonce>_<suffix>
    (let [rest-str (subs ^String table-name (count test-table-prefix))
          parts    (str/split rest-str #"_" 3)]
      (when (= 3 (count parts))
        (let [[epoch36 nonce suffix] parts]
          (when (and (seq epoch36) (seq nonce) (seq suffix))
            (try
              {:epoch-seconds (Long/parseLong epoch36 36)
               :nonce         nonce
               :suffix        suffix}
              (catch NumberFormatException _
                nil))))))))

(defn test-table-name?
  "Return true when `table-name` is a test scratch table name string.
  False for any non-string value. Never consults the database — purely
  name-based."
  [table-name]
  (some? (parse-scratch-table-name table-name)))

;;; ---------------------------------------------------------------------------
;;; Output target
;;; ---------------------------------------------------------------------------

(defn scratch-output-target
  "Build the output target spec for a test run's output scratch table.

  `schema`  — the target schema string (from the transform target's schema).
  `nonce`   — 8-char nonce for this run (from [[new-nonce]]).
  `suffix`  — name suffix for the output table (default `\"out\"`). A chained run
              passes a per-node suffix (e.g. `\"out_<transform-id>\"`) so each
              node's output gets a distinct scratch table.
  `catalog` — the driver's db-slot value (from `driver.sql/db-slot-value`), or nil
              for drivers that do not use a catalog segment (postgres, h2, redshift,
              oracle). When non-nil, callers are responsible for incorporating it
              into DDL, read-back SQL, and `build-transform-details :output-db`.

  Returns `{:schema <string> :table <string> :db <string-or-nil>}`."
  [^String schema ^String nonce ^String suffix catalog]
  {:schema schema
   :table  (scratch-table-name nonce suffix)
   :db     catalog})

(defn spec->sql-ref
  "Driver-quoted SQL table reference for a scratch spec `{:schema :table :db}`.

  Emits a 3-segment `catalog.schema.table` reference when `:db` is non-nil —
  required where the catalog must appear in emitted SQL (BigQuery, SQL Server) —
  else `schema.table`, else bare `table`.

  The segments are identifiers, not values — they must be driver-quoted, never
  passed as JDBC parameters."
  ^String [driver {:keys [db schema table]}]
  (apply sql.u/quote-name driver :table (remove nil? [db schema table])))

;;; ---------------------------------------------------------------------------
;;; Seeding
;;; ---------------------------------------------------------------------------

(defn- table-schema-for-seed
  "Build a transforms-base `::table-definition` map from a table-info + scratch name.

  The returned map is suitable for `create-table-from-schema!` and
  `driver/insert-from-source!` (via the `:rows` data source)."
  [scratch-name ^String schema table-info]
  {:name    (keyword schema scratch-name)
   :columns (mapv (fn [{:keys [name base-type nullable?]}]
                    {:name      name
                     :type      base-type
                     :nullable? nullable?})
                  (:columns table-info))})

(defn seed!
  "Create and populate scratch tables from fixture data.

  Arguments:
  - `db-id`       — integer database id.
  - `db`          — `:model/Database` row; `:engine` is used to resolve the driver.
  - `schema`      — schema string in which to create scratch tables (e.g. `\"public\"`).
  - `seed-inputs` — sequence of `{:table-info <table-info map> :fixture <parse-fixture output>}` maps.
  - `nonce`       — 8-char string from [[new-nonce]]; unique per run.

  Returns a mapping `{real-spec → scratch-spec}` where each spec is
  `{:schema <string> :table <string> :db <string-or-nil>}`. The `:db` value is the
  driver's catalog/project string (`driver.sql/db-slot-value`), or nil for drivers
  without a catalog segment.

  The real-spec keys are `{:schema (:schema table-info) :table (:name table-info)}`.

  On partial failure (some tables created, then an error): drops all already-created
  scratch tables (best-effort, logs failures) then rethrows a typed ex-info."
  [db-id db ^String schema seed-inputs nonce]
  (let [driver  (keyword (:engine db))
        catalog (driver.sql/db-slot-value driver db)
        created (atom [])
        mapping (atom {})]
    ;; Self-elevate: all DDL/DML below runs on write-data credentials via the
    ;; :transform pool, regardless of the caller's ambient connection scope.
    (driver.conn/with-transform-connection
      (try
        ;; Create the target schema if absent — some warehouses (e.g. BigQuery) don't
        ;; auto-create it, so a never-run transform's target schema may not exist yet.
        (when (and (not (str/blank? schema))
                   (not (driver/schema-exists? driver db-id schema)))
          (driver/create-schema-if-needed! driver (driver/connection-spec driver db) schema))
        (doseq [{:keys [table-info fixture]} seed-inputs]
          (let [real-spec    {:schema (:schema table-info) :table (:name table-info)}
                suffix       (str "in_" (:id table-info))
                scratch-name (scratch-table-name nonce suffix)
                tbl-schema   (table-schema-for-seed scratch-name schema table-info)]
            (transforms-base.u/create-table-from-schema! driver db-id tbl-schema)
            (swap! created conj {:schema schema :table scratch-name})
            (driver/insert-from-source! driver db-id tbl-schema
                                        {:type :rows
                                         :data (:rows fixture)})
            (swap! mapping assoc real-spec {:schema schema :table scratch-name :db catalog})))
        @mapping
        (catch Throwable e
          ;; Best-effort drop of already-created tables
          (doseq [{tbl-schema :schema tbl-name :table} @created]
            (try
              (driver/drop-table! driver db-id (keyword tbl-schema tbl-name))
              (catch Exception drop-e
                (log/warn drop-e "Failed to drop scratch table during seed! failure cleanup:"
                          (keyword tbl-schema tbl-name)))))
          (throw (errors/ex ::errors/seed-failed
                            (str "Failed to seed scratch tables: " (ex-message e))
                            {:created @created}
                            e)))))))

;;; ---------------------------------------------------------------------------
;;; Cleanup
;;; ---------------------------------------------------------------------------

(defn cleanup!
  "Drop all scratch tables in `mapping` and the optional `output-spec`.

  Arguments:
  - `db-id`       — integer database id.
  - `db`          — `:model/Database` row.
  - `mapping`     — the `{real-spec → scratch-spec}` map from [[seed!]].
  - `output-spec` — `{:schema :table}` map for the output scratch table, or nil.

  Best-effort: logs and continues on per-table errors so that a failure to drop
  one table doesn't prevent the rest from being cleaned up. Failed drops are
  collected and re-surfaced as a single summary warning (no retry).

  Idempotent: `driver/drop-table!` uses `DROP TABLE IF EXISTS` — dropping an
  already-absent table returns `[0]` without error.

  Returns nil always."
  [db-id db mapping output-spec]
  (let [driver   (keyword (:engine db))
        failures (atom [])
        drop!    (fn [schema table-name]
                   (try
                     ;; drop-table! takes the table name as a schema-qualified keyword
                     ;; (keyword schema table-name) — not the full table-schema map used
                     ;; by create-table-from-schema!. Passing the map causes ClassCastException.
                     (driver/drop-table! driver db-id (keyword schema table-name))
                     (catch Exception e
                       (log/warn e "Failed to drop scratch table during cleanup!"
                                 (keyword schema table-name))
                       (swap! failures conj {:table (keyword schema table-name)
                                             :error (ex-message e)}))))]
    ;; Self-elevate: the DROPs run on write-data credentials via the :transform
    ;; pool even though the caller (run-test!'s finally) runs under ambient :default.
    (driver.conn/with-transform-connection
      (doseq [{:keys [schema table]} (vals mapping)]
        (drop! schema table))
      (when output-spec
        (drop! (:schema output-spec) (:table output-spec))))
    (when (seq @failures)
      (log/warnf "cleanup! left %d scratch table(s) undropped on database %d: %s"
                 (count @failures) db-id (pr-str @failures)))
    nil))

;;; ---------------------------------------------------------------------------
;;; Janitor
;;; ---------------------------------------------------------------------------

;; TODO ------------------------------------------------------------------------
;; DRIVER IMPL OUTSIDE THE DRIVER TREE — DO NOT SHIP AS-IS.
;; The :bigquery-cloud-sdk method below is a driver-specific implementation
;; living in an enterprise module. One exit: promote [[list-tables-sql]] to a
;; real driver multimethod in a namespace the driver modules can implement
;; (e.g. metabase.driver.sql), move the BigQuery method into
;; modules/drivers/bigquery-cloud-sdk, and delete both from here. But that
;; design is itself a first guess — an existing driver API may already cover
;; what the sweep below ([[cleanup-all-test-tables!]]) requires: list tables in
;; a namespace, DDL-fresh, empty tables included. driver/describe-database does
;; NOT — Redshift's omits empty tables, MySQL's reports :schema nil. A different
;; enumeration strategy may also fit better. Decide deliberately before shipping.
;; ------------------------------------------------------------------------------
(defmulti ^:private list-tables-sql
  "`[sql params]` enumerating table names in namespace `schema` on the warehouse.
  The default is the standard `information_schema.tables`, schema as a bound
  parameter. BigQuery exposes INFORMATION_SCHEMA only per-dataset, so its
  relation is dataset-qualified (identifier-quoted; no parameters)."
  {:arglists '([driver schema])}
  (fn [driver _schema] driver)
  :hierarchy #'driver/hierarchy)

(defmethod list-tables-sql :default
  [_driver schema]
  [(str "SELECT table_name"
        " FROM information_schema.tables"
        " WHERE table_schema = ?"
        " ORDER BY table_name")
   [schema]])

(defmethod list-tables-sql :bigquery-cloud-sdk
  [driver schema]
  [(str "SELECT table_name"
        " FROM " (sql.u/quote-name driver :schema schema) ".INFORMATION_SCHEMA.TABLES"
        " ORDER BY table_name")
   []])

(defn list-tables-in-schema
  "Return a vector of table-name strings in namespace `schema` on the warehouse — a
  real schema, or the catalog on engines whose namespace travels in the `:db` slot
  (MySQL, where `information_schema.table_schema` holds the database)."
  [driver db-id ^String schema]
  ;; A live information_schema query, not driver/describe-database: describe-database
  ;; is a sync API with per-driver visibility gaps fatal to a janitor — Redshift's
  ;; omits empty tables, MySQL's reports `:schema` nil. information_schema sees DDL
  ;; immediately on every gated driver; BigQuery needs only the dataset-qualified
  ;; relation ([[list-tables-sql]]).
  ;;
  ;; Schema bound as a parameter (or identifier-quoted, on BigQuery), never
  ;; interpolated: a name containing SQL metacharacters must not produce malformed
  ;; SQL or injection. (Not execute/native-query: execute requires this ns.)
  (let [[sql params] (list-tables-sql driver schema)
        query        (cond-> (lib/native-query (lib-be/application-database-metadata-provider db-id) sql)
                       (seq params) (lib/update-query-stage 0 assoc :params params))
        result       (qp/process-query query)]
    (mapv first (get-in result [:data :rows]))))

(defn cleanup-all-test-tables!
  "Drop every test scratch table in `schema` older than `:min-age-seconds`
  (default 3600), judged by the name-encoded timestamp alone. `schema` is the
  namespace to sweep: a schema string, or the catalog on engines whose
  namespace travels in the `:db` slot (MySQL). Non-test names and
  younger tables are left untouched; per-table drop is best-effort (logs, continues).

  Returns `{:dropped [...] :skipped-young [...] :non-matching-count <int>
  :drop-errors [{:table :error} ...]}`."
  [db-id db ^String schema {:keys [min-age-seconds] :or {min-age-seconds 3600}}]
  (let [driver   (keyword (:engine db))
        now-secs (quot (System/currentTimeMillis) 1000)]
    ;; Self-elevate: the sweep's DROPs run on write-data credentials via the
    ;; :transform pool. The information_schema enumeration is a fixed system query,
    ;; not user SQL, so sharing that scope is harmless.
    (driver.conn/with-transform-connection
      (reduce
       (fn [report tbl-name]
         (if-let [parsed (parse-scratch-table-name tbl-name)]
           (if (>= (- now-secs (:epoch-seconds parsed)) min-age-seconds)
             (try
               (driver/drop-table! driver db-id (keyword schema tbl-name))
               (update report :dropped conj tbl-name)
               (catch Exception e
                 (log/warn e "cleanup-all-test-tables! failed to drop" (keyword schema tbl-name))
                 (update report :drop-errors conj {:table tbl-name :error (ex-message e)})))
             (update report :skipped-young conj tbl-name))
           (update report :non-matching-count inc)))
       {:dropped [] :skipped-young [] :non-matching-count 0 :drop-errors []}
       (list-tables-in-schema driver db-id schema)))))

(defn sweep-old-test-tables!
  "Reap old test scratch tables, best-effort. Never throws; returns nil.

  Sweeps `schema` when non-blank, else the driver's `:db`-slot catalog. With
  neither, skips: an unscoped sweep could list tables in namespaces this
  connection should not touch."
  ([db-id db ^String schema]
   (sweep-old-test-tables! db-id db schema {}))
  ([db-id db ^String schema opts]
   (let [driver     (keyword (:engine db))
         namespace* (if (str/blank? schema)
                      (driver.sql/db-slot-value driver db)
                      schema)]
     (if (str/blank? namespace*)
       (log/debug "sweep-old-test-tables!: no schema or catalog to scope the sweep; skipping.")
       (try
         (let [report (cleanup-all-test-tables! db-id db namespace* opts)]
           (when (seq (:dropped report))
             (log/infof "sweep-old-test-tables! reaped %d orphaned scratch table(s) in %s: %s"
                        (count (:dropped report)) namespace* (pr-str (:dropped report))))
           (when (seq (:drop-errors report))
             (log/warnf "sweep-old-test-tables! encountered %d drop error(s) in %s: %s"
                        (count (:drop-errors report)) namespace* (pr-str (:drop-errors report)))))
         (catch Throwable e
           (log/warn e "sweep-old-test-tables! failed; continuing without sweep for" namespace*)))))
   nil))
