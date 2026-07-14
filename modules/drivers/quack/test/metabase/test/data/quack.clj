(ns metabase.test.data.quack
  "Test-data implementation for the Quack driver.

  The Quack server is a single DuckDB process; we model each test database as a
  DuckDB **schema** in the server's native catalog (`main`). `create-db!`
  creates the schema and its tables (DDL sent over the Quack HTTP protocol via
  our client); `destroy-db!` drops the schema. Connection details are the same
  for every test DB (host/port/token) — the \"database name\" is encoded as the
  schema and surfaced to sync via describe-database*.

  This lets the Quack driver opt into the shared Metabase test-data +
  conformance suites (sql QP, parameters, transforms, etc.) just like a JDBC
  driver, without any JDBC."
  (:require
   [clojure.string :as str]
   [metabase.driver.quack.client :as quack.client]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime ZoneId ZonedDateTime]
           [java.time.format DateTimeFormatter]
           [java.util Date]))

(set! *warn-on-reflection* true)

;; Make :quack a child of :sql/test-extensions so the shared SQL test-data
;; helpers (qualified-name-components defaults, etc.) apply.
(sql.tx/add-test-extensions! :quack)

;;; ---------------------------------------------------------------------------
;;; Connection details — every test DB shares the same Quack endpoint.
;;; ---------------------------------------------------------------------------

(def default-details
  "Connection details pointing at the federated dev Quack server. Override with
  env vars for CI. Public so test namespaces can reuse it."
  {:host            (or (System/getenv "QUACK_HOST") "127.0.0.1")
   :port            (Integer/parseInt (or (System/getenv "QUACK_PORT") "9494"))
   :ssl             false
   :token           (or (System/getenv "QUACK_TOKEN") "devtoken")
   :use-ssl         false
   :timeout-seconds 120})

(declare schema-name)

(defmethod tx/dbdef->connection-details :quack
  [_driver _db-type db-def]
  (assoc default-details :db (schema-name db-def)))

;;; ---------------------------------------------------------------------------
;;; Naming: each test database maps to a DuckDB schema in the native catalog.
;;; ---------------------------------------------------------------------------

