(ns metabase.driver.redshift
  "Amazon Redshift Driver."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.postgres :as driver.postgres]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.match :as match]
   [metabase.util.performance :as perf])
  (:import
   (com.amazon.redshift.util RedshiftInterval)
   (java.sql
    Connection
    PreparedStatement
    ResultSet
    ResultSetMetaData
    Statement
    Types)))

(set! *warn-on-reflection* true)

;; `::like-escape-char-built-in/like-escape-char-built-in` is inherited transitively via
;; `:postgres` (see `metabase.driver.postgres`).
(driver/register! :redshift, :parent :postgres)

(doseq [[feature supported?] {:atomic-renames                   true
                              :connection-impersonation         true
                              :database-routing                 true
                              :describe-default-expr            false
                              :describe-fields                  true
                              :describe-is-generated            false
                              :describe-is-nullable             false
                              :expression-literals              true
                              :identifiers-with-spaces          false
                              :metadata/table-existence-check   true
                              :nested-field-columns             false
                              :regex/lookaheads-and-lookbehinds false
                              :rename                           true
                              :test/jvm-timezone-setting        false
                              ;; This driver reports inaccurate `:rows-affected` counts; the transforms layer
                              ;; falls back to a native `COUNT(*)` on the CTAS path.
                              ;; TODO: fix `execute-raw-queries!` to return accurate row counts for DDL
                              ;; statements by using a different driver-native API for affected-row counts.
                              :transforms/accurate-rows-affected false
                              :transforms/python                true
                              :transforms/table                 true
                              :transforms/index-ddl             false
                              :uuid-type                        false
                              :workspace                        true}]
  (defmethod driver/database-supports? [:redshift feature] [_driver _feat _db] supported?))

