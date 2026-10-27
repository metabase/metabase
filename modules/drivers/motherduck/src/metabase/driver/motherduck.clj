(ns metabase.driver.motherduck
  "MotherDuck driver that connects to the MotherDuck Postgres endpoint to run DuckDB SQL.

  Inherit the Postgres JDBC connection, query execution, and compatible SQL generation. Override
  the methods where DuckDB SQL or the MotherDuck Postgres endpoint differs from Postgres.

  Prefer DuckDB's `duckdb_*()` metadata functions for table discovery and primary keys. DuckDB's
  Postgres catalogs are compatibility views over these functions. Querying the functions directly
  avoids catalog joins and dependence on the structure of those views. Scope each query to
  `current_database()` because a connection can access multiple databases."
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   ;; Register the parent before registering :motherduck.
   metabase.driver.postgres
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.common :as sql-jdbc.sync.common]
   [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(driver/register! :motherduck, :parent :postgres)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Connection                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.conn/connection-details->spec :motherduck
  [_driver details]
  ;; The MotherDuck Postgres endpoint requires TLS. `require` encrypts the connection without verifying
  ;; the server certificate or hostname. Set it explicitly so the connection does not inherit another SSL mode.
  ;; The startup option enables Metabase compatibility, including Postgres-style array serialization
  ;; and command tags for CREATE TABLE and INSERT.
  (-> (sql-jdbc.conn/connection-details->spec :postgres (assoc details :ssl true))
      (assoc :sslmode "require"
             :options "--compatibility-mode=metabase")))

