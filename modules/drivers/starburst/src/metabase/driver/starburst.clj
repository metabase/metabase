(ns metabase.driver.starburst
  "starburst driver."
  (:refer-clojure :exclude [select-keys])
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [select-keys]])
  (:import
   (com.mchange.v2.c3p0 C3P0ProxyConnection)
   (io.trino.jdbc TrinoConnection)
   (java.sql
    Connection
    PreparedStatement
    ResultSet
    ResultSetMetaData
    SQLException
    SQLType
    Time
    Types)
   (java.time
    LocalDateTime
    LocalTime
    OffsetDateTime
    OffsetTime
    ZonedDateTime)
   (java.time.format DateTimeFormatter)
   (java.time.temporal ChronoField Temporal)))

(driver/register! :starburst, :parent #{::sql-jdbc.legacy/use-legacy-classes-for-read-and-set})

(set! *warn-on-reflection* true)

(prefer-method driver/database-supports? [:starburst :set-timezone] [:sql-jdbc :set-timezone])

(doseq [[feature supported?] {:set-timezone                    true
                              :basic-aggregations              true
                              :standard-deviation-aggregations true
                              :expressions                     true
                              :native-parameters               true
                              :expression-aggregations         true
                              :expression-literals             true
                              :binning                         true
                              :datetime-diff                   true
                              :convert-timezone                true
                              :connection/multiple-databases   true
                              :metadata/key-constraints        false
                              :now                             true
                              :database-routing                true
                              :connection-impersonation        true}]
  (defmethod driver/database-supports? [:starburst feature] [_ _ _] supported?))

(defn- format-field
  [name value]
  (if (nil? value)
    ""
    (str " " name ": " value)))

(defmethod driver-api/query->remark :starburst
  [_ {{:keys [card-id dashboard-id]} :info, :as query}]
  (str
   (driver-api/default-query->remark query)
   (format-field "accountID" (driver-api/site-uuid))
   (format-field "dashboardID" dashboard-id)
   (format-field "cardID" card-id)))

(defn- handle-execution-error-details
  [^Exception e details]
  (let [message (.getMessage e)
        execute-immediate (get details :prepared-optimized false)]
    (cond
      (and (str/includes? message "Expecting: 'USING'") execute-immediate)
      (throw (Exception. "\"Optimized prepared statements\" require Starburst Galaxy, Starburst Enterprise (version 420-e or higher), or starburst (version 418 or higher)"))
      :else (throw e))))

(defmethod driver/can-connect? :starburst
  [driver {:keys [catalog], :as details}]
  (try
    ((get-method driver/can-connect? :sql-jdbc) driver details)
    (sql-jdbc.conn/with-connection-spec-for-testing-connection [spec [driver details]]
      ;; jdbc/query is used to see if we throw, we want to ignore the results
      (let [query (format "SHOW CATALOGS LIKE '%s'" catalog)
            response (jdbc/query spec query)]
        (= [{:catalog catalog}] response)))
    (catch Throwable e
      (handle-execution-error-details e details))))

;;; The Starburst JDBC driver DOES NOT support the `.getImportedKeys` method so just return `nil` here so the
;;; implementation doesn't try to use it.
#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod driver/describe-table-fks :starburst
  [_driver _database _table]
  ;; starburst does not support finding foreign key metadata tables, but some connectors support foreign keys.
  ;; We have this return nil to avoid running unnecessary queries during fks sync.
  nil)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Query Processor
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^:const timestamp-with-time-zone-db-type "timestamp with time zone")

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Misc Implementations                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- format-mod
  [_fn [x y]]
  (let [[x-sql & x-args] (sql/format-expr x {:nested true})
        [y-sql & y-args] (sql/format-expr y {:nested true})]
    (into [(format "mod(%s, %s)" x-sql y-sql)]
          cat
          [x-args y-args])))

