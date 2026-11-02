(ns metabase.driver.motherduck
  "MotherDuck driver that connects to the MotherDuck Postgres endpoint to run DuckDB SQL.

  Inherit the Postgres JDBC connection, query execution, and compatible SQL generation. Override the methods where
  DuckDB SQL or the MotherDuck Postgres endpoint differs from Postgres.

  Prefer DuckDB's `duckdb_*()` metadata functions for table discovery and primary keys. DuckDB's Postgres catalogs are
  compatibility views over these functions. Querying the functions directly avoids catalog joins and dependence on the
  structure of those views. Scope each query to `current_database()` because a connection can access multiple
  databases."
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   ;; Register the parent before registering :motherduck.
   [metabase.driver.postgres]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.quoting :as sql-jdbc.quoting]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.common :as sql-jdbc.sync.common]
   [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.performance :as perf])
  (:import
   (java.sql Connection ResultSet ResultSetMetaData SQLException Types)
   (java.time LocalTime OffsetTime ZoneOffset)))

(set! *warn-on-reflection* true)

(driver/register! :motherduck, :parent :postgres)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Connection                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.conn/connection-details->spec :motherduck
  [_driver {:keys [tunnel-enabled] :as details}]
  ;; The MotherDuck Postgres endpoint requires TLS, and the password is a MotherDuck token, so verify the server.
  ;; `DefaultJavaSSLFactory` checks the certificate chain against the JVM's trust store; pgjdbc's default factory
  ;; expects a root certificate file in ~/.postgresql instead. `verify-full` also checks the hostname. Through an SSH
  ;; tunnel, pgjdbc would check it against localhost, so check only the chain there.
  ;; The startup option enables Metabase compatibility, including Postgres-style array serialization and command tags
  ;; for CREATE TABLE and INSERT.
  ;; The endpoint ignores the user name and the form has no field for it; send the one MotherDuck's docs use.
  (-> (sql-jdbc.conn/connection-details->spec :postgres (assoc details :ssl true, :user "postgres"))
      (assoc :sslmode    (if tunnel-enabled "verify-ca" "verify-full")
             :sslfactory "org.postgresql.ssl.DefaultJavaSSLFactory"
             :options    "--compatibility-mode=metabase")))

;; SQL on a connection can switch its current database, with `USE`, `SET search_path` or `SET schema`, and the switch
;; lasts for the session. Metabase qualifies tables with only the schema, so later queries and syncs that reuse the
;; pooled connection would read the other database. Switch back to the connection's own database at every checkout.
;; `getCatalog` is the database the connection opened with, whatever SQL has switched to since.
(defmethod sql-jdbc.execute/do-with-connection-with-options :motherduck
  [driver db-or-id-or-spec options f]
  ((get-method sql-jdbc.execute/do-with-connection-with-options :postgres)
   driver db-or-id-or-spec options
   (fn [^Connection conn]
     (with-open [stmt (.createStatement conn)]
       (.execute stmt (str "USE " (sql.u/quote-name driver :database (.getCatalog conn)))))
     (f conn))))

;; The endpoint reports a DuckDB catalog error without Postgres SQLSTATE 42P01. Match the message
;; so `driver/table-exists?` returns false for a missing table instead of propagating the exception.
(defmethod sql-jdbc/impl-table-known-to-not-exist? :motherduck
  [_driver e]
  (boolean (re-find #"(?i)catalog error.*does not exist"
                    (or (.getMessage ^java.sql.SQLException e)
                        ""))))

;; The endpoint's messages for a bad token or database name don't match Postgres's, so map them here to highlight the
;; field in the connection form.
(defmethod driver/humanize-connection-error-message :motherduck
  [driver messages]
  (condp re-matches (str (first messages))
    #"^FATAL: invalid username/password$"
    :password-incorrect

    #"^FATAL: could not connect to database: .*no database/share named .* found$"
    :database-name-incorrect

    ((get-method driver/humanize-connection-error-message :postgres) driver messages)))