(defn- schema-name
  "Stable, lowercase schema name for a test database definition. DuckDB
  identifiers are case-insensitive but we lowercase to keep table refs simple."
  [db-def]
  (let [raw (:database-name db-def)]
    (-> raw name u/lower-case-en (str/replace #"[^a-z0-9_]" "_"))))

;;; ---------------------------------------------------------------------------
;;; DDL: build CREATE SCHEMA + CREATE TABLE statements from the dbdef, and run
;;; them through the Quack client (plain HTTP). No JDBC anywhere.
;;; ---------------------------------------------------------------------------

(defn- base-type->duckdb-type
  "Map a Metabase base-type to a DuckDB column type for test DDL."
  [base-type]
  (condp #(isa? %2 %1) base-type
    :type/Integer    "INTEGER"
    :type/BigInteger "BIGINT"
    :type/Boolean    "BOOLEAN"
    :type/Text       "VARCHAR"
    :type/Float      "DOUBLE"
    :type/Decimal    "DECIMAL(18,4)"
    :type/Date       "DATE"
    :type/DateTime   "TIMESTAMP"
    :type/Time       "TIME"
    :type/UUID       "UUID"
    "VARCHAR"))  ; safe fallback

(defn- field->column-ddl
  [{:keys [field-name base-type pk?]}]
  (let [col-type (if pk? "INTEGER" (base-type->duckdb-type base-type))]
    ;; field-name is a keyword or string; emit it quoted.
    (format "\"%s\" %s" (name field-name) col-type)))

(defn- table->create-ddl
  [schema-name {:keys [table-name field-definitions] :as _table-def}]
  (let [cols (str/join ", " (map field->column-ddl field-definitions))]
    (format "CREATE TABLE \"%s\".\"%s\" (%s);" schema-name (name table-name) cols)))

(def ^:private ^DateTimeFormatter duckdb-timestamp
  "DuckDB TIMESTAMP literal format (matches the server's expected shape)."
  (DateTimeFormatter/ofPattern "yyyy-MM-dd HH:mm:ss.SSS"))

(def ^:private ^DateTimeFormatter duckdb-date
  (DateTimeFormatter/ofPattern "yyyy-MM-dd"))

(def ^:private ^DateTimeFormatter duckdb-time
  (DateTimeFormatter/ofPattern "HH:mm:ss"))

(defn- instant-of
  "Coerce a temporal value to a [[java.time.Instant]] at UTC, or nil if not temporal."
  [v]
  (cond
    (instance? Instant v)        v
    (instance? OffsetDateTime v) (.toInstant ^OffsetDateTime v)
    (instance? ZonedDateTime v)  (.toInstant ^ZonedDateTime v)
    (instance? Date v)           (Instant/ofEpochMilli (.getTime ^Date v))
    :else                        nil))

(defn- render-value [v]
  (cond
    (nil? v)                 "NULL"
    (number? v)              (str v)
    (boolean? v)             (if v "TRUE" "FALSE")
    (string? v)              (str "'" (str/replace v "'" "''") "'")
    (instance? LocalDate v)  (str "'" (.format duckdb-date v) "'")
    (instance? LocalTime v)  (str "'" (.format duckdb-time v) "'")
    (instance? LocalDateTime v) (str "'" (.format duckdb-timestamp v) "'")
    (some-> (instant-of v) str) (let [inst (instant-of v)]
                                  (str "'" (.format duckdb-timestamp
                                                    (.atZone inst (ZoneId/of "UTC"))) "'"))
    :else                    (str "'" (str/replace (str v) "'" "''") "'")))

(defn- row-values
  "Render a single row's values for an INSERT statement."
  [row]
  (str "(" (str/join ", " (map render-value row)) ")"))

(defn- table->insert-ddl
  [schema-name {:keys [table-name field-definitions rows] :as _table-def}]
  (when (seq rows)
    (let [cols  (str/join ", " (map #(format "\"%s\"" (name (:field-name %))) field-definitions))
          vals  (str/join ", " (map row-values rows))]
      (format "INSERT INTO \"%s\".\"%s\" (%s) VALUES %s;" schema-name (name table-name) cols vals))))

(defn- execute!
  "Run one or more SQL statements over the Quack protocol. Throws on error."
  [& stmts]
  (doseq [stmt stmts :when (seq stmt)]
    ;; realize the reducible so errors surface
    (let [r (quack.client/execute-query default-details stmt)]
      (reduce (fn [_ _] nil) nil (:rows r)))))

;;; ---------------------------------------------------------------------------
;;; create-db! / destroy-db! — the test-data contract.
;;; ---------------------------------------------------------------------------

(defmethod tx/create-db! :quack
  [_driver {:keys [table-definitions] :as db-def} & {:keys [_]}]
  (let [sn (schema-name db-def)]
    (log/infof "Creating Quack test schema %s with %d table(s)" sn (count table-definitions))
    ;; schema first, then tables (DDL), then data. Use IF NOT EXISTS so a
    ;; half-created leftover from a prior failed run doesn't block recreation.
    (execute! (format "CREATE SCHEMA IF NOT EXISTS \"%s\";" sn))
    (doseq [table-def table-definitions]
      (execute! (format "DROP TABLE IF EXISTS \"%s\".\"%s\";" sn (name (:table-name table-def)))
                (table->create-ddl sn table-def)
                (table->insert-ddl sn table-def)))
    db-def))

(defmethod tx/destroy-db! :quack
  [_driver db-def]
  (let [sn (schema-name db-def)]
    (log/infof "Dropping Quack test schema %s" sn)
    (try (execute! (format "DROP SCHEMA IF EXISTS \"%s\" CASCADE;" sn))
         (catch Throwable e (log/warn e "failed to drop Quack test schema")))))

;;; ---------------------------------------------------------------------------
;;; Test-data hooks: how the sync/QP layers talk to our schema-as-db model.
;;; ---------------------------------------------------------------------------

;; Quack exposes tables under <schema>; Metabase sync already discovers them.
;; Default schema is nil so we don't accidentally restrict sync to one schema.
(defmethod sql.tx/qualified-name-components :quack
  ([_ db-name] [db-name])
  ([_ db-name table-name] [db-name table-name])
  ([_ db-name table-name field-name] [db-name table-name field-name]))

;; DuckDB primary keys: INTEGER auto-increment isn't default; tests use plain
;; INTEGER ids and the PK metadata comes from field defs.
(defmethod sql.tx/pk-sql-type :quack [_] "INTEGER")

;; Map Metabase base-types to DuckDB DDL types for the test-data helpers.
(doseq [[base-type sql-type]
        {:type/Integer    "INTEGER"
         :type/BigInteger "BIGINT"
         :type/Boolean    "BOOLEAN"
         :type/Text       "VARCHAR"
         :type/Float      "DOUBLE"
         :type/Decimal    "DECIMAL(18,4)"
         :type/Date       "DATE"
         :type/DateTime   "TIMESTAMP"
         :type/Time       "TIME"
         :type/UUID       "UUID"}]
  (defmethod sql.tx/field-base-type->sql-type [:quack base-type] [_ _] sql-type))

;; Most test datasets load fine with the generic mapping above. Tell the test
;; harness DuckDB is happy creating tables/inserts (no special grant/role dance).
(defmethod tx/dataset-already-loaded? :quack
  [_driver _dbdef]
  ;; Best-effort: treat as not-loaded so create-db! always runs (it's idempotent).
  false)