(defmethod driver/qualified-name-components :redshift
  [_driver]
  ;; Redshift emits `schema.table` (Postgres-style 2-part) in compiled SQL.
  ;; Cross-database queries use external schemas, not `db.schema.table`.
  [:schema])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- remove-duplicate-fields
  "Redshift views can have duplicate column names, but when these columns appear in a query
   they produce an ambiguous column error. To avoid this remove all duplicate columns"
  [fields]
  (let [field-key      (fn [f] (perf/select-keys f [:table-schema :table-name :name]))
        key-counts     (frequencies (map field-key fields))
        duplicate-keys (into #{} (keep (fn [[k cnt]] (when (> cnt 1) k)) key-counts))]
    (doseq [{:keys [table-schema table-name name]} duplicate-keys]
      (log/warnf "Duplicate column '%s' in %s.%s - skipping all occurrences"
                 name table-schema table-name))
    (remove #(contains? duplicate-keys (field-key %)) fields)))

(defmethod sql-jdbc.sync/describe-fields-pre-process-xf :redshift
  [_driver _db & _args]
  ;; `describe-fields-sql` orders by [table-schema table-name database-position], so each table's columns arrive
  ;; contiguously. A duplicate-column key is (table-schema, table-name, name) -- by definition all its occurrences are
  ;; within a single table -- so we can dedup per table with `partition-by` rather than buffering the entire result
  ;; set. This bounds memory to one table's columns (the per-table streaming contract) and is otherwise identical to a
  ;; global dedup.
  (comp (partition-by (juxt :table-schema :table-name))
        (mapcat remove-duplicate-fields)))

;; Skip the postgres implementation  as it has to handle custom enums which redshift doesn't support.
(defmethod driver/dynamic-database-types-lookup :redshift
  [driver database database-types]
  ((get-method driver/dynamic-database-types-lookup :sql-jdbc) driver database database-types))

(def ^:private get-tables-sql
  ;; Cal 2024-04-09 This query uses tables that the JDBC redshift driver currently uses.
  ;; It does not return tables from datashares, which is a relatively new feature of redshift.
  ;; See https://github.com/dbt-labs/dbt-redshift/issues/742 for an implementation for DBT's integration with redshift
  ;; for inspiration, and the JDBC driver itself:
  ;; https://github.com/aws/amazon-redshift-jdbc-driver/blob/master/src/main/java/com/amazon/redshift/jdbc/RedshiftDatabaseMetaData.java#L1794
  ;; This is a vector so adding parameters doesn't require a change to describe-database-tables in the future.
  [(str/join
    "\n"
    ["select"
     "  c.relname as name,"
     "  n.nspname as schema,"
     "  case c.relkind"
     "    when 'r' then 'table'"
     "    when 'p' then 'partitioned table'"
     "    when 'v' then 'view'"
     "    when 'f' then 'foreign table'"
     "    when 'm' then 'materialized view'"
     "    end as type,"
     "  d.description"
     "  from pg_catalog.pg_namespace n, pg_catalog.pg_class c"
     "  left join pg_catalog.pg_description d on c.oid = d.objoid and d.objsubid = 0"
     "  left join pg_catalog.pg_class dc on d.classoid=dc.oid and dc.relname='pg_class'"
     "  left join pg_catalog.pg_namespace dn on dn.oid=dc.relnamespace and dn.nspname='pg_catalog'"
     "  where c.relnamespace = n.oid"
     "    and n.nspname !~ '^information_schema|catalog_history|pg_|metabase_cache_'"
     "    and c.relkind in ('r', 'p', 'v', 'f', 'm')"
     "    and pg_catalog.has_schema_privilege(n.oid, 'USAGE')"
     "    and (pg_catalog.has_table_privilege(c.oid,'SELECT')"
     "         or pg_catalog.has_any_column_privilege(c.oid,'SELECT'))"
     "union all"
     "select"
     "  tablename as name,"
     "  schemaname as schema,"
     "  'EXTERNAL TABLE' as type,"
     ;; external tables don't have descriptions
     "  null as description"
     "from svv_external_tables t"
     "where schemaname !~ '^information_schema|catalog_history|pg_|metabase_cache_'"
     ;; for external tables, USAGE privileges on a schema is sufficient to select
     "  and pg_catalog.has_schema_privilege(t.schemaname, 'USAGE')"])])

(defn- describe-database-tables
  [database]
  (let [[inclusion-patterns
         exclusion-patterns] (driver.s/db-details->schema-filter-patterns database)
        syncable? (fn [schema]
                    (sql-jdbc.describe-database/include-schema-logging-exclusion inclusion-patterns exclusion-patterns schema))]
    (eduction
     (comp (filter (comp syncable? :schema))
           (map #(dissoc % :type)))
     (sql-jdbc.execute/reducible-query database get-tables-sql))))

(defmethod driver/describe-database* :redshift
  [driver database]
  ;; TODO: change this to return a reducible so we don't have to hold 100k tables in memory in a set like this
  ;;
  ;; Redshift sync is super duper flaky and un-robust! This auto-retry is a temporary workaround until we can actually
  ;; fix #45874
  (try
    (u/auto-retry (if driver-api/is-prod? 2 5)
      (try
        {:tables (into #{} (describe-database-tables database))}
        (catch Throwable e
          ;; during test/REPL runs, wait a second before throwing the exception, that way when we do our retry there is
          ;; a better chance of it succeeding.
          (when-not driver-api/is-prod?
            (Thread/sleep 1000))
          (throw e))))
    (catch Throwable e
      (throw (ex-info (format "Error in %s describe-database: %s" driver (ex-message e))
                      {}
                      e)))))

(defmethod sql-jdbc.sync/describe-fields-sql :redshift
  ;; The implementation is based on `getColumns` in https://github.com/aws/amazon-redshift-jdbc-driver/blob/master/src/main/java/com/amazon/redshift/jdbc/RedshiftDatabaseMetaData.java
  ;; The `database-is-auto-increment` and `database-required` columns are currently missing because they are only
  ;; needed for actions, which redshift doesn't support yet.
  [driver & {:keys [schema-names table-names]}]
  (sql/format {:select [[:c.column_name :name]
                        [:c.data_type :database-type]
                        [[:- :c.ordinal_position [:inline 1]] :database-position]
                        [:c.table_schema :table-schema]
                        [:c.table_name :table-name]
                        [[:not= :pk.column_name nil] :pk?]
                        [[:case [:not= :c.remarks [:inline ""]] :c.remarks :else nil] :field-comment]]
               ;; svv_columns excludes columns from datashares, unlike svv_all_columns with includes them
               :from [[:svv_columns :c]]
               :left-join [[{:select [:tc.table_schema
                                      :tc.table_name
                                      :kc.column_name]
                             :from [[:information_schema.table_constraints :tc]]
                             :join [[:information_schema.key_column_usage :kc]
                                    [:and
                                     [:= :tc.constraint_name :kc.constraint_name]
                                     [:= :tc.table_schema :kc.table_schema]
                                     [:= :tc.table_name :kc.table_name]]]
                             :where [:= :tc.constraint_type [:inline "PRIMARY KEY"]]}
                            :pk]
                           [:and
                            [:= :c.table_schema :pk.table_schema]
                            [:= :c.table_name :pk.table_name]
                            [:= :c.column_name :pk.column_name]]]
               :where [:and
                       [:raw "c.table_schema !~ '^information_schema|catalog_history|pg_'"]
                       (when schema-names [:in :c.table_schema (map u/lower-case-en schema-names)])
                       (when table-names [:in :c.table_name (map u/lower-case-en table-names)])]
               :order-by [:table-schema :table-name :database-position]}
              :dialect (sql.qp/quote-style driver)))

(defmethod driver/db-start-of-week :redshift
  [_]
  :sunday)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; custom Redshift type handling

(defn- external-database-type->base-type
  "Additional type mappings of external columns. Return nil when no matching type is found."
  [database-type]
  (when (or (string? database-type)
            (instance? clojure.lang.Named database-type))
    (let [stn  (-> (name database-type) ; sanitized-type-name
                   (u/lower-case-en))]
      ;; Following is inspired by mysql docs and redshift jdbc driver code: https://github.com/aws/amazon-redshift-jdbc-driver/blob/master/src/main/java/com/amazon/redshift/jdbc/RedshiftDatabaseMetaData.java#L3414-L3448
      (cond
        (str/starts-with? stn "tinyint")   :type/Integer
        (str/starts-with? stn "smallint")  :type/Integer
        (str/starts-with? stn "mediumint") :type/Integer
        (str/starts-with? stn "int")       :type/Integer
        (str/starts-with? stn "bigint")    :type/BigInteger

        (str/starts-with? stn "float")     :type/Float
        (str/starts-with? stn "double")    :type/Float

        (and (or (str/starts-with? stn "char")
                 (str/starts-with? stn "varchar")
                 (str/starts-with? stn "text"))
             (re-find #"character set binary" stn))         :type/*

        (str/starts-with? stn "char")                       :type/Text
        (str/starts-with? stn "varchar")                    :type/Text
        (str/starts-with? stn "text")                       :type/Text
        ;; https://dev.mysql.com/doc/refman/8.4/en/charset-national.html
        (str/starts-with? stn "national varchar")           :type/Text
        (str/starts-with? stn "nvarchar")                   :type/Text
        (str/starts-with? stn "nchar varchar")              :type/Text
        (str/starts-with? stn "national character varying") :type/Text
        (str/starts-with? stn "national char varying")      :type/Text

        (str/starts-with? stn "tinytext")   :type/Text
        (str/starts-with? stn "mediumtext") :type/Text
        (str/starts-with? stn "longtext")   :type/Text

        ;; Iceberg table types - https://docs.aws.amazon.com/redshift/latest/dg/querying-iceberg-supported-data-types.html
        (= stn "string")                    :type/Text
        (= stn "boolean")                   :type/Boolean
        (= stn "long")                      :type/BigInteger
        (str/starts-with? stn "decimal(")   :type/Decimal
        (= stn "binary")                    :type/*
        (= stn "date")                      :type/Date
        (= stn "timestamp")                 :type/DateTime
        (= stn "timestamptz")               :type/DateTimeWithTZ

        ;; MySQL federated table enum types
        (str/starts-with? stn "enum(")      :type/Text

        (= stn "datetime")                  :type/DateTime
        (= stn "year")                      :type/Integer))))

(def ^:private database-type->base-type
  (some-fn (sql-jdbc.sync/pattern-based-database-type->base-type
            [[#"(?i)CHARACTER VARYING" :type/Text]       ; Redshift uses CHARACTER VARYING (N) as a synonym for VARCHAR(N)
             [#"(?i)NUMERIC"           :type/Decimal]])  ; and also has a NUMERIC(P,S) type, which is the same as DECIMAL(P,S)
           {:super       :type/*    ; (requested support in metabase#36642)
            :varbyte     :type/*    ; represents variable-length binary strings
            :geometry    :type/*    ; spatial data
            :geography   :type/*    ; spatial data
            :intervaly2m :type/*    ; interval literal
            :intervald2s :type/*}))   ; interval literal

(defmethod sql-jdbc.sync/database-type->base-type :redshift
  [driver column-type]
  (or (database-type->base-type column-type)
      (let [assumed-type ((get-method sql-jdbc.sync/database-type->base-type :postgres) driver column-type)]
        (if-not (contains? #{nil :type/*} assumed-type)
          assumed-type
          (if-some [external-assumed-type (external-database-type->base-type column-type)]
            external-assumed-type
            assumed-type)))))

(defmethod sql.qp/add-interval-honeysql-form :redshift
  [_ hsql-form amount unit]
  (let [hsql-form (h2x/->timestamp hsql-form)]
    (-> [:dateadd (h2x/literal unit) amount hsql-form]
        (h2x/with-type-info (h2x/type-info hsql-form)))))

(defmethod sql.qp/unix-timestamp->honeysql [:redshift :seconds]
  [_ _ expr]
  (h2x/with-database-type-info
   (h2x/+ [:raw "TIMESTAMP '1970-01-01T00:00:00Z'"]
          (h2x/* expr
                 [:raw "INTERVAL '1 second'"]))
   :timestamp))

(defmethod sql.qp/current-datetime-honeysql-form :redshift
  [_driver]
  :%getdate) ; TODO -- this should include type info

(defmethod sql-jdbc.execute/set-timezone-sql :redshift
  [_]
  "SET TIMEZONE TO %s;")

;; This impl is basically the same as the default impl in [[metabase.driver.sql-jdbc.execute]], but doesn't attempt to
;; make the connection read-only, because that seems to be causing problems for people
(defmethod sql-jdbc.execute/do-with-connection-with-options :redshift
  [driver db-or-id-or-spec {:keys [^String session-timezone], :as options} f]
  (sql-jdbc.execute/do-with-resolved-connection
   driver
   db-or-id-or-spec
   options
   (fn [^Connection conn]
     (let [db (cond (integer? db-or-id-or-spec) (driver-api/with-metadata-provider db-or-id-or-spec
                                                  (driver-api/database (driver-api/metadata-provider)))
                    (u/id db-or-id-or-spec)     db-or-id-or-spec)]
       (sql-jdbc.execute/set-role-if-supported! driver conn db))
     (when-not (sql-jdbc.execute/recursive-connection?)
       (sql-jdbc.execute/set-best-transaction-level! driver conn)
       (sql-jdbc.execute/set-time-zone-if-supported! driver conn session-timezone)
       (try
         (.setHoldability conn ResultSet/CLOSE_CURSORS_AT_COMMIT)
         (catch Throwable e
           (log/debug e "Error setting default holdability for connection"))))
     (f conn))))

(defn- prepare-statement ^PreparedStatement [^Connection conn sql]
  (.prepareStatement conn
                     sql
                     ResultSet/TYPE_FORWARD_ONLY
                     ResultSet/CONCUR_READ_ONLY
                     ResultSet/CLOSE_CURSORS_AT_COMMIT))

(defn- quote-literal-for-connection
  "Quotes a string literal so that it can be safely inserted into Redshift queries, by returning the result of invoking
  the Redshift QUOTE_LITERAL function on the given string (which is set in a PreparedStatement as a parameter)."
  [^Connection conn ^String s]
  (with-open [stmt (doto (prepare-statement conn "SELECT QUOTE_LITERAL(?);")
                     (.setString 1 s))
              rs   (.executeQuery stmt)]
    (when (.next rs)
      (.getString rs 1))))

(defn- quote-literal-for-database
  "This function invokes quote-literal-for-connection with a connection for the given database. See its docstring for
  more detail."
  [driver database s]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   database
   nil
   (fn [conn]
     (quote-literal-for-connection conn s))))

(defmethod sql.qp/->honeysql [:redshift :regex-match-first]
  [driver [_ _opts arg pattern]]
  [:regexp_substr
   (sql.qp/->honeysql driver arg)
   ;; the parameter to REGEXP_SUBSTR can only be a string literal; neither prepared statement parameters nor encoding/
   ;; decoding functions seem to work (fails with java.sql.SQLExcecption: "The pattern must be a valid UTF-8 literal
   ;; character expression"), hence we will use a different function to safely escape it before splicing here
   [:raw (quote-literal-for-database driver (driver-api/database (driver-api/metadata-provider)) pattern)]])

(defmethod sql.qp/->honeysql [:redshift :replace]
  [driver [_ _opts arg pattern replacement]]
  [:replace
   (sql.qp/->honeysql driver arg)
   (sql.qp/->honeysql driver pattern)
   (sql.qp/->honeysql driver replacement)])

(defmethod sql.qp/->honeysql [:redshift :concat]
  [driver [_ _opts & args]]
  ;; concat() only takes 2 args, so generate multiple concats if we have more,
  ;; e.g. [:concat :x :y :z] => [:concat [:concat :x :y] :z] => concat(concat(x, y), z)
  (->> args
       (map (partial sql.qp/->honeysql driver))
       (reduce (fn [x y]
                 (if x
                   [:concat x y]
                   y))
               nil)))

(defmethod sql.qp/->honeysql [:redshift :avg]
  [driver [_ _opts field]]
  [:avg [:cast (sql.qp/->honeysql driver field) :float]])

(defmethod sql.qp/->integer :redshift
  [driver value]
  (sql.qp/->integer-with-round driver value))

(defn- extract [unit temporal]
  [::h2x/extract (format "'%s'" (name unit)) temporal])

(defn- datediff [unit x y]
  [:datediff [:raw (name unit)] x y])

(defmethod sql.qp/->honeysql [:redshift :datetime-diff]
  [driver [_ _opts x y unit]]
  (let [x (sql.qp/->honeysql driver x)
        y (sql.qp/->honeysql driver y)
        _ (sql.qp/datetime-diff-check-args x y (partial re-find #"(?i)^(timestamp|date)"))
        ;; unlike postgres, we need to make sure the values are timestamps before we
        ;; can do the calculation. otherwise, we'll get an error like
        ;; ERROR: function pg_catalog.date_diff("unknown", ..., ...) does not exist
        x (h2x/->timestamp x)
        y (h2x/->timestamp y)]
    (sql.qp/datetime-diff driver unit x y)))

(defmethod sql.qp/->honeysql [:redshift :relative-datetime]
  [driver [_ _opts amount unit]]
  (driver-api/maybe-cacheable-relative-datetime-honeysql driver unit amount))

(defmethod sql.qp/->honeysql [:redshift java.time.LocalDate]
  [_driver t]
  (-> [:raw (format "date '%s'" (u.date/format t))]
      (h2x/with-database-type-info "date")))

(defmethod sql.qp/->honeysql [:redshift java.time.LocalTime]
  [_driver t]
  (-> [:raw (format "time '%s'" (u.date/format "HH:mm:ss.SSS" t))]
      (h2x/with-database-type-info "time")))

(defmethod sql.qp/->honeysql [:redshift java.time.OffsetTime]
  [_driver t]
  (-> [:raw (format "time with time zone '%s'" (u.date/format "HH:mm:ss.SSS xxx" t))]
      (h2x/with-database-type-info "timetz")))

(defmethod sql.qp/->honeysql [:redshift java.time.LocalDateTime]
  [_driver t]
  (-> [:raw (format "timestamp '%s'" (u.date/format "yyyy-MM-dd HH:mm:ss.SSS" t))]
      (h2x/with-database-type-info "timestamp")))

(defmethod sql.qp/->honeysql [:redshift java.time.OffsetDateTime]
  [_driver t]
  (-> [:raw (format "timestamp with time zone '%s'" (u.date/format "yyyy-MM-dd HH:mm:ss.SSS xxx" t))]
      (h2x/with-database-type-info "timestamptz")))

(defmethod sql.qp/->honeysql [:redshift java.time.ZonedDateTime]
  [driver t]
  (sql.qp/->honeysql driver (t/offset-date-time t)))

(defmethod sql.qp/datetime-diff [:redshift :year]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :month x y) 12))

(defmethod sql.qp/datetime-diff [:redshift :quarter]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :month x y) 3))

(defmethod sql.qp/datetime-diff [:redshift :month]
  [_driver _unit x y]
  (h2x/+ (datediff :month x y)
         ;; redshift's datediff counts month boundaries not whole months, so we need to adjust
         [:case
          ;; if x<y but x>y in the month calendar then subtract one month
          [:and
           [:< x y]
           [:> (extract :day x) (extract :day y)]]
          [:inline -1]
          ;; if x>y but x<y in the month calendar then add one month
          [:and
           [:> x y]
           [:< (extract :day x) (extract :day y)]]
          [:inline 1]
          :else
          [:inline 0]]))

(defmethod sql.qp/datetime-diff [:redshift :week]
  [_driver _unit x y]
  (h2x// (datediff :day x y) 7))

(defmethod sql.qp/datetime-diff [:redshift :day]
  [_driver _unit x y]
  (datediff :day x y))

(defmethod sql.qp/datetime-diff [:redshift :hour]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :second x y) 3600))

(defmethod sql.qp/datetime-diff [:redshift :minute]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :second x y) 60))

(defmethod sql.qp/datetime-diff [:redshift :second]
  [_driver _unit x y]
  (h2x/- (extract :epoch y) (extract :epoch x)))

(defmethod sql.qp/->honeysql [:redshift ::sql.qp/expression-literal-text-value]
  [driver [_ _opts value]]
  (->> (sql.qp/->honeysql driver value)
       (h2x/cast :text)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.conn/connection-details->spec :redshift
  [_ {:keys [host port db dbname], :as opts}]
  (when (and db dbname)
    (log/warn "Redshift connection details should not contain both 'db' and 'dbname' options. Ignoring 'dbname'."))
  (sql-jdbc.common/handle-additional-options
   (merge
    {:classname                     "com.amazon.redshift.jdbc42.Driver"
     :subprotocol                   "redshift"
     :subname                       (str "//" host ":" port "/" (or db dbname))
     :ssl                           true
     :OpenSourceSubProtocolOverride false}
    (dissoc opts :host :port :db :dbname))))

(prefer-method
 sql-jdbc.execute/read-column-thunk
 [::sql-jdbc.legacy/use-legacy-classes-for-read-and-set Types/TIMESTAMP]
 [:postgres Types/TIMESTAMP])

(defmethod sql-jdbc.execute/read-column-thunk
  [:redshift Types/OTHER]
  [driver ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (if (= "interval" (.getColumnTypeName rsmeta i))
    #(.getValue ^RedshiftInterval (.getObject rs i RedshiftInterval))
    ((get-method sql-jdbc.execute/read-column-thunk [:postgres (.getColumnType rsmeta i)]) driver rs rsmeta i)))

(prefer-method
 sql-jdbc.execute/read-column-thunk
 [::sql-jdbc.legacy/use-legacy-classes-for-read-and-set Types/TIME]
 [:postgres Types/TIME])

;;; I don't think this should actually ever get called because we should be compiling an `OffsetTime` as a `timetz`
;;; literal
(prefer-method
 sql-jdbc.execute/set-parameter
 [::sql-jdbc.legacy/use-legacy-classes-for-read-and-set java.time.OffsetTime]
 [:postgres java.time.OffsetTime])

(defn- field->parameter-value
  "Map fields used in parameters to parameter `:value`s."
  [{:keys [user-parameters]}]
  (into {}
        (keep (fn [param]
                (if (contains? param :name)
                  [(:name param) (:value param)]
                  (when-let [field-id (match/match-one param
                                        [:field (field-id :guard integer?) _]
                                        (when (perf/some #{:dimension} &parents)
                                          field-id))]
                    [(:name (driver-api/field (driver-api/metadata-provider) field-id))
                     (:value param)]))))
        user-parameters))

(defmethod driver-api/query->remark :redshift
  [_ {{:keys [executed-by card-id dashboard-id]} :info, :as query}]
  (str "/* partner: \"metabase\", "
       (json/encode {:dashboard_id        dashboard-id
                     :chart_id            card-id
                     :optional_user_id    executed-by
                     :optional_account_id (driver-api/site-uuid)
                     :filter_values       (field->parameter-value query)})
       " */ "
       (driver-api/default-query->remark query)))

(defmethod sql-jdbc.execute/set-parameter [:redshift java.time.ZonedDateTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/sql-timestamp (t/with-zone-same-instant t (t/zone-id "UTC")))))

(defmethod driver/upload-type->database-type :redshift
  [_driver upload-type]
  (case upload-type
    :metabase.upload/varchar-255              [[:varchar 255]]
    :metabase.upload/text                     [[:varchar 65535]]
    :metabase.upload/int                      [:bigint]
    ;; identity(1, 1) defines an auto-increment column starting from 1
    :metabase.upload/auto-incrementing-int-pk [:bigint [:identity 1 1]]
    :metabase.upload/float                    [(keyword "double precision")]
    :metabase.upload/boolean                  [:boolean]
    :metabase.upload/date                     [:date]
    :metabase.upload/datetime                 [:timestamp]
    :metabase.upload/offset-datetime          [:timestamp-with-time-zone]))

(defmulti ^:private type->database-type
  "Internal type->database-type multimethod for Redshift that dispatches on type."
  {:arglists '([type])}
  identity)

(defmethod type->database-type :type/TextLike [_] [[:varchar 65535]])
(defmethod type->database-type :type/Text [_] [[:varchar 65535]])
(defmethod type->database-type :type/Number [_] [:bigint])
(defmethod type->database-type :type/BigInteger [_] [:bigint])
(defmethod type->database-type :type/Integer [_] [:integer])
(defmethod type->database-type :type/Float [_] [(keyword "double precision")])
(defmethod type->database-type :type/Boolean [_] [:boolean])
(defmethod type->database-type :type/Date [_] [:date])
(defmethod type->database-type :type/DateTime [_] [:timestamp])
(defmethod type->database-type :type/DateTimeWithTZ [_] [:timestamp-with-time-zone])
(defmethod type->database-type :type/Time [_] [:time])

(defmethod driver/type->database-type :redshift
  [_driver base-type]
  (type->database-type base-type))

(defmethod driver/allowed-promotions :redshift [_] {})

(defmethod driver/table-name-length-limit :redshift
  [_driver]
  ;; https://docs.aws.amazon.com/redshift/latest/dg/r_names.html
  127)

(defmethod driver/insert-into! :redshift
  [driver db-id table-name column-names values]
  ((get-method driver/insert-into! :sql-jdbc) driver db-id table-name column-names values))

;; Cal 2024-04-10: Commented this out instead of deleting it. We used to use this for `driver/describe-database` (see metabase#37439)
;; This might be helpful for getting privileges for actions in the future.
#_(defmethod sql-jdbc.sync/current-user-table-privileges :redshift
    [_driver conn-spec & {:as _options}]
    ;; KNOWN LIMITATION: this won't return privileges for external tables, calling has_table_privilege on an external table
    ;; result in an operation not supported error
    (->> (jdbc/query
          conn-spec
          (str/join
           "\n"
           ["with table_privileges as ("
            " select"
            "   NULL as role,"
            "   t.schemaname as schema,"
            "   t.objectname as table,"
            ;; if `has_table_privilege` is true `has_any_column_privilege` is false and vice versa, so we have to check both.
            "   pg_catalog.has_table_privilege(current_user, '\"' || t.schemaname || '\".\"' || t.objectname || '\"',  'SELECT')"
            "     OR pg_catalog.has_any_column_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'SELECT') as select,"
            "   pg_catalog.has_table_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'UPDATE')"
            "     OR pg_catalog.has_any_column_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'UPDATE') as update,"
            "   pg_catalog.has_table_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'INSERT') as insert,"
            "   pg_catalog.has_table_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'DELETE') as delete"
            " from ("
            "   select schemaname, tablename as objectname from pg_catalog.pg_tables"
            "   union"
            "   select schemaname, viewname as objectname from pg_views"
            " ) t"
            " where t.schemaname !~ '^pg_'"
            "   and t.schemaname <> 'information_schema'"
            "   and pg_catalog.has_schema_privilege(current_user, t.schemaname, 'USAGE')"
            ")"
            "select t.*"
            "from table_privileges t"]))
         (filter #(or (:select %) (:update %) (:delete %) (:update %)))))

;;; ----------------------------------------------- Connection Impersonation ------------------------------------------

(defmethod sql-jdbc/set-role-statement :redshift
  [driver conn role]
  (let [special-chars-pattern #"[^a-zA-Z0-9_]"
        needs-quote?          (re-find special-chars-pattern role)
        quoted-role           (cond->> role
                                needs-quote? (driver.postgres/memoized-quote-identifier driver conn))]
    (format "SET SESSION AUTHORIZATION %s;" quoted-role)))

(defmethod driver.sql/default-database-role :redshift
  [_ _]
  "DEFAULT")

(defmethod driver/add-columns! :redshift
  [driver db-id table-name column-definitions & {:as settings}]
  ;; Redshift doesn't support adding multiple columns at a time, so we break it up
  (let [f (get-method driver/add-columns! :postgres)]
    (doseq [[k v] column-definitions]
      (f driver db-id table-name {k v} settings))))

#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod driver/alter-columns! :redshift
  [_driver _db-id _table-name column-definitions]
  ;; TODO: redshift doesn't allow promotion of ints to floats using ALTER TABLE.
  (let [[column-name type-and-constraints] (first column-definitions)
        type (first type-and-constraints)]
    (throw (ex-info (format "There's a value with the wrong type ('%s') in the '%s' column" (name type) (name column-name)) {}))))

(defmethod sql.qp/cast-temporal-byte [:redshift :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal
                               [:from_varbyte expr (h2x/literal "UTF8")]))

(defmethod sql.qp/cast-temporal-byte [:redshift :Coercion/ISO8601Bytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/ISO8601->DateTime
                               [:from_varbyte expr (h2x/literal "UTF8")]))

(defmethod sql-jdbc/impl-table-known-to-not-exist? :redshift
  [_ e]
  ;; https://docs.aws.amazon.com/redshift/latest/mgmt/rsql-query-tool-error-codes.html
  ;; 42P01: undefined_table, 3F000: invalid_schema_name
  (contains? #{"42P01" "3F000"} (sql-jdbc/get-sql-state e)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Workspace Isolation                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; All three workspace-isolation multimethods are overridden for Redshift:
;;
;; - `init` drops the postgres impl's trailing `GRANT "<user>" TO CURRENT_USER`
;;   (PG-specific role-membership syntax Redshift rejects).
;;
;; - `grant-workspace-read-access!` adds `REVOKE CREATE ON SCHEMA … FROM <user>`
;;   and `REVOKE INSERT, UPDATE, DELETE, … ON ALL TABLES IN SCHEMA … FROM <user>`
;;   per source schema, plus a pre-flight probe for the public-CREATE-grant
;;   limit (see below).
;;
;; - `destroy` replaces the postgres impl's `DROP OWNED BY` (which behaves
;;   differently in Redshift) with explicit per-schema REVOKEs.
;;
;; Isolation limit, checked at grant time via [[assert-no-public-create-grant!]]:
;; Redshift's permission model (inherited from PostgreSQL) lets a user receive
;; privileges either directly or through PUBLIC. REVOKE-ing CREATE from a
;; specific user only removes their direct grant — it can't override a PUBLIC
;; grant. Redshift's `public` schema has CREATE granted to PUBLIC by default,
;; so on a default-config cluster the workspace user inherits CREATE on `public`
;; transitively: it can create tables there (privilege-escalation hole), becomes
;; their owner, and `DROP USER` then fails at deprovisioning. The probe at grant
;; time fails fast with a 412 so the cluster admin can run
;; `REVOKE CREATE ON SCHEMA <name> FROM PUBLIC` before retrying. Custom input
;; schemas created without a PUBLIC grant pass the probe and don't need any
;; admin action.

(defn- user-exists?
  "Check if a Redshift user exists."
  [conn username]
  (seq (jdbc/query conn ["SELECT 1 FROM pg_user WHERE usename = ?" username])))

(defn- public-create-grant?
  "Redshift-flavored check for `public-create-grant?`. Postgres reads
   `pg_namespace.nspacl::text`, but Redshift refuses to cast `aclitem` to
   character varying — so we use Redshift's own `SVV_SCHEMA_PRIVILEGES`
   system view instead, which exposes the equivalent grant info as plain
   columns."
  [conn schema-name]
  (boolean
   (seq (jdbc/query conn
                    ["SELECT 1 FROM svv_schema_privileges
                       WHERE namespace_name = ?
                         AND identity_type = 'public'
                         AND privilege_type = 'CREATE'"
                     schema-name]))))

(defn- quote-schema [s] (sql.u/quote-name :redshift :schema s))
(defn- quote-field  [s] (sql.u/quote-name :redshift :field s))

(defn- assert-no-public-create-grant!
  [conn schema-name]
  (when (public-create-grant? conn schema-name)
    (driver.postgres/raise-public-create-grant! schema-name)))

(defn- current-user-usesuper?
  "True when `current_user` has `usesuper`. Superusers can ALTER DEFAULT
   PRIVILEGES FOR USER <anyone>, so they bypass the membership check below.

   Redshift's user-membership model differs from PostgreSQL's: there is no
   `pg_has_role(name, name, text)` overload (the function doesn't exist on
   Redshift at all on RA3 clusters), and `pg_group` is not generally populated.
   The practical membership graph collapses to: you are `current_user`, or you
   are a superuser. Anything else fails at REVOKE time."
  [conn]
  (boolean (:usesuper (first (jdbc/query conn ["SELECT usesuper FROM pg_user WHERE usename = current_user"])))))

(defn- relation-owners-in-schema
  "Distinct relation owners in `schema-name`. Caller filters out the ones
   `current_user` can impersonate.

   Why this matters: `ALTER DEFAULT PRIVILEGES IN SCHEMA <s>` (without
   `FOR ROLE`) only affects future objects created by the connection user.
   Tables created later by foreign owners skip the iso-user grant -- workspace
   data goes stale silently.

   `relkind` set matches the scope of `ALTER DEFAULT PRIVILEGES ... ON TABLES`:
   ordinary tables (`r`), views (`v`), materialized views (`m`), partitioned
   tables (`p`), and foreign tables (`f`). Spectrum external tables live in
   `svv_external_tables` and are not covered by `pg_default_acl`, so they need
   no entry here."
  [conn schema-name]
  (->> (jdbc/query conn
                   [(str "SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner "
                         "FROM pg_class c "
                         "JOIN pg_namespace n ON n.oid = c.relnamespace "
                         "WHERE n.nspname = ? "
                         "  AND c.relkind IN ('r','v','m','p','f') "
                         "ORDER BY owner")
                    schema-name])
       (keep :owner)))

(defn- default-acl-grantors-in-schema
  "Distinct grantors of pre-existing `pg_default_acl` entries in `schema-name`.
   Caller filters out the ones `current_user` can impersonate.

   Distinct from [[relation-owners-in-schema]]: that surfaces future-object
   grantor risk; this surfaces pre-existing default-priv rows we will need to
   REVOKE FOR USER <grantor> at destroy time. Both block the workspace
   contract."
  [conn schema-name]
  (->> (jdbc/query conn
                   [(str "SELECT DISTINCT u.usename AS owner "
                         "FROM pg_catalog.pg_default_acl d "
                         "JOIN pg_catalog.pg_user      u ON u.usesysid = d.defacluser "
                         "JOIN pg_catalog.pg_namespace n ON n.oid      = d.defaclnamespace "
                         "WHERE n.nspname = ? "
                         "  AND d.defaclobjtype = 'r' "
                         "ORDER BY owner")
                    schema-name])
       (keep :owner)))

(defn assert-can-alter-default-privileges!
  "Throws when `schema-name` has relation-owners or pre-existing default-priv
   grantors that `current_user` cannot impersonate via `FOR USER`. On Redshift
   the impersonation graph collapses to: `owner == current_user`, or
   `current_user` is a superuser.

   Without this guarantee we can neither extend defaults to future objects of
   foreign owners (silent data drift) nor REVOKE pre-existing default-priv
   entries at destroy time (DROP USER fails -> GHY-3709)."
  [conn schema-name]
  (when-not (current-user-usesuper? conn)
    (let [me      (:me (first (jdbc/query conn ["SELECT current_user AS me"])))
          owners  (->> (concat (relation-owners-in-schema     conn schema-name)
                               (default-acl-grantors-in-schema conn schema-name))
                       distinct
                       (remove #(= % me))
                       (map (fn [o] {:owner o})))]
      (when (seq owners)
        (driver.postgres/raise-unmemberable-default-priv-owners! schema-name owners)))))

(defmethod driver/init-workspace-isolation! :redshift
  [_driver database workspace]
  (let [schema-name    (driver.u/workspace-isolation-namespace-name workspace)
        read-user      {:user     (driver.u/workspace-isolation-user-name workspace)
                        :password (driver.u/random-workspace-password)}
        quoted-schema  (quote-schema schema-name)
        quoted-user    (quote-field (:user read-user))]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (let [user-sql (if (user-exists? t-conn (:user read-user))
                       (format "ALTER USER %s WITH PASSWORD '%s'" quoted-user (:password read-user))
                       (format "CREATE USER %s WITH PASSWORD '%s'" quoted-user (:password read-user)))]
        (with-open [^Statement stmt (.createStatement ^Connection (:connection t-conn))]
          (doseq [sql [(format "CREATE SCHEMA IF NOT EXISTS %s" quoted-schema)
                       user-sql
                       (format "GRANT ALL PRIVILEGES ON SCHEMA %s TO %s" quoted-schema quoted-user)
                       (format "ALTER DEFAULT PRIVILEGES IN SCHEMA %s GRANT ALL ON TABLES TO %s"
                               quoted-schema quoted-user)]]
            (.addBatch ^Statement stmt ^String sql))
          (try
            (.executeBatch ^Statement stmt)
            (catch Throwable t
              (throw (driver.u/scrub-exceptions t [(:password read-user)])))))))
    {:schema           schema-name
     :database_details read-user}))

(defmethod driver/grant-workspace-read-access! :redshift
  [_driver database workspace schemas]
  (let [username       (-> workspace :database_details :user)
        quoted-user    (quote-field username)
        source-schemas (set schemas)
        spec           (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    ;; Pre-flight check (read-only) can run in its own transaction. Redshift's
    ;; GRANT statements error loudly when grant authority is missing, so PG's
    ;; silent-skip USAGE/SELECT class doesn't reproduce here. But two ALTER
    ;; DEFAULT PRIVILEGES failure modes do reproduce and need explicit checks:
    ;;
    ;; - Foreign relation-owners: tables created later by an owner the
    ;;   connection user can't impersonate skip our default-priv grant.
    ;; - Foreign default-priv grantors: pre-existing `pg_default_acl` rows whose
    ;;   grantor we can't impersonate at destroy time -> `DROP USER` fails
    ;;   (GHY-3709).
    (jdbc/with-db-transaction [t-conn spec]
      (doseq [s source-schemas]
        (assert-no-public-create-grant!       t-conn s)
        (assert-can-alter-default-privileges! t-conn s)))
    ;; Grants run as auto-commit per statement so privileges are immediately
    ;; observable to a subsequent describe-database from a different connection.
    (doseq [s   source-schemas
            :let [quoted-schema (quote-schema s)]
            sql [(format "GRANT USAGE ON SCHEMA %s TO %s" quoted-schema quoted-user)
                 (format "REVOKE CREATE ON SCHEMA %s FROM %s" quoted-schema quoted-user)
                 (format "REVOKE INSERT, UPDATE, DELETE, REFERENCES ON ALL TABLES IN SCHEMA %s FROM %s"
                         quoted-schema quoted-user)
                 ;; Schema-wide SELECT — workspace-scoped users receive whole-schema access.
                 ;; Per-table granularity intentionally discarded (API contract is namespace-grained).
                 (format "GRANT SELECT ON ALL TABLES IN SCHEMA %s TO %s" quoted-schema quoted-user)
                 (format "ALTER DEFAULT PRIVILEGES IN SCHEMA %s GRANT SELECT ON TABLES TO %s"
                         quoted-schema quoted-user)]]
      (jdbc/execute! spec [sql]))))

(defn- schema-exists?
  "Check if a schema exists in Redshift."
  [conn schema-name]
  (seq (jdbc/query conn ["SELECT 1 FROM pg_namespace WHERE nspname = ?" schema-name])))

(defn- schemas-with-user-grants
  "Query Redshift to find schemas where the user has been granted relation-level privileges.
   `svv_relation_privileges` only surfaces actual GRANTs on existing relations -- it does NOT
   list ALTER DEFAULT PRIVILEGES entries. See [[default-acl-grants-for-user]] for those."
  [conn username]
  (->> (jdbc/query conn
                   ["SELECT DISTINCT namespace_name FROM svv_relation_privileges
           WHERE identity_name = ? AND identity_type = 'user'"
                    username])
       (keep :namespace_name)))

(defn- escape-like-pattern
  "Escape PostgreSQL/Redshift LIKE metacharacters (`%`, `_`) and our chosen
   escape char (`|`) in `s` so it matches literally. Used with `ESCAPE '|'` on
   the LIKE clause -- `|` chosen over `\\` because Redshift's SQL parser treats
   a literal `'\\'` as an unterminated string. Without this escaping, iso-user
   names containing `_` (which they always do -- the generator produces
   `mb__isolation_<id>` form) would match siblings via wildcard, and the
   destroy could revoke default-priv rows belonging to unrelated users."
  [^String s]
  (-> s
      (str/replace "|" "||")
      (str/replace "%" "|%")
      (str/replace "_" "|_")))

(defn- default-acl-grants-for-user
  "Enumerate `(grantor, schema)` pairs that have an ALTER DEFAULT PRIVILEGES entry referencing
   `username` as a grantee. Returns a seq of `{:grantor :schema}` maps.

   Redshift exposes `pg_default_acl` but rejects `aclitem`->`varchar` casts and does not
   provide `aclexplode`. We use `array_to_string(defaclacl, ',')` (allowed on aclitem[]).
   Verified live: Redshift's `array_to_string` strips the enclosing braces of an `aclitem[]`,
   so each entry is comma-separated text of the form `grantee=privs/grantor`. To make the
   grantee match unambiguous, we prepend a `,` to the haystack and search for `,<name>=` --
   that way a row with only one grantee (no preceding entries) still matches.

   LIKE metacharacters in `username` are escaped with `ESCAPE '|'` so `_` and `%` match
   literally -- critical because the iso-user generator always produces `_`-containing
   names. Pipe over backslash because Redshift's parser rejects a literal backslash escape
   clause as an unterminated string.

   Schema-less entries (`defaclnamespace = 0`, applies to any schema) are excluded -- our
   provisioning only ever issues `ALTER DEFAULT PRIVILEGES IN SCHEMA`, never the no-schema
   form, so those entries do not originate here."
  [conn username]
  (let [esc (escape-like-pattern username)]
    (jdbc/query
     conn
     [(str "SELECT u.usename   AS grantor, "
           "       n.nspname   AS schema "
           "FROM   pg_catalog.pg_default_acl d "
           "JOIN   pg_catalog.pg_user      u ON u.usesysid = d.defacluser "
           "JOIN   pg_catalog.pg_namespace n ON n.oid      = d.defaclnamespace "
           "WHERE  d.defaclobjtype = 'r' "
           "  AND (',' || array_to_string(d.defaclacl, ',')) LIKE ? ESCAPE '|'")
      (str "%," esc "=%")])))

(defmethod driver/destroy-workspace-isolation! :redshift
  [_driver database workspace]
  (let [schema-name   (:schema workspace)
        username      (-> workspace :database_details :user)
        quoted-user   (quote-field username)
        quoted-schema (quote-schema schema-name)
        spec          (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    ;; Foreign-grantor default-priv REVOKEs run first, each in its own autocommit
    ;; statement. Redshift has no SAVEPOINT and aborts the entire transaction on
    ;; the first error, so these cannot share a transaction with the main cleanup
    ;; batch: one stale row (schema dropped between discovery and execution) would
    ;; otherwise poison DROP USER. Autocommit + per-statement catch is what
    ;; actually lets the rest proceed.
    (when (user-exists? spec username)
      (doseq [{:keys [grantor schema]} (default-acl-grants-for-user spec username)
              :let [sql (format "ALTER DEFAULT PRIVILEGES FOR USER %s IN SCHEMA %s REVOKE ALL ON TABLES FROM %s"
                                (quote-field grantor) (quote-schema schema) quoted-user)]]
        (try
          (jdbc/execute! spec [sql])
          (catch Throwable t
            (log/warnf t "Failed to revoke default-priv (%s, %s) referencing iso-user %s; continuing"
                       grantor schema username)))))
    ;; Main batch stays transactional: relation revokes, iso-schema bare REVOKE,
    ;; DROP SCHEMA, DROP USER -- the cleanup we want atomic.
    (jdbc/with-db-transaction [t-conn spec]
      (let [user-exists     (user-exists? t-conn username)
            schema-exists   (schema-exists? t-conn schema-name)
            granted-schemas (when user-exists
                              (schemas-with-user-grants t-conn username))]
        (with-open [^Statement stmt (.createStatement ^Connection (:connection t-conn))]
          (when user-exists
            (doseq [schema granted-schemas
                    :let [quoted-granted-schema (quote-schema schema)]]
              (.addBatch ^Statement stmt
                         ^String (format "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %s FROM %s"
                                         quoted-granted-schema quoted-user))
              (.addBatch ^Statement stmt
                         ^String (format "REVOKE ALL PRIVILEGES ON SCHEMA %s FROM %s"
                                         quoted-granted-schema quoted-user)))
            ;; Iso-namespace default-priv was issued by the connection user at init time, so a
            ;; no-FOR-USER REVOKE is correct here. Guarded on schema existence to avoid
            ;; erroring on a schema that was dropped manually. Coverage for foreign-grantor
            ;; default-priv rows is handled above by the per-grantor autocommit loop.
            (when schema-exists
              (.addBatch ^Statement stmt
                         ^String (format "ALTER DEFAULT PRIVILEGES IN SCHEMA %s REVOKE ALL ON TABLES FROM %s"
                                         quoted-schema quoted-user))))
          ;; These are safe with IF EXISTS
          (.addBatch ^Statement stmt
                     ^String (format "DROP SCHEMA IF EXISTS %s CASCADE" quoted-schema))
          (.addBatch ^Statement stmt
                     ^String (format "DROP USER IF EXISTS %s" quoted-user))
          (.executeBatch ^Statement stmt))))))

(defmethod driver/llm-sql-dialect-resource :redshift [_]
  "metabot/prompts/dialects/redshift.md")