;; pgjdbc sets the session time zone to the JVM's at connection time. The endpoint's `SHOW TIMEZONE` always answers
;; UTC regardless, but `current_setting` reports the session's actual time zone.
(defmethod driver/db-default-timezone :motherduck
  [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver database nil
   (fn [^Connection conn]
     (with-open [stmt (.prepareStatement conn "SELECT current_setting('TimeZone')")
                 rset (.executeQuery stmt)]
       (when (.next rset)
         (.getString rset 1))))))

;; Postgres lists hosting providers to recognize from the host name; none of them host MotherDuck.
(defmethod driver/extra-info :motherduck
  [driver]
  (assoc ((get-method driver/extra-info :postgres) driver) :providers []))

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
                 ;; Before enabling: the inherited SET ROLE quotes role names on the server with Postgres's
                 ;; `quote_ident(?)`. Check that DuckDB's quote_ident escapes identically, or SET ROLE is injectable.
                 :connection-impersonation
                 ;; MotherDuck uses token authentication rather than Postgres roles and row-level security.
                 :test/rls-impersonation
                 :test/column-impersonation
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
                 ;; This disables some fancy MBQL expressions, like extracting email domains and URL hostnames.
                 :regex/lookaheads-and-lookbehinds]]
  (defmethod driver/database-supports? [:motherduck feature]
    [_driver _feature _db]
    false))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Metadata / sync                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private describe-database-tables-sql
  ;; Restrict discovery to the connected database, excluding system, temp, and other attached
  ;; databases. Also exclude internal views within the connected database.
  ;; `estimated_size` counts inserted rows but not deletes. Like the Postgres query, report 0 as unknown.
  [(str/join
    "\n"
    ["SELECT schema_name AS \"schema\", table_name AS \"name\", comment AS \"description\","
     "  NULLIF(estimated_size, 0) AS \"estimated_row_count\""
     "FROM duckdb_tables()"
     "WHERE database_name = current_database()"
     "UNION ALL"
     "SELECT schema_name, view_name, comment, NULL"
     "FROM duckdb_views()"
     "WHERE database_name = current_database() AND internal = false"])])