(sql/register-fn! ::mod #'format-mod)

(defmethod sql.qp/add-interval-honeysql-form :starburst
  [_ hsql-form amount unit]
  (let [type-info   (h2x/type-info hsql-form)
        out-form [:date_add (h2x/literal unit) [:inline amount] hsql-form]]
    (if (some? type-info)
      (h2x/with-type-info out-form type-info)
      out-form)))

(defmethod sql.qp/apply-top-level-clause [:starburst :page]
  [_ _ honeysql-query {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can simply use limit
      (sql.helpers/limit honeysql-query items)
      ;; if we need to do an offset we have to do nesting to generate a row number and where on that
      (let [over-clause (format "row_number() OVER (%s)"
                                (first (sql/format (select-keys honeysql-query [:order-by])
                                                   :allow-dashed-names? true
                                                   :quoting :ansi)))]
        (-> (apply sql.helpers/select (map last (:select honeysql-query)))
            (sql.helpers/from (sql.helpers/select honeysql-query [[:raw over-clause] :__rownum__]))
            (sql.helpers/where [:> :__rownum__ offset])
            (sql.helpers/limit items))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Temporal Casting                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/cast-temporal-string [:starburst :Coercion/ISO8601->DateTime]
  [_driver _semantic_type expr]
  (h2x/->timestamp [:replace expr "T" " "]))

(defmethod sql.qp/cast-temporal-string [:starburst :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_ _coercion-strategy expr]
  [:date_parse expr (h2x/literal "%Y%m%d%H%i%s")])

(defmethod sql.qp/cast-temporal-byte [:starburst :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal
                               [:from_utf8 expr]))

(defmethod sql.qp/cast-temporal-byte [:starburst :Coercion/ISO8601Bytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/ISO8601->DateTime
                               [:from_utf8 expr]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Date Truncation                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- in-report-zone
  "Returns a HoneySQL form to interpret the `expr` (a temporal value) in the current report time zone, via starburst's
  `AT TIME ZONE` operator. See https://starburst.io/docs/current/functions/datetime.html#time-zone-conversion"
  [expr]
  (let [report-zone (driver-api/report-timezone-id-if-supported :starburst (driver-api/database (driver-api/metadata-provider)))
        ;; if the expression itself has type info, use that, or else use a parent expression's type info if defined
        type-info   (h2x/type-info expr)
        db-type     (h2x/type-info->db-type type-info)]
    (if (and ;; AT TIME ZONE is only valid on these starburst types; if applied to something else (ex: `date`), then
         ;; an error will be thrown by the query analyzer
         db-type
         (re-find #"(?i)^time(?:stamp)?(?:\(\d+\))?(?: with time zone)?$" db-type)
         ;; if one has already been set, don't do so again
         (not (::in-report-zone? (meta expr)))
         report-zone)
      (-> (h2x/with-database-type-info (h2x/at-time-zone expr report-zone) timestamp-with-time-zone-db-type)
          (vary-meta assoc ::in-report-zone? true))
      expr)))

;; most date extraction and bucketing functions need to account for report timezone

(defmethod sql.qp/date [:starburst :default]
  [_ _ expr]
  expr)

(defmethod sql.qp/date [:starburst :second-of-minute]
  [_ _ expr]
  [:second (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :minute]
  [_ _ expr]
  [:date_trunc (h2x/literal :minute) (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :minute-of-hour]
  [_ _ expr]
  [:minute (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :hour]
  [_ _ expr]
  [:date_trunc (h2x/literal :hour) (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :hour-of-day]
  [_ _ expr]
  [:hour (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :day]
  [_ _ expr]
  [:date (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :day-of-week]
  [_ _ expr]
  (sql.qp/adjust-day-of-week :starburst [:day_of_week (in-report-zone expr)]))

(defmethod sql.qp/date [:starburst :day-of-month]
  [_ _ expr]
  [:day (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :day-of-year]
  [_ _ expr]
  [:day_of_year (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :week]
  [_ _ expr]
  (sql.qp/adjust-start-of-week :starburst (fn [expr] [:date_trunc (h2x/literal :week) (in-report-zone expr)]) expr))

(defmethod sql.qp/date [:starburst :week-of-year-iso]
  [_ _ expr]
  [:week (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :month]
  [_ _ expr]
  [:date_trunc (h2x/literal :month) (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :month-of-year]
  [_ _ expr]
  [:month (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :quarter]
  [_ _ expr]
  [:date_trunc (h2x/literal :quarter) (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :quarter-of-year]
  [_ _ expr]
  [:quarter (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :year]
  [_ _ expr]
  [:date_trunc (h2x/literal :year) (in-report-zone expr)])

(defmethod sql.qp/date [:starburst :year-of-era]
  [_ _ expr]
  [:year (in-report-zone expr)])

(defmethod sql.qp/current-datetime-honeysql-form :starburst
  [_]
  ;; the current_timestamp in starburst returns a `timestamp with time zone`, so this needs to be overridden
  (h2x/with-type-info :%now {::h2x/database-type timestamp-with-time-zone-db-type}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Custom HoneySQL Clause Impls                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/->honeysql [:starburst Boolean]
  [_ bool]
  [:raw (if bool "TRUE" "FALSE")])

(defmethod sql.qp/->honeysql [:starburst :regex-match-first]
  [driver [_ arg pattern]]
  [:regexp_extract (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)])

(defmethod sql.qp/->honeysql [:starburst :median]
  [driver [_ arg]]
  [:approx_percentile (sql.qp/->honeysql driver arg) 0.5])

(defmethod sql.qp/->honeysql [:starburst :percentile]
  [driver [_ arg p]]
  [:approx_percentile (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver p)])

(defmethod sql.qp/->honeysql [:starburst :log]
  [driver [_ field]]
  ;; recent starburst versions have a `log10` function (not `log`)
  [:log10 (sql.qp/->honeysql driver field)])

(defmethod sql.qp/->honeysql [:starburst :count-where]
  [driver [_ pred]]
  ;; starburst will use the precision given here in the final expression, which chops off digits
  ;; need to explicitly provide two digits after the decimal
  (sql.qp/->honeysql driver [:sum-where 1.00M pred]))

(defmethod sql.qp/->honeysql [:starburst :time]
  [_ [_ t]]
  ;; Convert t to locale time, then format as sql. Then add cast.
  (h2x/cast :time (u.date/format-sql (t/local-time t))))

(defmethod sql.qp/->honeysql [:starburst ZonedDateTime]
  [_ ^ZonedDateTime t]
  ;; use the starburst cast to `timestamp with time zone` operation to interpret in the correct TZ, regardless of
  ;; connection zone
  (h2x/cast timestamp-with-time-zone-db-type (u.date/format-sql t)))

(defmethod sql.qp/->honeysql [:starburst OffsetDateTime]
  [_ ^OffsetDateTime t]
  ;; use the starburst cast to `timestamp with time zone` operation to interpret in the correct TZ, regardless of
  ;; connection zone
  (h2x/cast timestamp-with-time-zone-db-type (u.date/format-sql t)))

(defmethod sql.qp/unix-timestamp->honeysql [:starburst :seconds]
  [_ _ expr]
  (let [report-zone (driver-api/report-timezone-id-if-supported :starburst (driver-api/database (driver-api/metadata-provider)))]
    [:from_unixtime expr (h2x/literal (or report-zone "UTC"))]))

(defn- timestamp-with-time-zone? [expr]
  (let [type (h2x/database-type expr)]
    (and type (re-find #"(?i)^timestamp(?:\(\d+\))? with time zone$" type))))

(defn- ->timestamp-with-time-zone [expr]
  (if (timestamp-with-time-zone? expr)
    expr
    (h2x/cast timestamp-with-time-zone-db-type expr)))

(defn- ->at-time-zone [expr]
  (h2x/at-time-zone (->timestamp-with-time-zone expr) (driver-api/results-timezone-id)))

(doseq [unit [:year :quarter :month :week :day]]
  (defmethod sql.qp/datetime-diff [:starburst unit] [_driver unit x y]
    [:date_diff (h2x/literal unit)
     (h2x/->date (->at-time-zone x))
     (h2x/->date (->at-time-zone y))]))

(doseq [unit [:hour :minute :second]]
  (defmethod sql.qp/datetime-diff [:starburst unit] [_driver unit x y]
    [:date_diff (h2x/literal unit)
     (->at-time-zone x)
     (->at-time-zone y)]))

(defmethod sql.qp/->honeysql [:starburst :convert-timezone]
  [driver [_ arg target-timezone source-timezone]]
  (let [expr         (sql.qp/->honeysql driver (cond-> arg
                                                 (string? arg) u.date/parse))
        with_timezone? (or (sql.qp.u/field-with-tz? arg)
                           (h2x/is-of-type? expr #"(?i)^timestamp(?:\(\d+\))? with time zone$"))
        _ (sql.u/validate-convert-timezone-args with_timezone? target-timezone source-timezone)
        expr [:at_timezone
              (if with_timezone?
                expr
                [:with_timezone expr (or source-timezone (driver-api/results-timezone-id))])
              target-timezone]]
    (h2x/with-database-type-info (h2x/->timestamp expr) "timestamp")))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Sync                                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(def starburst-type->base-type
  "Function that returns a `base-type` for the given `straburst-type` (can be a keyword or string)."
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [[#"(?i)boolean"                           :type/Boolean]
    [#"(?i)tinyint"                           :type/Integer]
    [#"(?i)smallint"                          :type/Integer]
    [#"(?i)integer"                           :type/Integer]
    [#"(?i)bigint"                            :type/BigInteger]
    [#"(?i)real"                              :type/Float]
    [#"(?i)double"                            :type/Float]
    [#"(?i)decimal.*"                         :type/Decimal]
    [#"(?i)varchar.*"                         :type/Text]
    [#"(?i)char.*"                            :type/Text]
    [#"(?i)json"                              :type/Text]
    [#"(?i)date"                              :type/Date]
    [#"(?i)^timestamp$"                       :type/DateTime]
    [#"(?i)^timestamp\(\d+\)$"                :type/DateTime]
    [#"(?i)^timestamp with time zone$"        :type/DateTimeWithTZ]
    [#"(?i)^timestamp with time zone\(\d+\)$" :type/DateTimeWithTZ]
    [#"(?i)^timestamp\(\d+\) with time zone$" :type/DateTimeWithTZ]
    [#"(?i)^time$"                            :type/Time]
    [#"(?i)^time\(\d+\)$"                     :type/Time]
    [#"(?i)^time with time zone$"             :type/TimeWithTZ]
    [#"(?i)^time with time zone\(\d+\)$"      :type/TimeWithTZ]
    [#"(?i)^time\(\d+\) with time zone$"      :type/TimeWithTZ]
    [#"(?i)array"                             :type/Array]
    [#"(?i)map"                               :type/Dictionary]
    [#"(?i)varbinary.*"                       :type/*]
    [#"(?i)row.*"                             :type/*]
    [#".*"                                    :type/*]]))

(defn describe-catalog-sql
  "The SHOW SCHEMAS statement that will list all schemas for the given `catalog`."
  {:added "0.39.0"}
  [driver catalog]
  (str "SHOW SCHEMAS FROM " (sql.u/quote-name driver :database catalog)))

(defn describe-schema-sql
  "The SHOW TABLES statement that will list all tables for the given `catalog` and `schema`."
  {:added "0.39.0"}
  [driver catalog schema]
  (str "SHOW TABLES FROM " (sql.u/quote-name driver :schema catalog schema)))

(defn describe-table-sql
  "The DESCRIBE  statement that will list information about the given `table`, in the given `catalog` and schema`."
  {:added "0.39.0"}
  [driver catalog schema table]
  (str "DESCRIBE " (sql.u/quote-name driver :table catalog schema table)))

(def excluded-schemas
  "The set of schemas that should be excluded when querying all schemas."
  #{"information_schema"})

(defmethod sql-jdbc.sync/database-type->base-type :starburst
  [_ field-type]
  (let [base-type (starburst-type->base-type field-type)]
    (log/debugf "database-type->base-type %s -> %s" field-type base-type)
    base-type))

(defmethod sql-jdbc.sync.interface/have-select-privilege? :starburst
  [driver ^Connection conn table-schema table-name]
  (try
    ;; Both Hive and Iceberg plugins for Trino expose one another's tables
    ;; at the metadata level, even though they are not queryable through that catalog.
    ;; So rather than using SHOW TABLES, we will DESCRIBE the table to check for
    ;; queryability. If the table is not queryable for this reason, we will return
    ;; false. It's a slight stretch of the concept of "permissions," but it is true
    ;; that we cannot query these tables...
    (let [catalog (some-> conn .getCatalog)
          sql (describe-table-sql driver catalog table-schema table-name)]
      (with-open [stmt (.prepareStatement conn sql)
                  rs (.executeQuery stmt)]
        (.next rs)))
    (catch SQLException e
      ;; The actual exception thrown is TrinoException with error code UNSUPPORTED_TABLE_TYPE (133001),
      ;; but we can't check the type directly since the relevant io.trino.spi.* classes are not
      ;; included in trino-jdbc. We check the vendor-specific error code instead.
      ;; See HiveMetadata.java and UnknownTableTypeException.java in trinodb/trino
      (when (= 133001 (.getErrorCode e))
        (log/debugf e "Table %s.%s is not accessible through this catalog (mixed catalog table type)"
                    table-schema table-name))
      false)))

(defn- describe-schema
  "Gets a set of maps for all tables in the given `catalog` and `schema`."
  [driver ^Connection conn catalog schema]
  (with-open [stmt (.createStatement conn)]
    (let [sql (describe-schema-sql driver catalog schema)
          rs (sql-jdbc.execute/execute-statement! driver stmt sql)]
      (into
       #{}
       (comp (filter (fn [{table-name :table :as _full}]
                       (sql-jdbc.sync.interface/have-select-privilege? driver conn schema table-name)))
             (map (fn [{table-name :table}]
                    {:name        table-name
                     :schema      schema})))
       (jdbc/reducible-result-set rs {})))))

(defn- all-schemas
  "Gets a set of maps for all tables in all schemas in the given `catalog`."
  [driver ^Connection conn catalog]
  (with-open [stmt (.createStatement conn)]
    (let [sql (describe-catalog-sql driver catalog)
          rs (sql-jdbc.execute/execute-statement! driver stmt sql)]
      (into []
            (map (fn [{:keys [schema] :as _full}]
                   (when-not (contains? excluded-schemas schema)
                     (describe-schema driver conn catalog schema))))
            (jdbc/reducible-result-set rs {})))))

(defmethod driver/describe-database* :starburst
  [driver database]
  (let [{:keys [catalog schema]} (driver.conn/effective-details database)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database
     nil
     (fn [^Connection conn]
       (let [schemas (if schema
                       #{(describe-schema driver conn catalog schema)}
                       (all-schemas driver conn catalog))]
         {:tables (reduce set/union #{} schemas)})))))

(defmethod driver/describe-table :starburst
  [driver database {schema :schema, table-name :name}]
  (let [{:keys [catalog]} (driver.conn/effective-details database)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database
     nil
     (fn [^Connection conn]
       (with-open [stmt (.createStatement conn)]
         (let [sql (describe-table-sql driver catalog schema table-name)
               rs  (sql-jdbc.execute/execute-statement! driver stmt sql)]
           {:schema schema
            :name   table-name
            :fields (into
                     #{}
                     (map-indexed (fn [idx {:keys [column type] :as _col}]
                                    {:name              column
                                     :database-type     type
                                     :base-type         (starburst-type->base-type type)
                                     :database-position idx}))
                     (jdbc/reducible-result-set rs {}))}))))))

(defmethod driver/db-default-timezone :starburst
  [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   database
   nil
   (fn [^Connection conn]
     (with-open [stmt (.createStatement conn)]
       (let [rs (sql-jdbc.execute/execute-statement! driver stmt "SELECT current_timezone() as \"time-zone\"")
             [{:keys [time-zone]}] (jdbc/result-set-seq rs)]
         time-zone)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Execute                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- pooled-conn->starburst-conn
  "Unwraps the C3P0 `pooled-conn` and returns the underlying `TrinoConnection` it holds."
  ^TrinoConnection [^C3P0ProxyConnection pooled-conn]
  (.unwrap pooled-conn TrinoConnection))

(defn- rs->starburst-conn
  "Returns the `TrinoConnection` associated with the given `ResultSet` `rs`."
  ^TrinoConnection [^ResultSet rs]
  (-> (.. rs getStatement getConnection)
      pooled-conn->starburst-conn))

(defmethod sql-jdbc.execute/do-with-connection-with-options :starburst
  [driver db-or-id-or-spec options f]
  (sql-jdbc.execute/do-with-resolved-connection
   driver
   db-or-id-or-spec
   options
   (fn [^java.sql.Connection conn]
     (when-let [db (cond
                  ;; id?
                     (integer? db-or-id-or-spec)
                     (driver-api/with-metadata-provider db-or-id-or-spec
                       (driver-api/database (driver-api/metadata-provider)))
                  ;; db?
                     (u/id db-or-id-or-spec)     db-or-id-or-spec
                  ;; otherwise it's a spec and we can't get the db
                     :else nil)]
       (sql-jdbc.execute/set-role-if-supported! driver conn db))
     (try
       (sql-jdbc.execute/set-best-transaction-level! driver conn)
       (let [underlying-conn (pooled-conn->starburst-conn conn)]
         (when-not (str/blank? (get options :session-timezone))
            ;; set session time zone if defined
           (.setTimeZoneId underlying-conn (get options :session-timezone))))
       (try
         (.setReadOnly conn true)
         (catch Throwable e
           (log/warn e "Error setting starburst connection to read-only")))
          ;; as with statement and prepared-statement, cannot set holdability on the connection level
       conn
       (catch Throwable e
         (.close conn)
         (throw e)))
     (f conn))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Reading Columns from Result Set                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.execute/read-column-thunk [:starburst Types/TIMESTAMP]
  [_ ^ResultSet rset _ ^Integer i]
  ;; "Attempts to convert Timestamp to OffsetDateTime with UTC if possible.
  (let [zone     (.getTimeZoneId (rs->starburst-conn rset))]
    (fn []
      (when-let [s (.getString rset i)]
        (when-let [t (u.date/parse s)]
          (cond
            (or (instance? OffsetDateTime t)
                (instance? ZonedDateTime t))
            (-> (t/offset-date-time t)
              ;; tests are expecting this to be in the UTC offset, so convert to UTC
                (t/with-offset-same-instant (t/zone-offset 0)))

            ;; starburst returns local results already adjusted to session time zone offset for us, e.g.
            ;; '2021-06-15T00:00:00' becomes '2021-06-15T07:00:00' if the session timezone is US/Pacific. Undo the
            ;; madness and convert back to UTC
            zone
            (t/local-date-time t)
            :else
            t))))))

(defn- sql-time->local-time
  "Converts the given instance of `java.sql.Time` into a `java.time.LocalTime`, including milliseconds. Needed for
  similar reasons as `set-time-param` above."
  ^LocalTime [^Time sql-time]
  ;; Java 11 adds a simpler `ofInstant` method, but since we need to run on JDK 8, we can't use it
  ;; https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/time/LocalTime.html#ofInstant(java.time.Instant,java.time.ZoneId)
  (let [^LocalTime lt (t/local-time sql-time)
        ^Long millis  (mod (.getTime sql-time) 1000)]
    (.with lt ChronoField/MILLI_OF_SECOND millis)))

(defmethod sql-jdbc.execute/read-column-thunk [:starburst Types/TIME]
  [_ ^ResultSet rs ^ResultSetMetaData rs-meta ^Integer i]
  ;; When reading Time column, if base type is 'time with time zone', shift to UTC. Otherwise, just return local time.
  (let [type-name  (.getColumnTypeName rs-meta i)
        base-type  (starburst-type->base-type type-name)
        with-tz?   (isa? base-type :type/TimeWithTZ)]
    (fn []
      (when-let [sql-time (.getTime rs i)]
        (let [local-time (sql-time->local-time sql-time)]
          ;; for both `time` and `time with time zone`, the JDBC type reported by the driver is `Types/TIME`, hence
          ;; we also need to check the column type name to differentiate between them here
          (if with-tz?
            ;; even though this value is a `LocalTime`, the base-type is time with time zone, so we need to shift it back to
            ;; the UTC (0) offset
            (t/offset-time
             local-time
             (t/zone-offset 0))
            ;; else the base-type is time without time zone, so just return the local-time value
            local-time))))))

(defmethod sql-jdbc.execute/read-column-thunk [:starburst Types/TIMESTAMP_WITH_TIMEZONE]
  [_ ^ResultSet rset _ ^long i]
  ;; Converts TIMESTAMP_WITH_TIMEZONE to java.time.ZonedDateTime, then to OffsetDateTime with UTC time zone
  (fn []
    (let [zonedDateTime ^java.time.ZonedDateTime (.getObject rset i java.time.ZonedDateTime)
          utcTimeZone (java.time.ZoneId/of "UTC")]
      (cond
        (nil? zonedDateTime) nil
        :else (.toOffsetDateTime (.withZoneSameInstant zonedDateTime utcTimeZone))))))

(defmethod sql-jdbc.execute/read-column-thunk [:starburst Types/TIME_WITH_TIMEZONE]
  [_ ^ResultSet rs _ ^Integer i]
  ;; Converts TIME_WITH_TIMEZONE to local-time, then to OffsetTime with default time zone.
  (fn []
    (when-let [sql-time ^java.sql.Time (.getTime rs i)]
      (let [local-time (sql-time->local-time sql-time)]
        (t/offset-time
         local-time
         (t/zone-offset 0))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          SQL Statement Operations                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

; Metabase tests require a specific error when an invalid number of parameters are passed
(defn- handle-execution-error
  [^Exception e]
  (let [message (.getMessage e)]
    (cond
      (str/includes? message "Expecting: 'USING'")
      (throw (Exception. (str message ". If the database has the \"Optimized prepared statements\" option on, it require Starburst Galaxy, Starburst Enterprise (version 420-e or higher), or starburst (version 418 or higher)")))
      (str/includes? message "Incorrect number of parameters")
      (throw (Exception. "It looks like we got more parameters than we can handle, remember that parameters cannot be used in comments or as identifiers."))
      :else (throw e))))

; Optimized prepared statement where a proxy is generated and set-parameters! called on that proxy.
; Metabase is sometimes calling getParametersMetaData() on the prepared statement in order to count
; the number of parameters and verify they are correct with what is expected
; This unfortunately defeats the purpose of using EXECUTE IMMEDIATE as it forces the JDBC driver
; to call an explicit PREPARE. However this call is optional, so the solution is to create a proxy
; which defines all methods used by Metabase *except* for metadata methods. When Metabase tries
; to count the number of parameters:
; - The proxy issues an exception as getParametersMetaData() is not defined
; - Metabase catches the exception and does not perform the check
; - An invalid query is sent to starburst, which fails with a "Incorrect number of parameters" message
; - This message is caught by the driver and replaced with the exact same Metabase message
; In the end, the exact same message is presented to the user when the number of arguments is
; incorrect except we now execute the query to display the error message
(defn- proxy-optimized-prepared-statement
  [driver ^Connection _conn ^PreparedStatement stmt params]
  (let [ps (proxy [java.sql.PreparedStatement] []
             (executeQuery []
               (try
                 (.executeQuery stmt)
                 (catch Throwable e (handle-execution-error e))))
             (execute []
               (try
                 (.execute stmt)
                 (catch Throwable e (handle-execution-error e))))
             (setMaxRows [nb] (.setMaxRows stmt nb))
             (setObject
               ([index obj] (.setObject stmt index obj))
               ([^Integer index obj sql-type]
                (if (int? sql-type)
                  (.setObject stmt index obj ^Integer sql-type)
                  (.setObject stmt index obj ^SQLType sql-type))))
             (setTime
               ([index val] (.setTime stmt index val))
               ([index val cal] (.setTime stmt index val cal)))
             (setTimestamp
               ([index val] (.setTimestamp stmt index val))
               ([index val cal] (.setTimestamp stmt index val cal)))
             (setDate
               ([index val] (.setDate stmt index val))
               ([index val cal] (.setDate stmt index val cal)))
             (setArray [index val] (.setArray stmt index val))
             (setBoolean [index val] (.setBoolean stmt index val))
             (setByte [index val] (.setByte stmt index val))
             (setBytes [index val] (.setBytes stmt index val))
             (setInt [index val] (.setInt stmt index val))
             (setShort [index val] (.setShort stmt index val))
             (setLong [index val] (.setLong stmt index val))
             (setFloat [index val] (.setFloat stmt index val))
             (setDouble [index val] (.setDouble stmt index val))
             (cancel [] (.cancel stmt))
             (close [] (.close stmt))
             (isClosed [] (.isClosed stmt)))]
    (sql-jdbc.execute/set-parameters! driver ps params)
    ps))

; Default prepared statement where set-parameters! is called before generating the proxy
(defn- proxy-prepared-statement
  [driver ^Connection _conn ^PreparedStatement stmt params]
  (sql-jdbc.execute/set-parameters! driver stmt params)
  (proxy [java.sql.PreparedStatement] []
    (executeQuery []
      (try
        (.executeQuery stmt)
        (catch Throwable e (handle-execution-error e))))
    (execute []
      (try
        (.execute stmt)
        (catch Throwable e (handle-execution-error e))))
    (setMaxRows [nb] (.setMaxRows stmt nb))
    (cancel [] (.cancel stmt))
    (close [] (.close stmt))
    (isClosed [] (.isClosed stmt))))

(defmethod sql-jdbc.execute/prepared-statement :starburst
  [driver ^Connection conn ^String sql params]
  ;; with starburst driver, result set holdability must be HOLD_CURSORS_OVER_COMMIT
  ;; defining this method simply to omit setting the holdability
  (let [stmt (.prepareStatement conn
                                sql
                                ResultSet/TYPE_FORWARD_ONLY
                                ResultSet/CONCUR_READ_ONLY)]
    (try
      (try
        (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
        (catch Throwable e
          (log/debug e "Error setting prepared statement fetch direction to FETCH_FORWARD")))
      (if (.useExplicitPrepare ^TrinoConnection (.unwrap conn TrinoConnection))
        (proxy-prepared-statement driver conn stmt params)
        (proxy-optimized-prepared-statement driver conn stmt params))
      (catch Throwable e
        (.close stmt)
        (throw e)))))

(defmethod sql-jdbc.execute/statement :starburst
  [_ ^Connection conn]
  ;; and similarly for statement (do not set holdability)
  (let [stmt (.createStatement conn
                               ResultSet/TYPE_FORWARD_ONLY
                               ResultSet/CONCUR_READ_ONLY)]
    (try
      (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
      (catch Throwable e
        (log/debug e "Error setting statement fetch direction to FETCH_FORWARD")))
    (proxy [java.sql.Statement] []
      (execute [sql]
        (try
          (let [rs (.execute stmt sql)]
            rs)
          (catch Throwable e (handle-execution-error e))))
      (getResultSet [] (.getResultSet stmt))
      (setMaxRows [nb] (.setMaxRows stmt nb))
      (cancel [] (.cancel stmt))
      (close [] (.close stmt))
      (isClosed [] (.isClosed stmt)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Prepared Statement Substitutions                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- date-time->substitution [ts-str]
  (sql.params.substitution/make-stmt-subs "from_iso8601_timestamp(?)" [ts-str]))

(defmethod sql.params.substitution/->prepared-substitution [:starburst ZonedDateTime]
  [_ ^ZonedDateTime t]
  ;; for native query parameter substitution, in order to not conflict with the `TrinoConnection` session time zone
  ;; (which was set via report time zone), it is necessary to use the `from_iso8601_timestamp` function on the string
  ;; representation of the `ZonedDateTime` instance, but converted to the report time zone
  ;_(date-time->substitution (.format (t/offset-date-time (t/local-date-time t) (t/zone-offset 0)) DateTimeFormatter/ISO_OFFSET_DATE_TIME))
  (let [report-zone       (driver-api/report-timezone-id-if-supported :starburst (driver-api/database (driver-api/metadata-provider)))
        ^ZonedDateTime ts (if (str/blank? report-zone) t (t/with-zone-same-instant t (t/zone-id report-zone)))]
    ;; the `from_iso8601_timestamp` only accepts timestamps with an offset (not a zone ID), so only format with offset
    (date-time->substitution (.format ts DateTimeFormatter/ISO_OFFSET_DATE_TIME))))

(defmethod sql.params.substitution/->prepared-substitution [:starburst LocalDateTime]
  [_ ^LocalDateTime t]
  ;; similar to above implementation, but for `LocalDateTime`
  ;; when starburst parses this, it will account for session (report) time zone
  (date-time->substitution (.format t DateTimeFormatter/ISO_LOCAL_DATE_TIME)))

(defmethod sql.params.substitution/->prepared-substitution [:starburst OffsetDateTime]
  [_ ^OffsetDateTime t]
  ;; similar to above implementation, but for `ZonedDateTime`
  ;; when starburst parses this, it will account for session (report) time zone
  (date-time->substitution (.format t DateTimeFormatter/ISO_OFFSET_DATE_TIME)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Prepared Statement Set Parameters                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- set-time-param
  "Converts the given instance of `java.time.temporal`, assumed to be a time (either `LocalTime` or `OffsetTime`)
  into a `java.sql.Time`, including milliseconds, and sets the result as a parameter of the `PreparedStatement` `ps`
  at index `i`."
  [^PreparedStatement ps ^Integer i ^Temporal t]
  ;; for some reason, `java-time` can't handle passing millis to java.sql.Time, so this is the most straightforward way
  ;; I could find to do it
  ;; reported as https://github.com/dm3/clojure.java-time/issues/74
  (let [millis-of-day (.get t ChronoField/MILLI_OF_DAY)]
    (.setTime ps i (Time. millis-of-day))))

(defmethod sql-jdbc.execute/set-parameter [:starburst OffsetTime]
  [_ ^PreparedStatement ps ^Integer i t]
  ;; Convert OffsetTime to UTC, then set time param
  ;; necessary because `starburstPreparedStatement` does not implement the `setTime` overload having the final `Calendar`
  ;; param
  (let [adjusted-tz (t/with-offset-same-instant t (t/zone-offset 0))]
    (set-time-param ps i adjusted-tz)))

(defmethod sql-jdbc.execute/set-parameter [:starburst LocalTime]
  [_ ^PreparedStatement ps ^Integer i t]
  ;; same rationale as above
  (set-time-param ps i t))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Connectivity                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- db-name
  "Creates a \"DB name\" for the given catalog `c` and (optional) schema `s`.  If both are specified, a slash is
  used to separate them.  See examples at:
  https://trino.io/docs/current/installation/jdbc.html#connecting"
  [c s]
  (cond
    (str/blank? c)
    ""

    (str/blank? s)
    c

    :else
    (str c "/" s)))

;;; Kerberos related definitions
(def ^:private ^:const kerb-props->url-param-names
  {:kerberos-principal "KerberosPrincipal"
   :kerberos-remote-service-name "KerberosRemoteServiceName"
   :kerberos-use-canonical-hostname "KerberosUseCanonicalHostname"
   :kerberos-credential-cache-path "KerberosCredentialCachePath"
   :kerberos-keytab-path "KerberosKeytabPath"
   :kerberos-service-principal-pattern "KerberosServicePrincipalPattern"
   :kerberos-config-path "KerberosConfigPath"
   :kerberos-delegation "KerberosDelegation"})

(defn- details->kerberos-url-params [details]
  (let [remove-blank-vals (fn [m] (into {} (remove (comp str/blank? val) m)))
        ks                (keys kerb-props->url-param-names)]
    (-> (select-keys details ks)
        remove-blank-vals
        (set/rename-keys kerb-props->url-param-names))))

(defn- prepare-roles [{:keys [roles] :as details}]
  (if (str/blank? roles)
    (dissoc details :roles)
    (assoc details :roles (str "system:" roles))))

(defn- prepare-addl-opts [{:keys [SSL kerberos additional-options] :as details}]
  (let [det (if kerberos
              (if-not SSL
                (throw (ex-info (trs "SSL must be enabled to use Kerberos authentication")
                                {:db-details details}))
                (update details
                        :additional-options
                        str
                        ;; add separator if there are already additional-options
                        (when-not (str/blank? additional-options) "&")
                        ;; convert Kerberos options map to URL string
                        (sql-jdbc.common/additional-opts->string :url (details->kerberos-url-params details))))
              details)]
    ;; in any case, remove the standalone Kerberos properties from details map
    (apply dissoc (cons det (keys kerb-props->url-param-names)))))

(defn- jdbc-spec
  "Creates a spec for `clojure.java.jdbc` to use for connecting to starburst via JDBC, from the given `opts`."
  [{:keys [host port catalog schema]
    :or   {host "localhost", port 8080, catalog ""}
    :as   details}]
  (-> details
      (merge {:classname   "io.trino.jdbc.TrinoDriver"
              :subprotocol "trino"
              :subname     (driver-api/make-subname host port (db-name catalog schema))})
      prepare-addl-opts
      prepare-roles
      (dissoc :host :port :db :catalog :schema :tunnel-enabled :engine :kerberos)
      sql-jdbc.common/handle-additional-options))

(defn- str->bool [v]
  (if (string? v)
    (Boolean/parseBoolean v)
    v))

(defn- bool->str [v]
  (if (boolean? v)
    (str v)
    v))

(defmethod sql-jdbc.conn/connection-details->spec :starburst
  [_ details-map]
  (let [props (-> details-map
                  (update :port (fn [port]
                                  (if (string? port)
                                    (Integer/parseInt port)
                                    port)))
                  (update :ssl str->bool)
                  (update :kerberos str->bool)
                  (update :kerberos-delegation bool->str)
                  (assoc :SSL (:ssl details-map))
                  (assoc :source (format
                                  "Metabase %s [%s]"
                                  (:tag driver-api/mb-version-info "")
                                  driver-api/local-process-uuid))
                  (cond-> (:prepared-optimized details-map) (assoc :explicitPrepare "false"))

                  ;; remove any Metabase specific properties that are not recognized by the starburst JDBC driver, which is
                  ;; very picky about properties (throwing an error if any are unrecognized)
                  ;; all valid properties can be found in the JDBC Driver source here:
                  ;; https://trino.io/docs/current/installation/jdbc.html#parameter-reference
                  (select-keys (concat
                                [:host :port :catalog :schema :additional-options ; needed for `jdbc-spec`
                                 ;; JDBC driver specific properties
                                 :kerberos ; we need our boolean property indicating if Kerberos is enabled, but the rest of them come from `kerb-props->url-param-names` (below)
                                 :user :password :sessionUser :socksProxy :httpProxy :clientInfo :clientTags :traceToken
                                 :source :applicationNamePrefix ::accessToken :SSL :SSLVerification :SSLKeyStorePath
                                 :SSLKeyStorePassword :SSLKeyStoreType :SSLTrustStorePath :SSLTrustStorePassword :SSLTrustStoreType :SSLUseSystemTrustStore
                                 :extraCredentials :roles :sessionProperties :externalAuthentication :externalAuthenticationTokenCache :disableCompression
                                 :explicitPrepare :assumeLiteralNamesInMetadataCallsForNonConformingClients]
                                (keys kerb-props->url-param-names))))]
    (jdbc-spec props)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Inline                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/inline-value [:starburst String]
  [_ ^String s]
  (str \' (sql.u/escape-sql s :ansi) \'))

(defmethod sql.qp/inline-value [:starburst Time]
  [driver t]
  ;; This is only needed for test purposes, because some of the sample data still uses legacy types
  ;; Convert time to Local time, then inline
  (sql.qp/inline-value driver (t/local-time t)))

(defmethod sql.qp/inline-value [:starburst OffsetDateTime]
  [_ t]
  (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-offset t)))

(defmethod sql.qp/inline-value [:starburst ZonedDateTime]
  [_ t]
  (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-id t)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Driver Helpers                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/db-start-of-week :starburst
  [_]
  :monday)

(defmethod driver.sql/default-database-role :starburst
  [_driver database]
  (:user (driver.conn/effective-details database)))

(defmethod driver/set-role! :starburst
  [_driver ^Connection conn role]
  (.setSessionUser ^TrinoConnection (.unwrap conn TrinoConnection) role))

(defmethod sql.qp/->honeysql [:starburst ::sql.qp/cast-to-text]
  [driver [_ expr]]
  (sql.qp/->honeysql driver [::sql.qp/cast expr "varchar"]))
