(ns metabase.driver.clickhouse
  "Driver for ClickHouse databases"
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.clickhouse-introspection]
   [metabase.driver.clickhouse-nippy]
   [metabase.driver.clickhouse-qp]
   [metabase.driver.clickhouse-version :as clickhouse-version]
   [metabase.driver.common :as driver.common]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.quoting :refer [dot-qualified quote-identifier with-quoting]]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf])
  (:import
   (com.clickhouse.client.api.query QuerySettings)
   (java.sql Connection SQLException Statement PreparedStatement)
   (java.time LocalDate)
   (java.util Random)))

(set! *warn-on-reflection* true)

(System/setProperty "clickhouse.jdbc.v2" "true")
(driver/register! :clickhouse :parent #{:sql-jdbc})

(defmethod driver/display-name :clickhouse [_] "ClickHouse")

;; the connection is made through the proxy when one is set, so it is the host actually contacted.
(defmethod driver/host-carrying-parameters :clickhouse [_driver] ["proxy_host"])

(defmethod driver/non-host-parameters :clickhouse
  [_driver]
  ["proxy_password" "proxy_port" "proxy_type" "proxy_user" "server_time_zone" "server_version"
   "socket_tcp_nodelay" "use_server_time_zone" "use_server_time_zone_for_dates"])

(defmethod driver/disallowed-connection-parameters :clickhouse
  [driver]
  (into ((get-method driver/disallowed-connection-parameters :sql-jdbc) driver)
        [;; Loads arbitrary classes
         "typeMappings"
         ;; Loads arbitrary classes
         "type_hint_mapping"
         ;; Instantiates an arbitrary class
         "jdbc_json_parser_factory"
         ;; Instantiates an arbitrary class
         "jdbc_metrics_recorder"
         ;; Instantiates an arbitrary class (legacy v1 driver)
         "dialect"
         ;; Loads arbitrary classes (legacy v1 driver)
         "load_balancing_policy"]))

(defn- quote-schema [s] (sql.u/quote-name :clickhouse :schema s))
(defn- quote-field  [s] (sql.u/quote-name :clickhouse :field s))

(defmethod driver/prettify-native-form :clickhouse
  [_ native-form]
  (sql.u/format-sql-and-fix-params :mysql native-form))

(doseq [[feature supported?] {:actions                          false
                              :convert-timezone                 false
                              :database-routing                 false
                              :datetime-diff                    true
                              :describe-default-expr            true
                              ;; JDBC driver always provides "NO" for the IS_GENERATEDCOLUMN JDBC metadata
                              :describe-is-generated            false
                              :describe-is-nullable             true
                              :workspace                        true
                              :expression-literals              true
                              :expressions/date                 true
                              :expressions/float                true
                              :expressions/integer              true
                              :expressions/text                 true
                              ;; ClickHouse uses both index lifecycles: ORDER BY is inlined into the MergeTree engine
                              ;; clause at creation, while data-skipping indexes are added as separate statements after.
                              :index/fetch                      true
                              :index/inline-create              true
                              :index/standalone-create          true
                              ;; The JDBC driver sends the query timeout as the `max_execution_time` server setting,
                              ;; which fails for users with `readonly = 1` (#85850). Long running queries will still
                              ;; be cancelled by `schedule-query-timeout-cancel!`.
                              :jdbc/set-query-timeout           false
                              :left-join                        true
                              :metadata/key-constraints         false
                              :native-pivot-tables              true
                              :now                              true
                              :regex/lookaheads-and-lookbehinds false
                              :rename                           true
                              :schemas                          true
                              :set-timezone                     true
                              :split-part                       true
                              :stage-ctes                       true
                              :standard-deviation-aggregations  true
                              :test/date-time-type              false
                              :test/jvm-timezone-setting        false
                              :test/time-type                   false
                              :transforms/python                true
                              :transforms/table                 true
                              :transforms/testing               true
                              :upload-with-auto-pk              false
                              :window-functions/cumulative      (not driver-api/is-test?)
                              :window-functions/offset          true}]
  (defmethod driver/database-supports? [:clickhouse feature] [_driver _feature _db] supported?))

(defmethod driver/qualified-name-components :clickhouse
  [_driver]
  ;; ClickHouse emits 2-part `db.table`. Its "database" sits at the schema AST position
  ;; (one level above the table) — same position SQLGlot stores in `Table.db`. Per
  ;; [[driver/qualified-name-components]] this is `:schema`, NOT `:db` (which is reserved
  ;; for catalog-level / 3-part identifiers like BigQuery's project).
  [:schema])

(def ^:private default-connection-details
  {:user "default" :password "" :dbname "default" :host "localhost" :port 8123})

(defmethod sql-jdbc.execute/do-with-connection-with-options :clickhouse
  [driver db-or-id-or-spec {:keys [^String session-timezone _write?] :as options} f]
  (sql-jdbc.execute/do-with-resolved-connection
   driver
   db-or-id-or-spec
   options
   (fn [^java.sql.Connection conn]
     (when-not (sql-jdbc.execute/recursive-connection?)
       (let [^com.clickhouse.jdbc.ConnectionImpl clickhouse-conn (.unwrap conn com.clickhouse.jdbc.ConnectionImpl)
             query-settings (new QuerySettings)]
         (when session-timezone
           (.serverSetting query-settings "session_timezone" session-timezone))
         (.setDefaultQuerySettings clickhouse-conn query-settings))
       (sql-jdbc.execute/set-best-transaction-level! driver conn)
       (sql-jdbc.execute/set-time-zone-if-supported! driver conn session-timezone))
     (f conn))))

(defn- first-db-name
  "Extract a single database name from a legacy `dbname` value. Older configurations stored
  multiple databases here, separated by spaces, commas, or both (matching the
  `:db-filters-patterns` syntax). These values weren't migrated, so we have to keep handling
  them. The chosen name is just the connection's default database — other databases are
  reached by qualifying queries (#70798, #73175)."
  [s]
  (->> (str/split (or s "") #"[\s,]+")
       (remove str/blank?)
       first))

(defmethod driver.sql/default-schema :clickhouse
  [driver database]
  ;; ClickHouse opens a database where other engines have a default schema, so an unqualified reference resolves to
  ;; the one this connection opened rather than to anything the driver could name on its own. `:db` is the older
  ;; spelling of `:dbname`, and only `:dbname` reaches the JDBC URL, so details naming a database answer for
  ;; themselves; details naming none connect anyway, and the server reports where they landed.
  (let [details (:details database)]
    (or (first-db-name (:dbname details))
        (first-db-name (:db details))
        (sql-jdbc.execute/do-with-connection-with-options
         driver database nil
         (fn [^java.sql.Connection conn]
           (with-open [stmt (.createStatement conn)
                       rset (.executeQuery stmt "SELECT currentDatabase()")]
             (when (.next rset)
               (.getString rset 1))))))))

(defmethod sql-jdbc.conn/connection-details->spec :clickhouse
  [_ details]
  (let [;; ensure defaults merge on top of nils
        details (reduce-kv (fn [m k v] (assoc m k (or v (k default-connection-details))))
                           default-connection-details
                           details)
        {:keys [user password dbname host port ssl clickhouse-settings max-open-connections]} details
        dbname (first-db-name dbname)
        host   (cond ; JDBCv1 used to accept schema in the `host` configuration option
                 (str/starts-with? host "http://")  (subs host 7)
                 (str/starts-with? host "https://") (subs host 8)
                 :else host)]
    ;; https://clickhouse.com/docs/integrations/language-clients/java/jdbc
    (-> {:classname                      "com.clickhouse.jdbc.ClickHouseDriver"
         :subprotocol                    "clickhouse"
         :subname                        (str "//" host ":" port "/" dbname)
         :password                       (or password "")
         :user                           user
         :ssl                            (boolean ssl)
         :use_server_time_zone_for_dates true
         :product_name                   (format "metabase/%s" (:tag driver-api/mb-version-info))
         :remember_last_set_roles        true
         :http_connection_provider       "HTTP_URL_CONNECTION"
         :jdbc_ignore_unsupported_values "true"
         :jdbc_schema_term               "schema"
         :ignore_unknown_config_key      true
         :max_open_connections           (or max-open-connections 100)
         :custom_http_params             (cond-> "select_sequential_consistency=1"
                                           (not (str/blank? clickhouse-settings))
                                           (str "," clickhouse-settings))
         :jdbc_metadata_use_show_statements false}
        (sql-jdbc.common/handle-additional-options details :separator-style :url))))

(defmethod sql-jdbc.conn/data-warehouse-connection-pool-properties :clickhouse
  [driver database]
  ;; A ClickHouse connection is an HTTP client that does not contact the server when c3p0 acquires
  ;; it, so it will succeed even if the server is down, whereas other drivers would fail here.
  ;; However the `testConnectionOnCheckout` test does contact the server, so it will fail if the
  ;; server is down. Then c3p0 will continue to acquire and test new connections, flooding the logs
  ;; and causing a stack overflow. Since the connection is an HTTP client, there's no server state
  ;; that can go stale on the connection so the test can be disabled (#85512).
  (merge
   ((get-method sql-jdbc.conn/data-warehouse-connection-pool-properties :sql-jdbc) driver database)
   {"testConnectionOnCheckout" false}))

(defmethod driver/database-supports? [:clickhouse :uploads] [_driver _feature db]
  (let [{:keys [cloud single-node]} (clickhouse-version/dbms-version db)]
    (boolean (or cloud single-node))))

(defmethod driver/can-connect? :clickhouse
  [driver details]
  ;; run the shared connection-property denylist before opening any connection, on both paths below
  (driver/validate-db-details! driver details)
  (if driver-api/is-test?
    (try
      ;; Default SELECT 1 is not enough for Metabase test suite,
      ;; as it works slightly differently than expected there
      (let [spec   (sql-jdbc.conn/connection-details->spec driver details)
            dbname (or (first-db-name (:dbname details))
                       (first-db-name (:db details))
                       "default")
            db     (ddl.i/format-name driver dbname)]
        (sql-jdbc.execute/do-with-connection-with-options
         driver spec nil
         (fn [^java.sql.Connection conn]
           (let [stmt (.prepareStatement conn "SELECT count(*) > 0 FROM system.databases WHERE name = ?")
                 _    (.setString stmt 1 db)
                 rset (.executeQuery stmt)]
             (when (.next rset)
               (.getBoolean rset 1))))))
      (catch Throwable e
        (log/errorf "An exception during ClickHouse connectivity check: %s" (ex-message e))
        false))
    ;; During normal usage, fall back to the default implementation
    (sql-jdbc.conn/can-connect? driver details)))

(defmethod driver/db-default-timezone :clickhouse
  [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver database nil
   (fn [^java.sql.Connection conn]
     (with-open [stmt (.createStatement conn)
                 rset (.executeQuery stmt "SELECT timezone() AS tz")]
       (when (.next rset)
         (.getString rset 1))))))

(defmethod driver/db-start-of-week :clickhouse [_] :monday)

(defmethod ddl.i/format-name :clickhouse
  [_ table-or-field-name]
  (when table-or-field-name
    (str/replace table-or-field-name #"-" "_")))

(defmethod driver/humanize-connection-error-message :clickhouse
  [_ messages]
  (condp re-matches (str/join " -> " messages)
    #".*AUTHENTICATION_FAILED.*"
    :username-or-password-incorrect

    (first messages)))

;;; ------------------------------------------ Connection Impersonation ------------------------------------------

(defmethod driver/upload-type->database-type :clickhouse
  [_driver upload-type]
  (case upload-type
    :metabase.upload/varchar-255              "Nullable(String)"
    :metabase.upload/text                     "Nullable(String)"
    :metabase.upload/int                      "Nullable(Int64)"
    :metabase.upload/float                    "Nullable(Float64)"
    :metabase.upload/boolean                  "Nullable(Boolean)"
    :metabase.upload/date                     "Nullable(Date32)"
    :metabase.upload/datetime                 "Nullable(DateTime64(3))"
    :metabase.upload/offset-datetime          nil))

;; ClickHouse changes a column's type with MODIFY COLUMN; the default ALTER COLUMN is a syntax error.
(defmethod sql-jdbc.sync/alter-table-columns-sql :clickhouse
  [driver table-name column-definitions & _opts]
  (with-quoting driver
    (first (sql/format {:alter-table   (dot-qualified table-name)
                        :modify-column (map (fn [[column-name type-and-constraints]]
                                              (into [(quote-identifier column-name)]
                                                    (if (string? type-and-constraints)
                                                      [[:raw type-and-constraints]]
                                                      type-and-constraints)))
                                            column-definitions)}
                       :quoted  true
                       :dialect (sql.qp/quote-style driver)))))

(defmulti ^:private type->database-type
  "Internal type->database-type multimethod for ClickHouse that dispatches on type."
  {:arglists '([type])}
  identity)

(defmethod type->database-type :type/Boolean [_] [[:raw "Nullable(Boolean)"]])
(defmethod type->database-type :type/Float [_] [[:raw "Nullable(Float64)"]])
(defmethod type->database-type :type/Integer [_] [[:raw "Nullable(Int32)"]])
(defmethod type->database-type :type/Number [_] [[:raw "Nullable(Int64)"]])
(defmethod type->database-type :type/BigInteger [_] [[:raw "Nullable(Int64)"]])
(defmethod type->database-type :type/Text [_] [[:raw "Nullable(String)"]])
(defmethod type->database-type :type/TextLike [_] [[:raw "Nullable(String)"]])
(defmethod type->database-type :type/Date [_] [[:raw "Nullable(Date32)"]])
(defmethod type->database-type :type/Time [_] [[:raw "Nullable(Time)"]])
(defmethod type->database-type :type/DateTime [_] [[:raw "Nullable(DateTime64(3))"]])
;; we're lossy here
(defmethod type->database-type :type/DateTimeWithTZ [_] [[:raw "Nullable(DateTime64(3, 'UTC'))"]])

(defmethod driver/type->database-type :clickhouse
  [_driver base-type]
  (type->database-type base-type))

(defmethod driver/table-name-length-limit :clickhouse
  [_driver]
  ;; ClickHouse stores table metadata as files, so the real limit is on the combined length of the database and table
  ;; names: on recent versions `max table name length = 213 - (length of the database name)`, so the old value of 206
  ;; only held for a 7-character database such as `default`. 128 leaves room for database names up to 85 characters.
  128)

(defn- escape-ident
  ;; Backslash-escape rather than double the backtick: ClickHouse identifiers follow string-literal escaping, where
  ;; a preceding backslash would defeat quote-doubling.
  [s]
  (-> s
      (str/replace "\\" "\\\\")
      (str/replace "`" "\\`")))

(defn- quote-name [s]
  (let [s (if (and (keyword? s) (namespace s)) (str (namespace s) "." (name s)) s)
        parts (filter identity (str/split (name s) #"\."))]
    (str/join "." (map #(str "`" (escape-ident %) "`") parts))))

(defn- unquote-name
  "Undo [[quote-name]] for one identifier: strip the wrapping backticks and the backslash escapes inside them, so a
  name read back from DDL matches what the managed side stores. Bare names and expressions are left as they are."
  [^String s]
  (if (and (> (count s) 1) (str/starts-with? s "`") (str/ends-with? s "`"))
    (str/replace (subs s 1 (dec (count s))) #"\\(.)" "$1")
    s))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Indexes (Index Manager)                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

;; ClickHouse exercises both index lifecycles. ORDER BY (the MergeTree sorting key) is inlined into the table at
;; creation, so it is rendered at both creation seams: the CTAS in `compile-transform` (SQL transforms) and the
;; CREATE TABLE in `create-table!` (Python transforms). A data-skipping index is applied afterwards as a separate
;; statement via `compile-create-index`.

(defmethod driver/supported-index-methods :clickhouse
  [_driver _database]
  {:order-by   {:lifecycle    :inline
                :display-name (deferred-tru "Sorting key")
                :fields       [driver.common/index-columns-field]}
   :skip-index {:lifecycle    :standalone
                :display-name (deferred-tru "Skip index")
                :fields       [driver.common/index-name-field
                               driver.common/index-columns-field
                               {:name         "type"
                                :display-name (deferred-tru "Type")
                                :type         :select
                                :required     true
                                ;; only arg-free types; set/ngrambf_v1/tokenbf_v1 need params the form can't supply yet
                                :options      [{:name (deferred-tru "Min/max")      :value "minmax"}
                                               {:name (deferred-tru "Bloom filter") :value "bloom_filter"}]}
                               driver.common/index-granularity-field]}})

(defn- order-by-columns
  "Columns for the MergeTree ORDER BY: the inline `:order-by` index's columns when present, else the primary key (the
  existing behavior). Returns a seq of column-name strings."
  [{:keys [primary-key indexes]}]
  (or (some->> indexes (filter (comp #{:order-by} :kind)) first :columns (map :name) seq)
      primary-key))

(defn- order-by-clause
  "Render `ORDER BY (...)` for the given table opts. MergeTree requires an ORDER BY; with no order-by index and no
  primary key it is the empty tuple `ORDER BY ()` (an unsorted table)."
  [opts]
  (format "ORDER BY (%s)" (str/join ", " (map quote-name (order-by-columns opts)))))

(defn- allow-nullable-key-setting
  "The `allow_nullable_key = 1` MergeTree setting, or nil when there's no sorting key. Transform target columns are
  nullable, and MergeTree rejects a nullable sorting key without this."
  [opts]
  (when (seq (order-by-columns opts))
    "allow_nullable_key = 1"))

(defn- skip-index-type-sql
  [type type-args]
  (if (seq type-args)
    (format "%s(%s)" (name type) (str/join ", " type-args))
    (name type)))

(defmethod driver/compile-create-index :clickhouse
  [_driver schema table {index-name :name, :keys [columns type type-args granularity if-not-exists]}]
  ;; A data-skipping index needs two statements: ADD INDEX registers it (metadata only, applies to new parts), then
  ;; MATERIALIZE INDEX backfills it over the existing parts.
  (let [target (quote-name (if (seq schema) (keyword schema table) (keyword table)))
        idx    (quote-name index-name)
        expr   (str/join ", " (map (comp quote-name :name) columns))]
    [[(format "ALTER TABLE %s ADD INDEX %s%s (%s) TYPE %s GRANULARITY %d"
              target (if if-not-exists "IF NOT EXISTS " "") idx expr
              (skip-index-type-sql type type-args) (or granularity 1))]
     [(format "ALTER TABLE %s MATERIALIZE INDEX %s" target idx)]]))

(defn- strip-wrapping-parens
  "Drop one `(...)` that wraps the whole expression (a skip-index `expr` has one, a sorting key doesn't)."
  [^String s]
  (cond-> s (and (str/starts-with? s "(") (str/ends-with? s ")")) (subs 1 (dec (count s)))))

(defn- expr->columns
  "Best-effort split of a ClickHouse key expression into its top-level columns/expressions. A quoted name like
  `weird,name` becomes a bare element; a real expression like `lower(email)` stays one element."
  [expr]
  (if-let [s (perf/not-empty expr)]
    (perf/mapv #(unquote-name (str/trim %))
               (driver.common/split-top-level-commas (strip-wrapping-parens s) \\))
    []))

(def ^:private skip-index-line-regex
  "One data-skipping `INDEX` line of a `SHOW CREATE TABLE` statement. The name is back-quoted only when it has to be,
  with backslash escapes inside (see [[quote-name]]). Column definitions are always back-quoted, so a line that
  starts with the bare `INDEX` keyword is never one."
  #"^\s*INDEX\s+(`(?:[^`\\]|\\.)*`|\S+)\s+(.+?)\s+TYPE\s+(\w+(?:\([^)]*\))?)\s+GRANULARITY\s+(\d+),?\s*$")

(def ^:private order-by-line-regex
  "The MergeTree sorting key line. `PRIMARY KEY`, `PARTITION BY` and `TTL` print as lines of their own."
  #"^ORDER BY (.+)$")

(defn- line->definition
  "A statement line as a standalone clause: indentation and the list separator dropped."
  [line]
  (str/replace line #"^\s+|,?\s*$" ""))

(def ^:private index-defaults
  "The `::driver/table-index` fields a MergeTree index never varies: not unique, not primary, no covering columns, no
  partial predicate."
  {:is-unique false :is-primary false :is-valid true :include-columns [] :partial-predicate nil})

(defn- skip-index-line->index
  "The `::driver/table-index` for a data-skipping `INDEX` line, else nil."
  [line]
  (when-let [[_ index-name expr index-type] (re-matches skip-index-line-regex line)]
    (assoc index-defaults
           :name          (unquote-name index-name)
           :kind          :skip-index
           :access-method (first (str/split index-type #"\(" 2))
           :key-columns   (expr->columns expr)
           :definition    (line->definition line))))

(defn- order-by-line->index
  "The `::driver/table-index` for the `ORDER BY` line, else nil. `tuple()` is an unsorted table, so it yields nil too."
  [line]
  (when-let [[_ expr] (re-matches order-by-line-regex line)]
    (when (not= "tuple()" (str/trim expr))
      (assoc index-defaults
             :name          nil
             :kind          :order-by
             :access-method nil
             :key-columns   (expr->columns expr)
             :definition    (line->definition line)))))

(defn- create-table-statement->indexes
  "Parse a `SHOW CREATE TABLE` statement into `::driver/table-index` maps: the data-skipping indexes, then the sorting
  key."
  [statement]
  (let [lines (str/split-lines (or statement ""))]
    (into (vec (keep skip-index-line->index lines)) (keep order-by-line->index lines))))

(defn- table-missing-exception?
  "[[sql-jdbc/impl-table-known-to-not-exist?]] plus `CANNOT_GET_CREATE_TABLE_QUERY` (390), which only
  `SHOW CREATE TABLE` raises."
  [^SQLException e]
  (or (sql-jdbc/impl-table-known-to-not-exist? :clickhouse e)
      (str/starts-with? (or (ex-message e) "") "Code: 390.")))

(defmethod driver/humanize-index-error-message :clickhouse
  [_driver message]
  ;; Cut at the first `(ACCESS_DENIED)`-style code, which drops the `(version ...) (queryId=...)` tail.
  (or (second (re-find #"^(.*?\([A-Z][A-Z0-9_]+\))" message)) message))

;; One `SHOW CREATE TABLE` read, parsed by [[create-table-statement->indexes]]. It needs only `SHOW COLUMNS`, where
;; `system.data_skipping_indices` needs a grant Cloud Storage's shared ClickHouse doesn't give tenants.
(defmethod driver/fetch-table-indexes :clickhouse
  [_driver database schema table]
  (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec database)
        target    (quote-name (if (seq schema) (keyword schema table) (keyword table)))]
    (try
      (-> (jdbc/query conn-spec [(str "SHOW CREATE TABLE " target)])
          first
          :statement
          create-table-statement->indexes)
      (catch SQLException e
        (if (table-missing-exception? e)
          []
          (throw e))))))

(defn- create-table!-sql
  "Creates a ClickHouse table with the given name and column definitions. It assumes the engine is MergeTree,
   so it only works with Clickhouse Cloud and single node on-premise deployments at the moment."
  [_driver table-name column-definitions & {:as opts}]
  (str/join "\n"
            [(#'sql-jdbc/create-table!-sql :sql-jdbc table-name column-definitions opts)
             "ENGINE = MergeTree"
             (order-by-clause opts)
             ;; disable insert idempotency to allow duplicate inserts; permit a nullable sorting key (see
             ;; `allow-nullable-key-setting`).
             (str "SETTINGS replicated_deduplication_window = 0"
                  (when-let [s (allow-nullable-key-setting opts)] (str ", " s)))]))

(defmethod driver/create-table! :clickhouse
  [driver db-id table-name column-definitions & {:as opts}]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   db-id
   {:write? true}
   (fn [^java.sql.Connection conn]
     (with-open [stmt (.createStatement conn)]
       (let [sql (create-table!-sql driver table-name column-definitions opts)]
         (.execute stmt sql))))))

;; rename-tables!* only supported by the atomic engine
;; https://clickhouse.com/docs/engines/database-engines/atomic#exchange-tables

(defmethod driver/rename-table! :clickhouse
  [_driver db-id old-table-name new-table-name]
  (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec (driver.u/lib-database db-id))]
    (with-open [stmt (.createStatement ^java.sql.Connection (:connection conn))]
      (let [sql (format "RENAME TABLE %s TO %s" (quote-name old-table-name) (quote-name new-table-name))]
        (.execute stmt sql)))))

(defmethod driver/insert-into! :clickhouse
  [driver db-id table-name column-names values]
  (when (seq values)
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     db-id
     {:write? true}
     (fn [^java.sql.Connection conn]
       (let [sql (format "INSERT INTO %s (%s) VALUES (%s)"
                         (quote-name table-name)
                         (str/join ", " (map quote-name column-names))
                         (str/join ", " (repeat (count column-names) "?")))]
         (with-open [ps (.prepareStatement conn sql)]
           (doseq [row values]
             (when (seq row)
               (doseq [[idx v] (map-indexed (fn [x y] [(inc x) y]) row)]
                 (condp isa? (type v)
                   nil                      (.setString ps idx nil)
                   java.lang.String         (.setString ps idx v)
                   java.lang.Boolean        (.setBoolean ps idx v)
                   java.lang.Long           (.setLong ps idx v)
                   java.lang.Double         (.setFloat ps idx v)
                   java.math.BigInteger     (.setObject ps idx v)
                   java.time.LocalDate      (.setObject ps idx v)
                   java.time.LocalDateTime  (.setObject ps idx v)
                   java.time.OffsetDateTime (.setObject ps idx v)
                   (.setString ps idx (str v))))
               (.addBatch ps)))
           (doall (.executeBatch ps))))))))

;;; ------------------------------------------ User Impersonation ------------------------------------------

(defmethod driver/database-supports? [:clickhouse :connection-impersonation]
  [_driver _feature db]
  (if db
    (clickhouse-version/is-at-least? 24 4 db)
    false))

(defmethod sql-jdbc/set-role-statement :clickhouse
  [_driver _conn role]
  ;; Since Clickhouse does not truly support prepared statements with protocol-level safety and has no
  ;; `quote_ident()` function or similar, escape/quote the identifier client-side. The whole value is quoted
  ;; as one identifier, so a role name containing a comma stays a single role. ClickHouse honors backslash
  ;; escapes inside a quoted identifier, so `:ansi+backslashes` is the style that applies -- a trailing `\`
  ;; must not be able to escape the closing quote. HoneySQL's ANSI quoting only doubles the quote character,
  ;; which is why this goes through [[sql.u/quote-identifier]] rather than [[sql.u/quote-name]].
  (let [default-role (driver.sql/default-database-role :clickhouse nil)
        ;; a value the caller already quoted is unwrapped first, so its contents are escaped like any other.
        ;; It takes two characters to be a wrapped value -- a lone `"` is a one-character role name.
        unwrapped    (if (and (>= (count role) 2)
                              (str/starts-with? role "\"")
                              (str/ends-with? role "\""))
                       (subs role 1 (dec (count role)))
                       role)]
    (format "SET ROLE %s" (if (= role default-role)
                            role
                            (sql.u/quote-identifier unwrapped :ansi+backslashes)))))

(defmethod driver/set-role! :clickhouse
  [driver ^Connection conn role]
  (let [sql (sql-jdbc/set-role-statement driver conn role)]
    ;; there seems to be something weird going on with ClickHouse when using `next.jdbc/execute!` in the default impl
    ;; to set the role (I'm guessing it's a `PreparedStatement` versus `Statement` issue? So just fall back to doing
    ;; it this way
    (when-not (string? sql)
      (throw (UnsupportedOperationException.
              "The Clickhouse implementation of metabase.driver/set-role! does not support parameterized statements")))
    (with-open [stmt (.createStatement ^Connection conn)]
      (.execute stmt ^String sql))))

(defmethod driver.sql/default-database-role :clickhouse
  [_ _]
  "NONE")

(defmethod sql-jdbc.execute/impl-error-in-query? :clickhouse
  [driver ^SQLException e]
  ;; ClickHouse also uses class 22 for operational failures such as memory and result limits.
  (and (not (str/starts-with? (str (.getSQLState e)) "22"))
       ((get-method sql-jdbc.execute/impl-error-in-query? :sql-jdbc) driver e)))

(defmethod sql-jdbc/impl-table-known-to-not-exist? :clickhouse
  [_ ^SQLException e]
  ;; the clickhouse driver doesn't set ErrorCode, we must parse it from the message
  (let [msg (.getMessage e)]
    (or (str/starts-with? msg "Code: 60")
        (str/starts-with? msg "Code: 81"))))

(defmethod driver/compile-transform :clickhouse
  [driver {:keys [query output-table indexes]}]
  (let [{sql-query :query sql-params :params} query
        ;; A sorting key needs `allow_nullable_key`; the SETTINGS clause has to go before `AS SELECT`.
        settings (when-let [s (allow-nullable-key-setting {:indexes indexes})]
                   (sql.qp/format-honeysql driver {:raw (str "SETTINGS " s)}))
        pieces (cond-> [(sql.qp/format-honeysql driver {:create-table output-table})
                        (sql.qp/format-honeysql driver {:raw (order-by-clause {:indexes indexes})})]
                 settings (conj settings)
                 :always  (conj ["AS"] [sql-query sql-params]))
        sql (str/join " " (map first pieces))]
    (into [sql] (mapcat rest) pieces)))

(defmethod driver/do-with-test-connection :clickhouse
  [driver database f]
  ((get-method driver/do-with-test-connection :sql-jdbc)
   driver
   database
   (fn [^java.sql.Connection conn]
     (let [^com.clickhouse.jdbc.ConnectionImpl clickhouse-conn (.unwrap conn com.clickhouse.jdbc.ConnectionImpl)
           ^QuerySettings query-settings                     (.getDefaultQuerySettings clickhouse-conn)]
       (.setDefaultQuerySettings clickhouse-conn (doto (QuerySettings. (.getAllSettings query-settings))
                                                   (.serverSetting "session_id" (str (random-uuid)))))
       (try
         (f conn)
         (finally
           (.setDefaultQuerySettings clickhouse-conn query-settings)))))))

(defmethod driver/compile-create-temp-table :clickhouse
  [driver {:keys [table query]}]
  (let [{sql-query :query sql-params :params} query]
    [(first (sql.qp/format-honeysql driver [:raw ["CREATE TEMPORARY TABLE " [:inline (keyword table)]
                                                  " ENGINE = Memory AS " sql-query]]))
     sql-params]))

(defmethod driver/compile-drop-temp-table :clickhouse
  [driver table]
  [(first (sql.qp/format-honeysql driver [:raw ["DROP TEMPORARY TABLE IF EXISTS " [:inline (keyword table)]]]))
   []])

(defmethod driver/compile-insert :clickhouse
  [driver {:keys [query output-table]}]
  (let [{sql-query :query sql-params :params} query]
    [(first (sql.qp/format-honeysql driver {:insert-into [output-table {:raw sql-query}]}))
     sql-params]))

(defmethod driver/create-schema-if-needed! :clickhouse
  [driver conn-spec schema]
  (let [sql [[(format "CREATE DATABASE IF NOT EXISTS %s;" (quote-schema schema))]]]
    (driver/execute-raw-queries! driver conn-spec sql)))

(defmethod driver/describe-fks :clickhouse
  [_driver _database & {:as _options}]
  (log/warn "Clickhouse does not support foreign keys. `describe-fks` should not have been called!")
  nil)

(defmethod driver/table-known-to-not-exist? :clickhouse
  [_driver e]
  (instance? SQLException e))

;; Override clickhouse to not pass in the Types/DATE parameter due to jdbc
;; driver issue: https://github.com/ClickHouse/clickhouse-java/issues/2701
(defmethod sql-jdbc.execute/set-parameter [:clickhouse LocalDate]
  [_ ^PreparedStatement prepared-statement i object]
  (.setObject prepared-statement i object))

;;; ------------------------------------------ Workspace Isolation ------------------------------------------

(defn- workspace-object-exists-exception
  "The 409 for a user or database that already has the workspace's name. It may belong to another workspace, so the
  caller must not tear it down: `:workspace/cleanup? false`."
  [kind object-name cause]
  (ex-info (format "The warehouse already has a %s named %s. It may belong to another workspace, so it was left unchanged."
                   (name kind) (quote-field object-name))
           {:status-code 409, :workspace/cleanup? false, kind object-name}
           cause))

(defn- check-workspace-names-free!
  "Throws a 409 when the warehouse already has a user or a database with the workspace's name. Either may belong to
  another workspace, so init leaves it as it is and the caller must not tear it down. Runs before any DDL, so when
  the check itself fails (the admin login may lack the grant to read `system.users`), its error also says
  `:workspace/cleanup? false`: init created nothing, and a teardown would drop a user of that name that may exist."
  [conn user db-name]
  (doseq [[table kind object-name] [["system.users" :user user]
                                    ["system.databases" :database db-name]]
          :when (seq (try
                       (jdbc/query {:connection conn}
                                   [(format "SELECT 1 FROM %s WHERE name = ?" table) object-name])
                       (catch SQLException e
                         (throw (ex-info (format "Could not check whether the warehouse already has a %s named %s, so init created nothing: %s"
                                                 (name kind) (quote-field object-name) (ex-message e))
                                         {:workspace/cleanup? false, kind object-name}
                                         e)))))]
    (throw (workspace-object-exists-exception kind object-name nil))))

(def ^:private already-exists-error-codes
  "ClickHouse error codes for a CREATE whose object exists: DATABASE_ALREADY_EXISTS and ACCESS_ENTITY_ALREADY_EXISTS."
  #{82 493})

(defn- create-workspace-object!
  "Runs the plain CREATE `sql`. The object can exist even after [[check-workspace-names-free!]]: another init created
  it in between, or the admin cannot see it in `system.users`/`system.databases`. Then this runs `undo-sqls` to drop
  what this init already created, and throws the same 409 as the check, so the caller does not tear down the object
  init refused to adopt."
  [^Statement stmt ^String sql kind object-name undo-sqls]
  (try
    (.execute stmt sql)
    (catch SQLException e
      (when-not (already-exists-error-codes (.getErrorCode e))
        (throw e))
      (let [refusal (workspace-object-exists-exception kind object-name e)]
        ;; a failed undo must still surface as the 409 (cleanup? false): otherwise the caller's
        ;; compensating destroy would drop the object init refused to adopt. The undo error is logged, not attached:
        ;; the caller rebuilds the 409 with `scrub-exceptions`, which drops suppressed exceptions.
        (doseq [^String undo undo-sqls]
          (try (.execute stmt undo)
               (catch Throwable undo-error
                 (log/warnf undo-error "Refused the existing %s %s and left it unchanged. Could not undo what this init created: run %s by hand."
                            (name kind) (quote-field object-name) undo))))
        (throw refusal)))))

(defn- init-workspace-sqls
  "The statements that create the workspace database and user, and grant the user what it needs. Plain CREATEs: a
  user or database that appears after [[check-workspace-names-free!]] makes init fail rather than adopt it."
  [db-name user escaped-password canonical-db]
  (let [quoted-db   (quote-schema db-name)
        quoted-user (quote-field user)]
    (cond-> [(format "CREATE DATABASE %s" quoted-db)
             (format "CREATE USER %s IDENTIFIED BY '%s'" quoted-user escaped-password)
             ;; Least-privilege grant on the workspace's own DB (ClickHouse has no
             ;; owner auto-privileges, so grant each verb explicitly):
             ;;   SELECT       - read its own tables
             ;;   INSERT       - CTAS populate + incremental insert
             ;;   CREATE TABLE - transform target
             ;;   DROP TABLE   - swap/cleanup
             ;; (these four also satisfy the atomic-swap RENAME TABLE.)
             (format "GRANT SELECT, INSERT, CREATE TABLE, DROP TABLE ON %s.* TO %s" quoted-db quoted-user)]
      (not (str/blank? canonical-db))
      (conj (format "GRANT SHOW DATABASES ON %s.* TO %s" (quote-schema canonical-db) quoted-user)))))

(defn- system-db-readable?
  "Whether the user of `details` can read the `system` database without a grant. The server setting
  `access_control_improvements.select_from_system_db_requires_grant` decides this; ClickHouse does not report it in
  `system.server_settings`, so this asks the server as that user."
  [driver details]
  (sql-jdbc.conn/with-connection-spec-for-testing-connection [spec [driver details]]
    (sql-jdbc.execute/do-with-connection-with-options
     driver spec nil
     (fn [^Connection conn]
       ;; any failure here is not about the system database, so it propagates
       (jdbc/query {:connection conn} ["SELECT 1"])
       (try
         (jdbc/query {:connection conn} ["SELECT 1 FROM system.processes LIMIT 0"])
         true
         (catch SQLException e
           ;; 497 is ACCESS_DENIED
           (if (= 497 (.getErrorCode e))
             false
             (throw e))))))))

(defn- check-admin-reads-system-processes!
  "Throws a 412 when the login of `conn` cannot read `system.processes`. Teardown's KILL QUERY reads that table, even
  when no query matches. When the server requires a grant to read the `system` database, a login without one fails
  every teardown. Init runs this check before any DDL, so every error the check throws says
  `:workspace/cleanup? false`: init created nothing, and a teardown would drop a user and a database with the
  workspace's names that may belong to another workspace."
  [^Connection conn]
  (try
    (jdbc/query {:connection conn} ["SELECT query_id, user, query FROM system.processes LIMIT 0"])
    (catch SQLException e
      ;; 497 is ACCESS_DENIED
      (when-not (= 497 (.getErrorCode e))
        (throw (ex-info (format "Could not check whether the admin connection's login can read system.processes, so init created nothing: %s"
                                (ex-message e))
                        {:workspace/cleanup? false}
                        e)))
      (let [login (try
                    (-> (jdbc/query {:connection conn} ["SELECT currentUser() AS login"]) first :login)
                    (catch SQLException login-error
                      (throw (ex-info (format "Could not read the admin connection's login, so init created nothing: %s"
                                              (ex-message login-error))
                                      {:workspace/cleanup? false}
                                      login-error))))]
        (throw (ex-info (format (str "The admin connection's login cannot read system.processes. Workspace teardown "
                                     "reads it to end the workspace user's queries. Run GRANT SELECT ON "
                                     "system.processes TO %s and retry.")
                                (quote-field login))
                        {:status-code 412, :workspace/cleanup? false}
                        e))))))

(defn- check-system-db-requires-grant!
  "Throws a 412 when the workspace user can read the `system` database without a grant: see [[system-db-readable?]].
  Then it could read `system.query_log` and `system.processes`, which hold the queries of every user."
  [driver details]
  (let [readable? (system-db-readable? driver details)]
    (when readable?
      (throw (ex-info (str "This ClickHouse server lets every user read the system database, which holds the queries "
                           "of all users. A ClickHouse server administrator must set "
                           "access_control_improvements.select_from_system_db_requires_grant to true in the server "
                           "configuration (config.xml), restart the server, and retry. It is off by default on "
                           "ClickHouse 23.3 to 24.3. The setting persists in the configuration, so this is a one-time "
                           "setup step.")
                      {:status-code 412})))))

(defmethod driver/init-workspace-isolation! :clickhouse
  [driver database workspace]
  (let [lib-db           (driver.u/ensure-lib-database database)
        db-name          (:schema workspace)
        canonical-db     (:db (driver.conn/effective-details lib-db))
        {:keys [user password] :as read-user} (:database_details workspace)
        escaped-password (sql.u/escape-sql password :ansi+backslashes)
        ddl-started?     (volatile! false)]
    ;; No transaction: ClickHouse has no transactional DDL — CREATE/GRANT apply
    ;; immediately. Failure recovery is compensation via the idempotent destroy.
    (try
      (sql-jdbc.execute/do-with-connection-with-options
       driver lib-db {:write? true}
       (fn [^Connection conn]
         (check-admin-reads-system-processes! conn)
         (check-workspace-names-free! conn user db-name)
         (with-open [stmt (.createStatement conn)]
           (let [[create-db create-user & grants] (init-workspace-sqls db-name user escaped-password canonical-db)]
             (vreset! ddl-started? true)
             (try
               (create-workspace-object! stmt create-db :database db-name [])
               (create-workspace-object! stmt create-user :user user
                                         [(format "DROP DATABASE IF EXISTS %s" (quote-schema db-name))])
               (doseq [^String grant grants]
                 (.execute stmt grant))
               (catch Throwable t
                 (throw (driver.u/scrub-exceptions t [password escaped-password]))))))))
      (catch Throwable t
        ;; an error before the first CREATE, such as a failed connection, leaves nothing to tear down: it says
        ;; `:workspace/cleanup? false`. After the first CREATE, something may exist, so the error goes to the caller as
        ;; it is, and the caller tears down
        (throw (if (or @ddl-started? (contains? (ex-data t) :workspace/cleanup?))
                 t
                 (ex-info (str "Init failed before it created anything: " (ex-message t))
                          (assoc (ex-data t) :workspace/cleanup? false)
                          t)))))
    ;; the workspace user connects with the database's own details, as workspace queries do
    (try
      (check-system-db-requires-grant! driver (merge (:details lib-db) (perf/select-keys read-user [:user :password])))
      (catch Throwable t
        (throw (driver.u/scrub-exceptions t [password escaped-password]))))
    nil))

(defmethod driver/grant-workspace-read-access! :clickhouse
  [driver database workspace schemas]
  (let [read-user-name (-> workspace :database_details :user)
        quoted-user    (quote-field read-user-name)]
    (when-not read-user-name
      (throw (ex-info (tru "Cannot grant workspace read access. Workspace details have no read user — initialization may have failed. Re-run workspace initialization and retry.")
                      {:workspace-id (:id workspace) :step :grant})))
    ;; ClickHouse `qualified-name-components` is `[:schema]` — each entry in
    ;; `schemas` is a database-as-schema. Grant `*` covers all tables in the
    ;; database; ClickHouse re-resolves `*` so future tables get coverage too.
    (let [sqls (for [schema schemas
                     :let [_ (when (str/blank? schema)
                               (throw (ex-info (tru "Cannot grant workspace read access. Input schema name is blank. Remove the blank entry from the workspace input schemas and retry.")
                                               {:database-id (:id database) :step :grant})))]]
                 (format "GRANT SELECT ON %s.* TO %s"
                         (quote-schema schema)
                         quoted-user))]
      (sql-jdbc.execute/do-with-connection-with-options
       driver (driver.u/ensure-lib-database database) {:write? true}
       (fn [^Connection conn]
         (with-open [stmt (.createStatement conn)]
           (doseq [sql sqls]
             (.addBatch ^Statement stmt ^String sql))
           (try
             (.executeBatch ^Statement stmt)
             (catch Throwable t
               (throw (driver.u/batch-exception t))))))))))

(defn- destroy-workspace-sqls
  "The teardown statements, in order. `HOST NONE` refuses every new login of the user, and every HTTP request, which
  logs in each time. A native-protocol session that is already open can still start queries until DROP USER. A query
  already running survives HOST NONE, so KILL QUERY ... SYNC ends those queries and waits for them. HOST NONE needs the
  ALTER USER grant. Without it, the user is not locked out, and new logins work until DROP USER.
  DROP DATABASE then removes the user's tables and views, including a materialized view that ClickHouse runs inside
  every INSERT into an input table. The user goes next: on 26.10 a view whose definer is the user makes DROP USER fail,
  and on 24.3 dropping that definer makes every INSERT into the view's source table fail. A query that started after the
  first KILL QUERY survives DROP USER, so a second KILL QUERY ... SYNC runs last and ends it."
  [db-name user]
  (let [kill (format "KILL QUERY WHERE user = '%s' SYNC" (sql.u/escape-sql user :ansi+backslashes))]
    [(format "ALTER USER IF EXISTS %s HOST NONE" (quote-field user))
     kill
     ;; DROP DATABASE cascades to all tables within it
     (format "DROP DATABASE IF EXISTS %s SYNC" (quote-schema db-name))
     (format "DROP USER IF EXISTS %s" (quote-field user))
     kill]))

(defn- execute-for-error
  "Executes `sql` on `stmt`. Returns the SQLException it throws, or nil."
  [^Statement stmt ^String sql]
  (try
    (.execute stmt sql)
    nil
    (catch SQLException e
      e)))

(defn- destroy-workspace!
  "Runs [[destroy-workspace-sqls]] one at a time. A failed ALTER USER or KILL QUERY does not stop the statements after
  it. A failed DROP DATABASE stops DROP USER: a view in the database may have the user as its definer. The second
  KILL QUERY runs in every case.

  When DROP DATABASE or DROP USER fails, a workspace object remains. Then its error is thrown, and the ALTER USER and
  KILL QUERY errors are attached to it as suppressed.

  When both drops succeed, an ALTER USER error is logged, not thrown: a dropped user cannot log in. So the admin
  connection's login does not need the ALTER USER grant. Without it, the lock-out step is skipped. The login needs
  KILL QUERY, SELECT ON system.processes, DROP DATABASE and DROP USER.

  A KILL QUERY error is thrown, with the other KILL QUERY's error attached as suppressed. When it is access denied, the
  thrown error names both grants the login may lack: ClickHouse checks KILL QUERY only when another user's query
  matches, and checks SELECT ON system.processes every time when the server requires a grant to read the `system`
  database. When both KILL QUERYs are denied, only the first error is kept."
  [^Statement stmt db-name user]
  (let [[lock kill drop-db drop-user kill-again] (destroy-workspace-sqls db-name user)
        lock-error                     (execute-for-error stmt lock)
        kill-error                     (execute-for-error stmt kill)
        drop-db-error                  (execute-for-error stmt drop-db)
        drop-user-error                (when-not drop-db-error
                                         (execute-for-error stmt drop-user))
        kill-again-error               (execute-for-error stmt kill-again)
        drop-error                     (or drop-db-error drop-user-error)
        ;; 497 is ACCESS_DENIED: ClickHouse's own message for it can be unreadable
        denied?                        #(= 497 (some-> ^SQLException % .getErrorCode))
        kill-errors                    (remove nil? (if (and (denied? kill-error) (denied? kill-again-error))
                                                      [kill-error]
                                                      [kill-error kill-again-error]))
        ;; a dropped user cannot log in, so the lock-out error matters only when a drop failed
        [^SQLException error & others] (remove nil? (if drop-error
                                                      (into [drop-error lock-error] kill-errors)
                                                      kill-errors))]
    (when (and lock-error (not drop-error))
      (log/warnf lock-error "Could not lock out the workspace user %s before dropping it. Dropped the user and its database %s."
                 (quote-field user) (quote-schema db-name)))
    (when error
      (doseq [^Throwable other others]
        (.addSuppressed error other))
      (throw (if (and (not drop-error) (denied? error))
               (ex-info (format (str "Dropped the workspace user %s and its database %s, but could not check for "
                                     "and end the user's running queries: the admin connection's login lacks the "
                                     "KILL QUERY grant or SELECT on system.processes. Without SELECT on "
                                     "system.processes, teardown fails on every retry. Without KILL QUERY, the "
                                     "queries run until they finish, and teardown fails until then. Grant both to "
                                     "the login and retry.")
                                (quote-field user) (quote-schema db-name))
                        {:user user, :database db-name}
                        error)
               error)))))

(defmethod driver/destroy-workspace-isolation! :clickhouse
  [driver database workspace]
  (sql-jdbc.execute/do-with-connection-with-options
   driver (driver.u/ensure-lib-database database) {:write? true}
   (fn [^Connection conn]
     (with-open [stmt (.createStatement conn)]
       (destroy-workspace! stmt (:schema workspace) (-> workspace :database_details :user))))))

(defmethod driver/llm-sql-dialect-resource :clickhouse [_]
  "metabot/prompts/dialects/clickhouse.md")

;;; ------------------------------------------------ Table samples -------------------------------------------------

(defn- sample-fraction
  "`percent` as the plain decimal fraction that `SAMPLE` takes, since Java prints a double below 0.001 as 1.0E-4."
  [percent]
  (.toPlainString (.stripTrailingZeros ^BigDecimal (/ (bigdec percent) 100M))))

(defn- positions-prewhere
  "The `PREWHERE` condition of a sample of `positions` on the virtual column `_part_offset`, which ClickHouse uses to
  read only the granules of the ranges in each part. The numbers are integers, written in the SQL."
  [{:keys [ranges every remainder]}]
  (str "("
       (str/join " OR " (map (fn [[from to]] (str "(_part_offset >= " (long from) " AND _part_offset < " (long to) ")"))
                             ranges))
       ") AND _part_offset % " (long every) " = " (long remainder)))

;; `SAMPLE k` reads the rows whose sampling key falls in a fraction `k` of its range. A table can be sampled only when
;; it declares a sampling key (`SAMPLE BY`). A sample of positions reads the same ranges of rows of each part with a
;; `PREWHERE`, which comes right after the table.
(defmethod sql.qp/table-sample->honeysql :clickhouse
  [driver table-expr {:keys [percent positions] :as table-sample}]
  (cond
    percent   [:raw [table-expr " SAMPLE " (sample-fraction percent)]]
    positions [:raw [table-expr " PREWHERE " (positions-prewhere positions)]]
    :else     ((get-method sql.qp/table-sample->honeysql :sql) driver table-expr table-sample)))

;; Only for `:clickhouse` itself, so that a child driver keeps its own `table-rows-sample`.
(defmethod driver/database-supports? [:clickhouse :table-random-sample]
  [driver _feature _db]
  (= driver :clickhouse))

(def ^:private max-sample-read-factor
  "How many times the sample size `SAMPLE` may read, by the estimate of the index analysis. `SAMPLE` reads at least a
  granule of each part for each value of the columns of the sorting key before the sampling key, so it reads few rows
  only when those columns have few values; otherwise it can read the whole table, and it also does for a sampling key
  whose values fill a small part of its type's range."
  100)

(def ^:private target-granules
  "About how many granules a sample of positions reads, over all parts."
  50)

(def ^:private max-positions-read-factor
  "How many times the sample size a sample of positions may read. A range of positions reads a granule of every part
  long enough, so a table of very many parts would read much more than [[target-granules]] granules."
  100)

(def ^:private max-positions-read-bytes
  "The most uncompressed bytes a sample of positions may read, for tables of very wide rows."
  (* 500 1024 1024))

(defn- part-granule-rows
  "About how many rows a granule of `part` holds: its rows over its marks, of which the last one marks the end."
  [{:keys [rows marks]}]
  (max 1 (quot rows (max 1 (dec marks)))))

(defn- part-positions
  "The ranges of a sample of positions of a table whose active `parts` have `:rows`, `:marks` and `:bytes`, for about
  `rows` rows, or nil when the sample would read more than [[max-positions-read-factor]] times `rows` or more than
  [[max-positions-read-bytes]].

  A range applies to every part, so the ranges are spread over the positions of the largest part, one at a random
  granule of each of equal strata: a part gets ranges in proportion to its rows. There are about [[target-granules]]
  times the rows of the largest part over all rows of ranges, at least one, each one granule long (the largest of the
  parts' granules) and starting at a multiple of it. The stride keeps about `rows` of the rows in the ranges of all
  parts. Returns the `:ranges`, `:every` and `:remainder` of the sample, and the `:expected` rows."
  [parts rows ^Random random]
  (let [largest (reduce max 0 (map :rows parts))
        total   (reduce + (map :rows parts))
        granule (reduce max 1 (map part-granule-rows parts))
        n       (max 1 (Math/round (double (/ (* target-granules largest) total))))
        width   (/ largest (double n))
        ranges  (into []
                      (comp (map (fn [i]
                                   (let [start (* granule (long (Math/floor (/ (* width (+ i (.nextDouble random)))
                                                                               granule))))]
                                     [start (+ start granule)])))
                            (distinct))
                      (range n))
        reads   (for [{part-rows :rows :keys [bytes]} parts
                      [from to] ranges
                      :let  [n-rows (max 0 (- (min to part-rows) from))]
                      :when (pos? n-rows)]
                  {:rows n-rows :bytes (* n-rows (/ bytes (double part-rows)))})
        in-runs (reduce + (map :rows reads))
        every   (max 1 (long (quot in-runs rows)))]
    (when (and (pos? in-runs)
               (<= in-runs (* max-positions-read-factor rows))
               (<= (reduce + (map :bytes reads)) max-positions-read-bytes))
      {:ranges    ranges
       :every     every
       :remainder (.nextInt random every)
       :expected  (quot in-runs every)})))

(defn- merge-tree-engine?
  "Whether the ClickHouse table engine `engine` stores parts with `_part_offset`: the MergeTree family."
  [engine]
  (boolean (some->> engine (re-find #"MergeTree$"))))

;; The catalog queries send no JDBC time limit: the driver sends it as `max_execution_time`, which a read-only user
;; cannot set. They read metadata only.

(defn- table-facts
  "The sampling key and the engine of `table`, from `system.tables`."
  [spec table]
  (first (jdbc/query spec ["SELECT sampling_key, engine FROM system.tables WHERE database = ? AND name = ?"
                           (:schema table) (:name table)])))

(defn- sample-read-rows
  "The rows that `SAMPLE` of `percent` percent of `table` reads, by `EXPLAIN ESTIMATE`, which analyzes the index and
  reads no data."
  [spec table percent]
  (transduce (map (comp long :rows)) + 0
             (jdbc/query spec [(str "EXPLAIN ESTIMATE SELECT 1 FROM "
                                    (sql.u/quote-name :clickhouse :table (:schema table) (:name table))
                                    " SAMPLE " (sample-fraction percent))])))

(defn- cheap-sample?
  "Whether `table`, with the facts `facts`, has a sampling key and `SAMPLE` for a sample of `opts` reads at most
  [[max-sample-read-factor]] times its rows."
  [spec table {:keys [sampling_key]} {:keys [rows] :as opts}]
  (boolean (when-let [percent (and (perf/not-empty sampling_key) (table-rows-sample/block-sample-percent opts))]
             (<= (sample-read-rows spec table percent) (* max-sample-read-factor rows)))))

(def ^:private min-positions-version
  "The first ClickHouse version that accepts `_part_offset` in `PREWHERE` and prunes granules by it: 24.3."
  [24 3])

(defn- parts
  "The `:rows`, `:marks` and `:bytes` (uncompressed) of the active parts of `table`, with the facts `facts`, when it is
  of the MergeTree family on a ClickHouse version that can read a sample of positions, or nil when they cannot be read,
  for example with no right to read `system.parts`. Patch parts of lightweight updates are not parts of rows."
  [spec table {:keys [engine]}]
  (when (and (merge-tree-engine? engine)
             (let [[major minor] min-positions-version]
               (clickhouse-version/is-at-least? major minor (driver.u/lib-database (:db_id table)))))
    (try
      (perf/not-empty
       (perf/mapv (fn [{:keys [rows marks bytes]}] {:rows (long rows) :marks (long marks) :bytes (long bytes)})
                  (jdbc/query spec [(str "SELECT rows, marks, data_uncompressed_bytes AS bytes FROM system.parts"
                                         " WHERE database = ? AND table = ? AND active AND rows > 0"
                                         " AND NOT startsWith(name, 'patch-')")
                                    (:schema table) (:name table)])))
      (catch Exception e
        (log/debugf e "Could not read the parts of %s" (:name table))
        nil))))

(defn- positions-sample
  "The [[driver/table-random-sample]] of `table` at `positions` inside its parts."
  [table fields rff {:keys [rows row-count] :as opts} {:keys [ranges every remainder expected]}]
  {:method   :block
   :runs     (count ranges)
   :fraction (/ expected (double row-count))
   :result   (table-rows-sample/table-rows-sample
              table fields rff
              (-> (perf/select-keys opts [:truncation-size])
                  (assoc :table-sample {:positions {:ranges ranges :every every :remainder remainder}}
                         :limit        (* 2 rows))))})

;; The native SAMPLE for a table with a sampling key, when the index analysis says it reads few rows; otherwise rows at
;; positions inside the parts of a table of the MergeTree family, when that reads a bounded amount. Other tables keep
;; the first rows.
(defmethod driver/table-random-sample :clickhouse
  [_driver table fields rff opts]
  (let [spec  (when (:row-count opts)
                (sql-jdbc.conn/db->pooled-connection-spec (driver.u/lib-database (:db_id table))))
        facts (when spec (table-facts spec table))]
    (cond
      (nil? facts)                          {:method :first-rows}
      (cheap-sample? spec table facts opts) (table-rows-sample/block-sample table fields rff opts)
      :else                                 (if-let [positions (some-> (parts spec table facts)
                                                                       (part-positions (:rows opts) (Random.)))]
                                              (positions-sample table fields rff opts positions)
                                              {:method :first-rows}))))