;; The endpoint reports a DuckDB catalog error without Postgres SQLSTATE 42P01. Match the message
;; so `driver/table-exists?` returns false for a missing table instead of propagating the exception.
(defmethod sql-jdbc/impl-table-known-to-not-exist? :motherduck
  [_driver e]
  (boolean (re-find #"(?i)catalog error.*does not exist" (or (.getMessage ^java.sql.SQLException e) ""))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Feature flags                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Inherit supported features from Postgres and disable those without a MotherDuck implementation
;; or reliable metadata. The Postgres driver already restricts actions, table privileges, and
;; database replication to :postgres itself.
(doseq [feature [:describe-indexes            ; The inherited index query requires Postgres catalog functions.
                 ;; The endpoint's information_schema reports virtual generated columns as not
                 ;; generated. The field preprocessor below removes this unreliable value.
                 :describe-is-generated
                 :uploads
                 :persist-models
                 :connection-impersonation
                 ;; MotherDuck uses token authentication rather than Postgres roles and row-level security.
                 :test/rls-impersonation
                 :test/column-impersonation
                 ;; Foreign key sync is not supported. The test loader adds constraints after table
                 ;; creation, but DuckDB requires foreign keys in the CREATE TABLE statement.
                 :metadata/key-constraints
                 ;; Transforms are not supported at all.
                 :transforms/table
                 :transforms/python
                 :transforms/index-ddl
                 :transforms/testing
                 ;; The inherited fetch-table-indexes reads pg_index, which is empty on the endpoint, and calls
                 ;; a pg_get_indexdef arity it doesn't provide. Only transform index management uses these.
                 :index/fetch
                 :index/standalone-create
                 ;; DuckDB uses RE2, which does not support lookahead or lookbehind assertions.
                 :regex/lookaheads-and-lookbehinds]]
  (defmethod driver/database-supports? [:motherduck feature]
    [_driver _feature _db]
    false))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Metadata / sync                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private describe-database-tables-sql
  ;; Restrict discovery to the connected database, excluding system, temp, and other attached
  ;; databases. Also exclude internal views within the connected database.
  [(str/join
    "\n"
    ["SELECT schema_name AS \"schema\", table_name AS \"name\", comment AS \"description\""
     "FROM duckdb_tables()"
     "WHERE database_name = current_database()"
     "UNION ALL"
     "SELECT schema_name, view_name, comment"
     "FROM duckdb_views()"
     "WHERE database_name = current_database() AND internal = false"])])

(defmethod driver/describe-database* :motherduck
  [_driver database]
  {:tables (into #{} (sql-jdbc.execute/reducible-query database describe-database-tables-sql))})

;; Field sync uses the inherited information_schema query rather than duckdb_columns() to keep
;; its type names consistent with query result metadata. The MotherDuck Postgres endpoint exposes
;; Postgres type names through udt_name, while duckdb_columns() reports native DuckDB types.
;; Using those native types would require a separate mapping. Reusing the endpoint's type names
;; lets sync and query results share the Postgres type mapping and preserves JSON semantic-type
;; detection during sync.

;; Skip Postgres enum tagging and remove the unreliable generated-column flag. Disabling
;; :describe-is-generated alone does not remove the value returned by the inherited query.
(defmethod sql-jdbc.sync/describe-fields-pre-process-xf :motherduck
  [_driver _database & _args]
  (map #(dissoc % :database-is-generated)))

;; Use the static Postgres type mapping without querying pg_enum for unknown result types.
(defmethod driver/dynamic-database-types-lookup :motherduck
  [_driver _database _database-types]
  nil)

;; Read primary key columns directly from duckdb_constraints() instead of pgjdbc's joins across
;; Postgres catalog views. The column list preserves the key's declaration order.
;; This serves the JDBC `describe-table` path. Regular field sync uses the inherited
;; information_schema query, which also reports primary keys.
(def ^:private table-pks-sql
  (str "SELECT unnest(constraint_column_names) FROM duckdb_constraints()"
       " WHERE database_name = current_database() AND constraint_type = 'PRIMARY KEY'"
       " AND schema_name = ? AND table_name = ?"))

(defmethod sql-jdbc.describe-table/get-table-pks :motherduck
  [driver ^Connection conn _db-name-or-nil table]
  (with-open [stmt (sql-jdbc.sync.common/prepare-statement driver conn table-pks-sql [(:schema table) (:name table)])
              rs   (.executeQuery stmt)]
    (loop [pks []]
      (if (.next rs)
        (recur (conj pks (.getString rs 1)))
        pks))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Query processing                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Give string parameters an explicit type so the endpoint can determine result types at prepare
;; time. Casting only expression-literal-text-value misses strings in CASE branches and function
;; arguments, which also reach this method.
(defmethod sql.qp/->honeysql [:motherduck String]
  [_driver s]
  (h2x/cast :text s))

;; Metabase escapes LIKE patterns with backslashes. Postgres treats backslash as the default
;; escape character, but DuckDB requires an explicit ESCAPE clause.
(defmethod sql.qp/transform-literal-like-pattern-honeysql :motherduck
  [_driver like-rhs-honeysql]
  [:escape like-rhs-honeysql [:inline "\\"]])

;; DuckDB reads nested JSON with json_extract_string rather than the Postgres #>> operator.
;; Both return unquoted scalar text and JSON text for objects and arrays. Inline the JSONPath
;; so the endpoint can resolve the function's parameter types at prepare time.
(def ^:private json-cast-types
  "Cast types for unfolded JSON fields that differ from the inherited Postgres types.

  DuckDB defaults DECIMAL to DECIMAL(18,3), which rounds JSON numbers to three decimal places.
  Use DOUBLE to preserve the precision of the floating-point values parsed by Jackson."
  {"decimal" "double"})

(defmethod sql.qp/json-query :motherduck
  [_driver unwrapped-identifier nfc-field]
  {:pre [(h2x/identifier? unwrapped-identifier)]}
  (let [field-type (:database-type nfc-field)
        nfc-path   (:nfc-path nfc-field)
        json-path  (apply str "$" (for [k (rest nfc-path)]
                                    (format ".\"%s\"" (if (number? k) k (name k)))))]
    (h2x/cast (get json-cast-types field-type field-type)
              [:json_extract_string
               (sql.qp.u/nfc-field->parent-identifier unwrapped-identifier nfc-field)
               [:inline json-path]])))

;; DuckDB's substring accepts a position, not the regex pattern used by Postgres.
;; regexp_extract returns the full match with its default group of 0.
(defmethod sql.qp/->honeysql [:motherduck :regex-match-first]
  [driver [_ _opts arg pattern]]
  [:regexp_extract (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)])

;; DuckDB parses formatted timestamps with strptime rather than Postgres to_timestamp(text, text).
;; Cast the result to TIMESTAMPTZ to interpret it in the session time zone, matching Postgres.
(defmethod sql.qp/cast-temporal-string [:motherduck :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  (h2x/cast "timestamptz" [:strptime expr (h2x/literal "%Y%m%d%H%M%S")]))

;; DuckDB's decode converts UTF-8 bytes to text, like Postgres convert_from(expr, 'UTF8').
;; Delegate the parsed text to the driver's string coercion method.
(defmethod sql.qp/cast-temporal-byte [:motherduck :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal [:decode expr]))

(defmethod sql.qp/cast-temporal-byte [:motherduck :Coercion/ISO8601Bytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/ISO8601->DateTime [:decode expr]))

;; These HoneySQL helpers do not use the driver hierarchy. Pass :postgres explicitly because
;; DuckDB accepts the same current-time and interval SQL.
(defmethod sql.qp/current-datetime-honeysql-form :motherduck
  [_driver]
  (h2x/current-datetime-honeysql-form :postgres))

(defmethod sql.qp/add-interval-honeysql-form :motherduck
  [_driver hsql-form amount unit]
  (h2x/add-interval-honeysql-form :postgres hsql-form amount unit))

;; The inherited method puts time zone strings directly into HoneySQL, bypassing the String
;; method above. Inline the zones so the endpoint can resolve TIMEZONE at prepare time.
;; Cast untyped datetime arguments to timestamp for the same reason. For example:
;;   TIMEZONE('America/Los_Angeles', TIMEZONE('UTC', CAST(? AS timestamp)))
;; Arguments that already include a time zone need only the outer TIMEZONE call.
(defmethod sql.qp/->honeysql [:motherduck :convert-timezone]
  [driver [_ _opts arg target-timezone source-timezone]]
  (let [expr         (sql.qp/->honeysql driver (cond-> arg
                                                 (string? arg) u.date/parse))
        timestamptz? (or (sql.qp.u/field-with-tz? arg)
                         (h2x/is-of-type? expr "timestamptz")
                         (h2x/is-of-type? expr "timestamp with time zone"))
        _            (sql.u/validate-convert-timezone-args timestamptz? target-timezone source-timezone)
        expr         [:timezone (h2x/literal target-timezone)
                      (if-not timestamptz?
                        [:timezone (h2x/literal source-timezone) (h2x/->pg-timestamp expr)]
                        expr)]]
    (h2x/with-database-type-info expr "timestamp")))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Driver-managed table DDL                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The endpoint returns a result set for DROP TABLE, even in Metabase compatibility mode.
;; Use Statement.execute to accept it. The inherited executeUpdate path rejects result sets.
(defmethod driver/drop-table! :motherduck
  [driver db-id table-name]
  (let [sql (first (sql/format {:drop-table [:if-exists (keyword table-name)]}
                               :quoted true
                               :dialect (sql.qp/quote-style driver)))]
    (sql-jdbc.execute/do-with-connection-with-options
     driver db-id {:write? true}
     (fn [^Connection conn]
       (with-open [stmt (.createStatement conn)]
         (.execute stmt ^String sql))))))

;; The endpoint does not support Postgres COPY FROM STDIN. Use SQL-JDBC's batched INSERTs.
(defmethod driver/insert-into! :motherduck
  [driver db-id table-name column-names values]
  ((get-method driver/insert-into! :sql-jdbc) driver db-id table-name column-names values))
