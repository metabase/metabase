(ns metabase.driver.snowflake
  "Snowflake Driver."
  (:require
   [buddy.core.codecs :as codecs]
   [cheshire.core :as json]
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.common :as sql-jdbc.sync.common]
   [metabase.driver.sql-jdbc.sync.describe-table
    :as sql-jdbc.describe-table]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.sql.util.unprepare :as unprepare]
   [metabase.driver.sync :as driver.s]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.secret :as secret]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.query-processor.util :as qp.util]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [ring.util.codec :as codec])
  (:import
   (java.io File)
   (java.sql Connection DatabaseMetaData ResultSet Types)
   (java.time OffsetDateTime OffsetTime ZonedDateTime)))

(set! *warn-on-reflection* true)

(driver/register! :snowflake, :parent #{:sql-jdbc ::sql-jdbc.legacy/use-legacy-classes-for-read-and-set})

(doseq [[feature supported?] {:datetime-diff                          true
                              :now                                    true
                              :convert-timezone                       true
                              :connection-impersonation               true
                              :connection-impersonation-requires-role true}]
  (defmethod driver/database-supports? [:snowflake feature] [_driver _feature _db] supported?))

(defmethod driver/humanize-connection-error-message :snowflake
  [_ message]
  (log/spy :error (type message))
  (condp re-matches message
    #"(?s).*Object does not exist.*$"
    :database-name-incorrect

    ; default - the Snowflake errors have a \n in them
    message))

(defmethod driver/db-start-of-week :snowflake
  [_]
  :sunday)

(defn- start-of-week-setting->snowflake-offset
  "Value to use for the `WEEK_START` connection parameter -- see
  https://docs.snowflake.com/en/sql-reference/parameters.html#label-week-start -- based on
  the [[metabase.public-settings/start-of-week]] Setting. Snowflake considers `:monday` to be `1`, through `:sunday`
  as `7`."
  []
  (inc (driver.common/start-of-week->int)))

(defn- handle-conn-uri [details user account private-key-file]
  (let [existing-conn-uri (or (:connection-uri details)
                              (format "jdbc:snowflake://%s.snowflakecomputing.com" account))
        opts-str (sql-jdbc.common/additional-opts->string :url
                                                          {:user (codec/url-encode user)
                                                           :private_key_file (codec/url-encode (.getCanonicalPath ^File private-key-file))})
        new-conn-uri (sql-jdbc.common/conn-str-with-additional-opts existing-conn-uri :url opts-str)]
    (-> details
        (assoc :connection-uri new-conn-uri)
        ;; The Snowflake driver uses the :account property, but we need to drop the region from it first
        (assoc :account (first (str/split account #"\."))))))

(defn- resolve-private-key
  "Convert the private-key secret properties into a private_key_file property in `details`.
  Setting the Snowflake driver property privatekey would be easier, but that doesn't work
  because clojure.java.jdbc (properly) converts the property values into strings while the
  Snowflake driver expects a java.security.PrivateKey instance."
  [{:keys [user password account private-key-path]
    :as   details}]
  (let [base-details (apply dissoc details (vals (secret/get-sub-props "private-key")))]
    (cond
      password
      details

      private-key-path
      (let [secret-map       (secret/db-details-prop->secret-map details "private-key")
            private-key-file (when (some? (:value secret-map))
                               (secret/value->file! secret-map :snowflake))]
        (cond-> base-details
          private-key-file (handle-conn-uri user account private-key-file)))

      :else
      ;; get-secret-string should get the right value (using private-key-value or private-key-id) and decode it automatically
      (let [decoded (secret/get-secret-string details "private-key")
            file    (secret/value->file! {:connection-property-name "private-key-file"
                                          :value                    decoded})]
        (assoc (handle-conn-uri base-details user account file)
               :private_key_file file)))))

(defmethod sql-jdbc.conn/connection-details->spec :snowflake
  [_ {:keys [account additional-options], :as details}]
  (when (get "week_start" (sql-jdbc.common/additional-options->map additional-options :url))
    (log/warn (trs "You should not set WEEK_START in Snowflake connection options; this might lead to incorrect results. Set the Start of Week Setting instead.")))
  (let [upcase-not-nil (fn [s] (when s (u/upper-case-en s)))]
    ;; it appears to be the case that their JDBC driver ignores `db` -- see my bug report at
    ;; https://support.snowflake.net/s/question/0D50Z00008WTOMCSA5/
    (-> (merge {:classname                                  "net.snowflake.client.jdbc.SnowflakeDriver"
                :subprotocol                                "snowflake"
                :subname                                    (str "//" account ".snowflakecomputing.com/")
                :client_metadata_request_use_connection_ctx true
                :ssl                                        true
                ;; keep open connections open indefinitely instead of closing them. See #9674 and
                ;; https://docs.snowflake.net/manuals/sql-reference/parameters.html#client-session-keep-alive
                :client_session_keep_alive                  true
                ;; other SESSION parameters
                ;; not 100% sure why we need to do this but if we don't set the connection to UTC our report timezone
                ;; stuff doesn't work, even though we ultimately override this when we set the session timezone
                :timezone                                   "UTC"
                ;; tell Snowflake to use the same start of week that we have set for the
                ;; [[metabase.public-settings/start-of-week]] Setting.
                :week_start                                 (start-of-week-setting->snowflake-offset)}
               (-> details
                   ;; original version of the Snowflake driver incorrectly used `dbname` in the details fields instead
                   ;; of `db`. If we run across `dbname`, correct our behavior
                   (set/rename-keys {:dbname :db})
                   ;; see https://github.com/metabase/metabase/issues/9511
                   (update :warehouse upcase-not-nil)
                   (update :schema upcase-not-nil)
                   resolve-private-key
                   (dissoc :host :port :timezone)))
        (sql-jdbc.common/handle-additional-options details))))

(defmethod sql-jdbc.sync/database-type->base-type :snowflake
  [_ base-type]
  ({:NUMBER                     :type/Number
    :DECIMAL                    :type/Decimal
    :NUMERIC                    :type/Number
    :INT                        :type/Integer
    :INTEGER                    :type/Integer
    :BIGINT                     :type/BigInteger
    :SMALLINT                   :type/Integer
    :TINYINT                    :type/Integer
    :BYTEINT                    :type/Integer
    :FLOAT                      :type/Float
    :FLOAT4                     :type/Float
    :FLOAT8                     :type/Float
    :DOUBLE                     :type/Float
    (keyword "DOUBLE PRECISON") :type/Float
    :REAL                       :type/Float
    :VARCHAR                    :type/Text
    :CHAR                       :type/Text
    :CHARACTER                  :type/Text
    :STRING                     :type/Text
    :TEXT                       :type/Text
    :GEOGRAPHY                  :type/SerializedJSON
    :BINARY                     :type/*
    :VARBINARY                  :type/*
    :BOOLEAN                    :type/Boolean
    :DATE                       :type/Date
    :DATETIME                   :type/DateTime
    :TIME                       :type/Time
    :TIMESTAMP                  :type/DateTime
    :TIMESTAMPLTZ               :type/DateTime
    :TIMESTAMPNTZ               :type/DateTime
    :TIMESTAMPTZ                :type/DateTimeWithTZ
    :VARIANT                    :type/*
    ;; Maybe also type *
    :OBJECT                     :type/Dictionary
    :ARRAY                      :type/*} base-type))

(defmethod sql.qp/honey-sql-version :snowflake
  [_driver]
  2)

(defmethod sql.qp/unix-timestamp->honeysql [:snowflake :seconds]      [_ _ expr] [:to_timestamp expr])
(defmethod sql.qp/unix-timestamp->honeysql [:snowflake :milliseconds] [_ _ expr] [:to_timestamp expr 3])
(defmethod sql.qp/unix-timestamp->honeysql [:snowflake :microseconds] [_ _ expr] [:to_timestamp expr 6])

(defmethod sql.qp/current-datetime-honeysql-form :snowflake
  [_]
  (h2x/with-database-type-info :%current_timestamp :TIMESTAMPTZ))

(defmethod sql.qp/add-interval-honeysql-form :snowflake
  [_ hsql-form amount unit]
  [:dateadd
   [:raw (name unit)]
   [:raw (int amount)]
   (h2x/->timestamp hsql-form)])

(defn- extract
  [unit expr]
  (-> [:date_part unit (h2x/->timestamp expr)]
      (h2x/with-database-type-info "integer")))

(defn- date-trunc
  [unit expr]
  (-> [:date_trunc unit expr]
      (h2x/with-database-type-info (h2x/database-type expr))))

(defmethod sql.qp/date [:snowflake :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:snowflake :minute]          [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:snowflake :minute-of-hour]  [_ _ expr] (extract :minute expr))
(defmethod sql.qp/date [:snowflake :hour]            [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:snowflake :hour-of-day]     [_ _ expr] (extract :hour expr))
(defmethod sql.qp/date [:snowflake :day]             [_ _ expr] (date-trunc :day expr))
(defmethod sql.qp/date [:snowflake :day-of-month]    [_ _ expr] (extract :day expr))
(defmethod sql.qp/date [:snowflake :day-of-year]     [_ _ expr] (extract :dayofyear expr))
(defmethod sql.qp/date [:snowflake :month]           [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:snowflake :month-of-year]   [_ _ expr] (extract :month expr))
(defmethod sql.qp/date [:snowflake :quarter]         [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:snowflake :quarter-of-year] [_ _ expr] (extract :quarter expr))
(defmethod sql.qp/date [:snowflake :year]            [_ _ expr] (date-trunc :year expr))

;; these don't need to be adjusted for start of week, since we're Setting the WEEK_START connection parameter
(defmethod sql.qp/date [:snowflake :week]
  [_driver _unit expr]
  (date-trunc :week expr))

(defmethod sql.qp/date [:snowflake :week-of-year-iso]
  [_ _ expr]
  (extract :weekiso expr))

(defmethod sql.qp/date [:snowflake :week-of-year-us]
  [driver _ expr]
  ;; TODO: probably not hard to figure this out
  ;; we don't support it at the moment because the implementation in (defmethod date [:sql :week-of-year-us])
  ;; relies on the ability to dynamicall change `start-of-week` setting, but with snowflake we set the
  ;; start-of-week in connection session instead of manipulate in MBQL
  (throw (ex-info (tru "sqlite doesn't support extract us week")
          {:driver driver
           :form   expr
           :type   qp.error-type/invalid-query})))

(defmethod sql.qp/date [:snowflake :day-of-week]
  [_driver _unit expr]
  (extract :dayofweek expr))

(defn- time-zoned-datediff
  "Same as snowflake's `datediff` but converts the args to the results time zone
   before calculating date boundaries. This is needed when an argument could be of
   timestamptz type and the unit is day, week, month, quarter or year."
  [unit x y]
  (let [x (if (h2x/is-of-type? x "timestamptz")
            [:convert_timezone (qp.timezone/results-timezone-id) x]
            x)
        y (if (h2x/is-of-type? y "timestamptz")
            [:convert_timezone (qp.timezone/results-timezone-id) y]
            y)]
    [:datediff [:raw (name unit)] x y]))

(defn- time-zoned-extract
  "Same as `extract` but converts the arg to the results time zone if it's a timestamptz."
  [unit x]
  (let [x (if (h2x/is-of-type? x "timestamptz")
            [:convert_timezone (qp.timezone/results-timezone-id) x]
            x)]
    (extract unit x)))

(defn- sub-day-datediff
  "Same as snowflake's `datediff`, but accurate to the millisecond for sub-day units."
  [unit x y]
  (let [milliseconds [:datediff [:raw "milliseconds"] x y]]
    ;; millseconds needs to be cast to float because division rounds incorrectly with large integers
    [:trunc (h2x// (h2x/cast :float milliseconds)
                   (case unit :hour 3600000 :minute 60000 :second 1000))]))

(defmethod sql.qp/datetime-diff [:snowflake :year]
  [driver _unit x y]
  [:trunc (h2x// (sql.qp/datetime-diff driver :month x y) 12)])

(defmethod sql.qp/datetime-diff [:snowflake :quarter]
  [driver _unit x y]
  [:trunc (h2x// (sql.qp/datetime-diff driver :month x y) 3)])

(defmethod sql.qp/datetime-diff [:snowflake :month]
  [_driver _unit x y]
  (h2x/+ (time-zoned-datediff :month x y)
         ;; datediff counts month boundaries not whole months, so we need to adjust
         ;; if x<y but x>y in the month calendar then subtract one month
         ;; if x>y but x<y in the month calendar then add one month
         [:case
          [:and
           [:< x y]
           [:> (time-zoned-extract :day x) (time-zoned-extract :day y)]]
          -1

          [:and
           [:> x y]
           [:< (time-zoned-extract :day x) (time-zoned-extract :day y)]]
          1

          :else
          0]))

(defmethod sql.qp/datetime-diff [:snowflake :week]
  [_driver _unit x y]
  [:trunc (h2x// (time-zoned-datediff :day x y) 7)])

(defmethod sql.qp/datetime-diff [:snowflake :day]
  [_driver _unit x y]
  (time-zoned-datediff :day x y))

(defmethod sql.qp/datetime-diff [:snowflake :hour] [_driver _unit x y] (sub-day-datediff :hour x y))
(defmethod sql.qp/datetime-diff [:snowflake :minute] [_driver _unit x y] (sub-day-datediff :minute x y))
(defmethod sql.qp/datetime-diff [:snowflake :second] [_driver _unit x y] (sub-day-datediff :second x y))

(defmethod sql.qp/->honeysql [:snowflake :regex-match-first]
  [driver [_ arg pattern]]
  [:regexp_substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)])

(defmethod sql.qp/->honeysql [:snowflake :median]
  [driver [_ arg]]
  (sql.qp/->honeysql driver [:percentile arg 0.5]))

(defn- db-name
  "As mentioned above, old versions of the Snowflake driver used `details.dbname` to specify the physical database, but
  tests (and Snowflake itself) expected `details.db`. This has since been fixed, but for legacy support we'll still
  accept either. Throw an Exception if neither key can be found."
  {:arglists '([database])}
  [{details :details}]
  (or (:db details)
      (:dbname details)
      (throw (Exception. (tru "Invalid Snowflake connection details: missing DB name.")))))

(defn- query-db-name []
  ;; the store is always initialized when running QP queries; for some stuff like the test extensions DDL statements
  ;; it won't be, *but* they should already be qualified by database name anyway
  (when (qp.store/initialized?)
    (db-name (lib.metadata/database (qp.store/metadata-provider)))))

;; unless we're currently using a table alias, we need to prepend Table and Field identifiers with the DB name for the
;; query
;;
;; Table & Field identifiers (usually) need to be qualified with the current database name; this needs to be part of the
;; table e.g.
;;
;;    "table"."field" -> "database"."table"."field"

;; This takes care of Table identifiers. We handle Field identifiers in the [[sql.qp/->honeysql]] method for `[:sql
;; :field]` below.
(defn- qualify-identifier [[_identifier identifier-type components, :as identifier]]
  {:pre [(h2x/identifier? identifier)]}
  (apply h2x/identifier identifier-type (query-db-name) components))

(defmethod sql.qp/->honeysql [:snowflake ::h2x/identifier]
  [_driver [_identifier identifier-type :as identifier]]
  (let [qualify? (and (seq (query-db-name))
                      (= identifier-type :table))]
    (cond-> identifier
      qualify? qualify-identifier)))

(defmethod sql.qp/->honeysql [:snowflake :field]
  [driver [_ _ {::add/keys [source-table]} :as field-clause]]
  (let [parent-method (get-method sql.qp/->honeysql [:sql :field])
        qualify?      (and
                       ;; `query-db-name` is not currently set, e.g. because we're generating DDL statements for tests
                       (seq (query-db-name))
                       ;; Only Qualify Field identifiers that are qualified by a Table. (e.g. don't qualify stuff
                       ;; inside `CREATE TABLE` DDL statements)
                       (integer? source-table))
        identifier (parent-method driver field-clause)]
    (cond-> identifier
      (and qualify? (h2x/identifier? identifier))
      qualify-identifier)))

(defmethod sql.qp/->honeysql [:snowflake :time]
  [driver [_ value _unit]]
  (h2x/->time (sql.qp/->honeysql driver value)))

(defmethod sql.qp/->honeysql [:snowflake :convert-timezone]
  [driver [_ arg target-timezone source-timezone]]
  (let [hsql-form    (sql.qp/->honeysql driver arg)
        timestamptz? (h2x/is-of-type? hsql-form "timestamptz")]
    (sql.u/validate-convert-timezone-args timestamptz? target-timezone source-timezone)
    (-> (if timestamptz?
          [:convert_timezone target-timezone hsql-form]
          [:to_timestamp_ntz
           [:convert_timezone (or source-timezone (qp.timezone/results-timezone-id)) target-timezone hsql-form]])
        (h2x/with-database-type-info "timestampntz"))))

(defmethod driver/table-rows-seq :snowflake
  [driver database table]
  (sql-jdbc/query driver database {:select [:*]
                                   :from   [[(qp.store/with-metadata-provider (u/the-id database)
                                               (sql.qp/with-driver-honey-sql-version driver
                                                 (sql.qp/->honeysql driver table)))]]}))

(defmethod driver/describe-database :snowflake
  [driver database]
  (let [db-name          (db-name database)
        excluded-schemas (set (sql-jdbc.sync/excluded-schemas driver))]
    (qp.store/with-metadata-provider (u/the-id database)
      (let [sql             (format "SHOW OBJECTS IN DATABASE \"%s\"" db-name)
            schema-patterns (driver.s/db-details->schema-filter-patterns "schema-filters" database)
            [inclusion-patterns exclusion-patterns] schema-patterns]
        (log/tracef "[Snowflake] %s" sql)
        (sql-jdbc.execute/do-with-connection-with-options
         driver
         database
         nil
         (fn [^Connection conn]
           {:tables (into
                     #{}
                     (comp (filter (fn [{schema :schema_name, table-name :name}]
                                     (and (not (contains? excluded-schemas schema))
                                          (driver.s/include-schema? inclusion-patterns
                                                                    exclusion-patterns
                                                                    schema)
                                          (sql-jdbc.sync/have-select-privilege? driver conn schema table-name))))
                           (map (fn [{schema :schema_name, table-name :name, remark :comment}]
                                  {:name        table-name
                                   :schema      schema
                                   :description (not-empty remark)})))
                     (try
                       (jdbc/reducible-query {:connection conn} sql)
                       (catch Throwable e
                         (throw (ex-info (trs "Error executing query: {0}" (ex-message e)) {:sql sql} e)))))}))))))

(defmethod driver/describe-table :snowflake
  [driver database table]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   database
   nil
   (fn [^Connection conn]
     (->> (assoc (select-keys table [:name :schema])
                 :fields (sql-jdbc.sync/describe-table-fields driver conn table (db-name database)))
          ;; find PKs and mark them
          (sql-jdbc.sync/add-table-pks driver conn (db-name database))))))

(defn- escape-name-for-metadata [entity-name]
  (when entity-name
    (str/replace entity-name "_" "\\_")))

(defmethod driver/escape-entity-name-for-metadata :snowflake
  [_ entity-name]
  (escape-name-for-metadata entity-name))

;; The Snowflake JDBC driver is buggy: schema and table name are interpreted as patterns
;; in getPrimaryKeys and getImportedKeys calls. When this bug gets fixed, the
;; [[sql-jdbc.describe-table/get-table-pks]] method and the [[describe-table-fks*]] and
;; [[describe-table-fks]] functions can be dropped and the call to [[describe-table-fks]]
;; can be replaced with a call to [[sql-jdbc.sync/describe-table-fks]]. See #26054 for
;; more context.
(defmethod sql-jdbc.describe-table/get-table-pks :snowflake
  [_driver ^Connection conn db-name-or-nil table]
  (let [^DatabaseMetaData metadata (.getMetaData conn)]
    (into [] (sql-jdbc.sync.common/reducible-results
              #(.getPrimaryKeys metadata db-name-or-nil
                                (-> table :schema escape-name-for-metadata)
                                (-> table :name escape-name-for-metadata))
              (fn [^ResultSet rs] #(.getString rs "COLUMN_NAME"))))))

(defn- describe-table-fks*
  "Stolen from [[sql-jdbc.describe-table]].
  The only change is that it escapes `schema` and `table-name`."
  [_driver ^Connection conn {^String schema :schema, ^String table-name :name} & [^String db-name-or-nil]]
  ;; Snowflake bug: schema and table name are interpreted as patterns
  (let [schema (escape-name-for-metadata schema)
        table-name (escape-name-for-metadata table-name)]
    (into
     #{}
     (sql-jdbc.sync.common/reducible-results #(.getImportedKeys (.getMetaData conn) db-name-or-nil schema table-name)
                                             (fn [^ResultSet rs]
                                               (fn []
                                                 {:fk-column-name   (.getString rs "FKCOLUMN_NAME")
                                                  :dest-table       {:name   (.getString rs "PKTABLE_NAME")
                                                                     :schema (.getString rs "PKTABLE_SCHEM")}
                                                  :dest-column-name (.getString rs "PKCOLUMN_NAME")}))))))

(defn- describe-table-fks
  "Stolen from [[sql-jdbc.describe-table]].
  The only change is that it calls the stolen function [[describe-table-fks*]]."
  [driver db-or-id-or-spec-or-conn table & [db-name-or-nil]]
  (if (instance? Connection db-or-id-or-spec-or-conn)
    (describe-table-fks* driver db-or-id-or-spec-or-conn table db-name-or-nil)
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     db-or-id-or-spec-or-conn
     nil
     (fn [conn]
       (describe-table-fks* driver conn table db-name-or-nil)))))

(defmethod driver/describe-table-fks :snowflake
  [driver database table]
  (describe-table-fks driver database table (db-name database)))

(defmethod sql.qp/current-datetime-honeysql-form :snowflake [_] :%current_timestamp)

(defmethod sql-jdbc.execute/set-timezone-sql :snowflake [_] "ALTER SESSION SET TIMEZONE = %s;")

(defmethod driver/db-default-timezone :snowflake
  [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver database nil
   (fn [^java.sql.Connection conn]
     (with-open [stmt (.prepareStatement conn "show parameters like 'TIMEZONE';")
                 rset (.executeQuery stmt)]
       (when (.next rset)
         (.getString rset "default"))))))

(defmethod sql-jdbc.sync/excluded-schemas :snowflake
  [_]
  #{"INFORMATION_SCHEMA"})

(defmethod driver/can-connect? :snowflake
  [driver {:keys [db], :as details}]
  (and ((get-method driver/can-connect? :sql-jdbc) driver details)
       (sql-jdbc.conn/with-connection-spec-for-testing-connection [spec [driver details]]
         ;; jdbc/query is used to see if we throw, we want to ignore the results
         (jdbc/query spec (format "SHOW OBJECTS IN DATABASE \"%s\";" db))
         true)))

(defmethod driver/normalize-db-details :snowflake
  [_ database]
  (if-not (str/blank? (-> database :details :regionid))
    (-> (update-in database [:details :account] #(str/join "." [% (-> database :details :regionid)]))
      (m/dissoc-in [:details :regionid]))
    database))

(defmethod unprepare/unprepare-value [:snowflake OffsetDateTime]
  [_ t]
  (format "'%s %s %s'::timestamp_tz" (t/local-date t) (t/local-time t) (t/zone-offset t)))

(defmethod unprepare/unprepare-value [:snowflake ZonedDateTime]
  [driver t]
  (unprepare/unprepare-value driver (t/offset-date-time t)))

(defmethod unprepare/unprepare-value [:snowflake OffsetTime]
  [driver t]
  (unprepare/unprepare-value driver (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))))

;; Like Vertica, Snowflake doesn't seem to be able to return a LocalTime/OffsetTime like everyone else, but it can
;; return a String that we can parse

(defmethod sql-jdbc.execute/read-column-thunk [:snowflake Types/TIMESTAMP_WITH_TIMEZONE]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [s (.getString rs i)]
      (let [t (u.date/parse s)]
        (log/tracef "(.getString rs %d) [TIMESTAMP_WITH_TIMEZONE] -> %s -> %s" i (pr-str s) (pr-str t))
        t))))

(defmethod sql-jdbc.execute/read-column-thunk [:snowflake Types/TIME]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [s (.getString rs i)]
      (let [t (u.date/parse s)]
        (log/tracef "(.getString rs %d) [TIME] -> %s -> %s" i (pr-str s) (pr-str t))
        t))))

(defmethod sql-jdbc.execute/read-column-thunk [:snowflake Types/TIME_WITH_TIMEZONE]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [s (.getString rs i)]
      (let [t (u.date/parse s)]
        (log/tracef "(.getString rs %d) [TIME_WITH_TIMEZONE] -> %s -> %s" i (pr-str s) (pr-str t))
        t))))

;; TODO ­ would it make more sense to use functions like `timestamp_tz_from_parts` directly instead of JDBC parameters?

;; Snowflake seems to ignore the calendar parameter of `.setTime` and `.setTimestamp` and instead uses the session
;; timezone; normalize temporal values to UTC so we end up with the right values
(defmethod sql-jdbc.execute/set-parameter [::use-legacy-classes-for-read-and-set java.time.OffsetTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/sql-time (t/with-offset-same-instant t (t/zone-offset 0)))))

(defmethod sql-jdbc.execute/set-parameter [::use-legacy-classes-for-read-and-set java.time.OffsetDateTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/sql-timestamp (t/with-offset-same-instant t (t/zone-offset 0)))))

(defmethod sql-jdbc.execute/set-parameter [:snowflake java.time.ZonedDateTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/sql-timestamp (t/with-zone-same-instant t (t/zone-id "UTC")))))

;;; --------------------------------------------------- Query remarks ---------------------------------------------------

;  Snowflake strips comments prepended to the SQL statement (default remark injection behavior). We should append the
;  remark instead.
(defmethod sql-jdbc.execute/inject-remark :snowflake
  [_ sql remark]
  (str sql "\n\n-- " remark))

(defmethod qp.util/query->remark :snowflake
  [_ {{:keys [context executed-by card-id pulse-id dashboard-id query-hash]} :info,
      query-type :type,
      database-id :database}]
  (json/generate-string {:client      "Metabase"
                         :context     context
                         :queryType   query-type
                         :userId      executed-by
                         :pulseId     pulse-id
                         :cardId      card-id
                         :dashboardId dashboard-id
                         :databaseId  database-id
                         :queryHash   (when (bytes? query-hash) (codecs/bytes->hex query-hash))
                         :serverId    (public-settings/site-uuid)}))

;;; ------------------------------------------------- User Impersonation --------------------------------------------------

(defmethod driver.sql/set-role-statement :snowflake
  [_ role]
  (let [special-chars-pattern #"[^a-zA-Z0-9_]"
        needs-quote           (re-find special-chars-pattern role)]
    (if needs-quote
      (format "USE ROLE \"%s\";" role)
      (format "USE ROLE %s;" role))))

(defmethod driver.sql/default-database-role :snowflake
  [_ database]
  (-> database :details :role))