(defmethod driver/describe-database* :motherduck
  [_driver database]
  {:tables (into #{} (sql-jdbc.execute/reducible-query database describe-database-tables-sql))})

;; Based on the Postgres query, with three changes:
;; - Primary keys come from duckdb_constraints(), scoped to the current database. The endpoint's
;;   information_schema.table_constraints and key_column_usage list every database the connection can see, so the
;;   Postgres join, which has no catalog, takes keys from same-named tables in other databases and repeats rows.
;; - Comments come from duckdb_columns(). The Postgres query finds them with `format('%I.%I')::regclass`, and the
;;   endpoint's regclass doesn't undo the `""` that %I writes for a `"` in a table name, so the lookup fails.
;; - There's no materialized-view branch, since DuckDB has no materialized views. The generated-column flag is left
;;   out because the endpoint reports it unreliably.
;; Columns and their types still come from information_schema.columns. The endpoint gives Postgres type names in
;; udt_name, where duckdb_columns() has DuckDB's own, so sync and query results share the Postgres type mapping, and
;; JSON columns are still detected during sync.
(defmethod sql-jdbc.sync/describe-fields-sql :motherduck
  [driver & {:keys [schema-names table-names]}]
  (sql/format
   {:select    [[:c.column_name :name]
                [[:case
                  [:in :c.udt_schema [[:inline "public"] [:inline "pg_catalog"]]]
                  [:format [:inline "%s"] :c.udt_name]
                  :else
                  [:format [:inline "\"%s\".\"%s\""] :c.udt_schema :c.udt_name]]
                 :database-type]
                [[:- :c.ordinal_position [:inline 1]] :database-position]
                [:c.table_schema :table-schema]
                [:c.table_name :table-name]
                [[:not= :pk.column_name nil] :pk?]
                [:dc.comment :field-comment]
                [[:and
                  [:or [:= :c.column_default nil] [:= [:lower :c.column_default] [:inline "null"]]]
                  [:= :c.is_nullable [:inline "NO"]]
                  [:not [:or
                         [:and [:!= :c.column_default nil] [:like :c.column_default [:inline "%nextval(%"]]]
                         [:!= :c.is_identity [:inline "NO"]]]]]
                 :database-required]
                [:c.column_default :database-default]
                [[:or
                  [:and [:!= :c.column_default nil] [:like :c.column_default [:inline "%nextval(%"]]]
                  [:!= :c.is_identity [:inline "NO"]]]
                 :database-is-auto-increment]
                [[:= :c.is_nullable [:inline "YES"]] :database-is-nullable]]
    :from      [[:information_schema.columns :c]]
    :left-join [[{:select [:schema_name :table_name [[:unnest :constraint_column_names] :column_name]]
                  :from   [[[:duckdb_constraints]]]
                  :where  [:and
                           [:= :database_name [:current_database]]
                           [:= :constraint_type [:inline "PRIMARY KEY"]]]}
                 :pk]
                [:and
                 [:= :c.table_schema :pk.schema_name]
                 [:= :c.table_name :pk.table_name]
                 [:= :c.column_name :pk.column_name]]
                [[:duckdb_columns] :dc]
                [:and
                 [:= :dc.database_name [:current_database]]
                 [:= :c.table_schema :dc.schema_name]
                 [:= :c.table_name :dc.table_name]
                 [:= :c.column_name :dc.column_name]]]
    :where     [:and
                [:= :c.table_catalog [:current_database]]
                [:raw "c.table_schema !~ '^information_schema|catalog_history|pg_'"]
                (when (seq schema-names)
                  [:in :c.table_schema schema-names])
                (when (seq table-names)
                  [:in :c.table_name table-names])]
    :order-by  [:table-schema :table-name :database-position]}
   :dialect (sql.qp/quote-style driver)))

;; Skip the Postgres enum tagging, which queries pg_enum.
(defmethod sql-jdbc.sync/describe-fields-pre-process-xf :motherduck
  [driver database & args]
  (apply (get-method sql-jdbc.sync/describe-fields-pre-process-xf :sql-jdbc) driver database args))

;; Use the static Postgres type mapping without querying pg_enum for unknown result types.
(defmethod driver/dynamic-database-types-lookup :motherduck
  [_driver _database _database-types]
  nil)

;; Read primary key columns directly from duckdb_constraints() instead of pgjdbc's joins across
;; Postgres catalog views. The column list preserves the key's declaration order.
;; This serves the JDBC `describe-table` path. Regular field sync reads primary keys in
;; `describe-fields-sql` above.
(def ^:private table-pks-sql
  (str "SELECT unnest(constraint_column_names) FROM duckdb_constraints()"
       " WHERE database_name = current_database() AND constraint_type = 'PRIMARY KEY'"
       " AND schema_name = ? AND table_name = ?"))

(defmethod sql-jdbc.describe-table/get-table-pks :motherduck
  [driver ^Connection conn _db-name-or-nil table]
  (with-open [stmt (sql-jdbc.sync.common/prepare-statement driver conn table-pks-sql [(:schema table) (:name table)])
              rs   (.executeQuery stmt)]
    (loop [pks (transient [])]
      (if (.next rs)
        (recur (conj! pks (.getString rs 1)))
        (persistent! pks)))))

;; The inherited query reads pg_constraint, matching key columns with ANY(conkey). Read
;; duckdb_constraints() instead. Its column lists are ordered, and unnesting both in one SELECT
;; pairs them by position, so each column of a composite key maps to its referenced column. DuckDB
;; only allows foreign keys within a schema, so the referenced table shares the referencing
;; table's schema.
(defmethod sql-jdbc.sync/describe-fks-sql :motherduck
  [driver & {:keys [schema-names table-names]}]
  (sql/format {:select   [[:schema_name "fk-table-schema"]
                          [:table_name "fk-table-name"]
                          [[:unnest :constraint_column_names] "fk-column-name"]
                          [:schema_name "pk-table-schema"]
                          [:referenced_table "pk-table-name"]
                          [[:unnest :referenced_column_names] "pk-column-name"]]
               :from     [[[:duckdb_constraints]]]
               :where    [:and
                          [:= :database_name [:current_database]]
                          [:= :constraint_type [:inline "FOREIGN KEY"]]
                          (when (seq schema-names)
                            [:in :schema_name schema-names])
                          (when (seq table-names)
                            [:in :table_name table-names])]
               :order-by [:fk-table-schema :fk-table-name]}
              :dialect (sql.qp/quote-style driver)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Query processing                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Give string parameters an explicit type so the endpoint can determine result types at prepare
;; time. Casting only expression-literal-text-value misses strings in CASE branches and function
;; arguments, which also reach this method.
(defmethod sql.qp/->honeysql [:motherduck String]
  [_driver s]
  (h2x/cast :text s))

;; The default `:sql` behaviour for escaping LIKE patterns is to use backslashes with an explicit `ESCAPE` clause.
;; However, Postgres has backslashes built in and so it inherits from the shared
;; `:metabase.driver.sql.query-processor.like-escape-char-built-in/like-escape-char-built-in` pseudo-driver.
;; A child driver like `:motherduck` can't remove that parent from `:postgres`, so we have to explicitly override
;; the escaping of LIKE patterns here. Delegates to the core `:sql` behaviour to stick close to the baseline.
(defmethod sql.qp/transform-literal-like-pattern-honeysql :motherduck
  [driver like-rhs-honeysql]
  ((get-method sql.qp/transform-literal-like-pattern-honeysql :sql) driver like-rhs-honeysql))

;; DuckDB reads nested JSON with json_extract_string rather than the Postgres #>> operator.
;; Both return unquoted scalar text and JSON text for objects and arrays. Inline the path
;; so the endpoint can resolve the function's parameter types at prepare time.
;;
;; The path is a JSON Pointer (RFC 6901), not a JSONPath. The keys come from the warehouse's JSON data, and JSONPath
;; can't express every key: a `"` or `\` breaks the path, `x"."y` reaches a different nested key, and `"*"` is still a
;; wildcard when quoted. JSON Pointer escapes only `~` and `/`, and matches keys exactly, like Postgres's #>>.
(def ^:private json-cast-types
  "Cast types for unfolded JSON fields that differ from the inherited Postgres types.

  DuckDB defaults `DECIMAL` to `DECIMAL(18,3)`, which rounds JSON numbers to three decimal places.
  Use `DOUBLE` to preserve the precision of the floating-point values parsed by Jackson."
  {"decimal" "double"})

(defn- json-pointer
  "Return the RFC 6901 JSON Pointer for the keys in `path`, e.g. `[\"a/b\" \"c\"]` -> `\"/a~1b/c\"`."
  [path]
  (apply str (for [k path]
               (-> (if (number? k) (str k) (name k))
                   (str/replace "~" "~0")
                   (str/replace "/" "~1")
                   (->> (str "/"))))))

(defmethod sql.qp/json-query :motherduck
  [_driver unwrapped-identifier {:keys [database-type nfc-path] :as nfc-field}]
  {:pre [(h2x/identifier? unwrapped-identifier)]}
  (h2x/cast (get json-cast-types database-type database-type)
            [:json_extract_string
             (sql.qp.u/nfc-field->parent-identifier unwrapped-identifier nfc-field)
             [:inline (json-pointer (rest nfc-path))]]))

(defn- capturing-group-count
  "Count the capturing groups in regex `pattern`. Java's syntax covers the RE2 syntax DuckDB accepts, except
  RE2's `(?P<name>...)` named groups, whose syntax and names (`_` is allowed) Java rejects. Names don't affect the
  count, so named groups are rewritten to plain `(...)` first.

  Return 0 when the pattern still doesn't compile in Java; DuckDB reports any real syntax error when the query runs."
  [pattern]
  (try
    (-> (str/replace pattern #"\(\?P<\w+>" "(")
        java.util.regex.Pattern/compile
        (.matcher "")
        (.groupCount))
    (catch java.util.regex.PatternSyntaxException _
      0)))

;; DuckDB's substring accepts a position, not the regex pattern used by Postgres. Match Postgres
;; substring(x FROM pattern) semantics with regexp_extract: return the first capturing group if the pattern
;; has one, otherwise the whole match, and NULL rather than DuckDB's empty string when nothing matches.
(defmethod sql.qp/->honeysql [:motherduck :regex-match-first]
  [driver [_ _opts arg pattern]]
  (let [arg-hsql     (sql.qp/->honeysql driver arg)
        pattern-hsql (sql.qp/->honeysql driver pattern)
        group        (if (and (string? pattern)
                              (pos? (capturing-group-count pattern)))
                       1
                       0)]
    [:case
     [:regexp_matches arg-hsql pattern-hsql]
     [:regexp_extract arg-hsql pattern-hsql [:inline group]]]))

;; DuckDB parses formatted timestamps with strptime rather than Postgres to_timestamp(text, text).
;; Cast the result to TIMESTAMPTZ to interpret it in the session time zone, matching Postgres.
(defmethod sql.qp/cast-temporal-string [:motherduck :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  (h2x/cast "timestamptz" [:strptime expr (h2x/literal "%Y%m%d%H%M%S")]))

;; DuckDB's `decode` converts UTF-8 bytes to text, like Postgres convert_from(expr, 'UTF8').
;; Delegate the parsed text to the driver's string coercion method.
(defmethod sql.qp/cast-temporal-byte [:motherduck :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal [:decode expr]))

(defmethod sql.qp/cast-temporal-byte [:motherduck :Coercion/ISO8601Bytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/ISO8601->DateTime [:decode expr]))

;; Postgres computes these units by dividing a coarser diff, relying on integer division to truncate. DuckDB's `/`
;; always returns a DOUBLE, so truncate the result. TRUNC comes first because DuckDB's cast to an integer rounds.
(doseq [unit [:quarter :week :hour :minute]]
  (defmethod sql.qp/datetime-diff [:motherduck unit]
    [driver unit x y]
    (h2x/->integer [:trunc ((get-method sql.qp/datetime-diff [:postgres unit]) driver unit x y)])))

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
                      (if timestamptz?
                        expr
                        [:timezone (h2x/literal source-timezone) (h2x/->pg-timestamp expr)])]]
    ;; The tag makes the inherited :relative-datetime, :now and :today methods wrap NOW() in TIMEZONE(target, NOW()),
    ;; so both sides of a filter compare in the target zone (#80155). It holds the inlined literal for the same reason.
    (h2x/with-type-info expr {:database-type                          "timestamp"
                              :metabase.driver.postgres/target-timezone (h2x/literal target-timezone)})))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Reading results                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private postgres-timetz-pattern
  "A TIMETZ value in Postgres's text format, such as `12:34:56.789+05:30`."
  #"\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}(?::\d{2}){0,2}")

(def ^:private endpoint-timetz-pattern
  "A TIMETZ value as the endpoint sends it: the UTC time in year 1. The date says which way converting to UTC wrapped
  past midnight. `12:34:56+05` arrives as `0001-01-01 07:34:56Z`, `20:00:00-05` as `0001-01-02 01:00:00Z`, and
  `00:00:00+15:59` as `0001-12-31 08:01:00Z BC`."
  #"0001-(?:01-0[12] (\d{2}:\d{2}:\d{2}(?:\.\d+)?)Z|12-31 (\d{2}:\d{2}:\d{2}(?:\.\d+)?)Z BC)")

;; The endpoint sends TIMETZ values in the format above, which pgjdbc can't parse. The inherited reader then falls back
;; to a generic parser and returns a year-1 ZonedDateTime. Read them as the UTC OffsetTime they represent instead. That
;; loses the original offset, but Metabase converts every OffsetTime to the results time zone before showing or exporting
;; it, so the output is the same as Postgres gives for the original value. Values in Postgres's format go to the
;; inherited reader, so this keeps working if the endpoint is fixed. Fail on any other format rather than guess.
(defmethod sql-jdbc.execute/read-column-thunk [:motherduck Types/TIME]
  [driver ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (let [parent-thunk ((get-method sql-jdbc.execute/read-column-thunk [:postgres Types/TIME]) driver rs rsmeta i)]
    (if-not (= "timetz" (.getColumnTypeName rsmeta i))
      parent-thunk
      (fn []
        (when-let [s (.getString rs i)]
          (if (re-matches postgres-timetz-pattern s)
            (parent-thunk)
            (if-let [[_ same-or-next-day previous-day] (re-matches endpoint-timetz-pattern s)]
              (OffsetTime/of (LocalTime/parse (or same-or-next-day previous-day)) ZoneOffset/UTC)
              (throw (ex-info (tru "Cannot read the TIMETZ value {0} in column {1}. Cast the column to VARCHAR to read it."
                                   (pr-str s) (.getColumnLabel rsmeta i))
                              {:value s, :column (.getColumnLabel rsmeta i)})))))))))

;; The endpoint sends floating-point infinities as `+Inf` and `-Inf`, which pgjdbc can't parse, so any result containing
;; one fails. Postgres sends `Infinity`, which it can. When pgjdbc fails, read exactly these two strings as the
;; infinities and rethrow on anything else. NaN already reads correctly.
(defn- endpoint-infinity [s]
  (case s
    "+Inf" Double/POSITIVE_INFINITY
    "-Inf" Double/NEGATIVE_INFINITY
    nil))

(defn- read-float-thunk
  "Wrap the `jdbc-type` reader inherited from Postgres to read the endpoint's infinities, made into the right type by
  `coerce`."
  [driver ^ResultSet rs rsmeta ^Integer i jdbc-type coerce]
  (let [parent-thunk ((get-method sql-jdbc.execute/read-column-thunk [:postgres jdbc-type]) driver rs rsmeta i)]
    (fn []
      (try
        (parent-thunk)
        (catch SQLException e
          (if-let [infinity (endpoint-infinity (.getString rs i))]
            (coerce infinity)
            (throw e)))))))

(defmethod sql-jdbc.execute/read-column-thunk [:motherduck Types/DOUBLE]
  [driver rs rsmeta i]
  (read-float-thunk driver rs rsmeta i Types/DOUBLE double))

(defmethod sql-jdbc.execute/read-column-thunk [:motherduck Types/REAL]
  [driver rs rsmeta i]
  (read-float-thunk driver rs rsmeta i Types/REAL unchecked-float))

(defn- parse-float-array
  "Parse the endpoint's text for a one-dimensional float array, such as `{+Inf,NULL,1.5}`, into a vector of `coerce`d
  elements. Return nil for anything else, including nested arrays."
  [s coerce]
  (when-let [[_ elements] (re-matches #"\{([^{}\"]*)\}" (str s))]
    (let [parsed (for [element (str/split elements #",")]
                   (if (= element "NULL")
                     ::null
                     (some-> (or (endpoint-infinity element) (parse-double element)) coerce)))]
      (when (perf/every? some? parsed)
        (perf/mapv #(when-not (= % ::null) %) parsed)))))

;; A float array containing an infinity fails the same way. Postgres returns it as a vector of floats.
(defmethod sql-jdbc.execute/read-column-thunk [:motherduck Types/ARRAY]
  [driver ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (let [parent-thunk ((get-method sql-jdbc.execute/read-column-thunk [:postgres Types/ARRAY]) driver rs rsmeta i)]
    (if-let [coerce ({"_float4" unchecked-float, "_float8" double} (.getColumnTypeName rsmeta i))]
      (fn []
        (try
          (parent-thunk)
          (catch SQLException e
            (or (parse-float-array (.getString rs i) coerce)
                (throw e)))))
      parent-thunk)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Driver-managed table DDL                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The endpoint returns a result set for DROP TABLE, even in Metabase compatibility mode.
;; Use Statement.execute to accept it. The inherited executeUpdate path rejects result sets.
;; Qualify the name like the :sql-jdbc method does: a plain `keyword` would let HoneySQL rewrite `-` to `_` in the
;; schema part, dropping a table in a different schema.
(defmethod driver/drop-table! :motherduck
  [driver db-id table-name]
  (let [sql (first (sql/format {:drop-table [:if-exists (sql-jdbc.quoting/dot-qualified table-name)]}
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
