(ns metabase.driver.snowflake
  "Snowflake Driver."
  (:refer-clojure :exclude [select-keys not-empty get-in])
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql :as sql]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common :as driver.common]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.common :as sql-jdbc.sync.common]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [select-keys not-empty get-in]]
   [ring.util.codec :as codec])
  (:import
   (java.io File)
   (java.sql
    Connection
    DatabaseMetaData
    ResultSet
    Types)
   (java.time
    LocalDate
    LocalDateTime
    LocalTime
    OffsetDateTime
    OffsetTime
    ZonedDateTime)
   (java.util Properties)
   (net.snowflake.client.jdbc SnowflakeConnectString SnowflakeSQLException)))

(set! *warn-on-reflection* true)

(driver/register! :snowflake, :parent #{:sql-jdbc ::sql-jdbc.legacy/use-legacy-classes-for-read-and-set})

(doseq [[feature supported?] {:connection-impersonation               true
                              :connection-impersonation-requires-role true
                              :rename                                 true
                              :convert-timezone                       true
                              :datetime-diff                          true
                              :describe-fields                        false
                              :describe-default-expr                  true
                              ;; JDBC driver always provides "NO" for the IS_GENERATEDCOLUMN JDBC metadata
                              :describe-is-generated                  false
                              :describe-is-nullable                   true
                              :expression-literals                    true
                              :expressions/integer                    true
                              :expressions/text                       true
                              :expressions/float                      true
                              :expressions/date                       true
                              :identifiers-with-spaces                true
                              :split-part                             true
                              :collate                                true
                              :now                                    true
                              :database-routing                       true
                              :metadata/table-existence-check         true
                              :regex/lookaheads-and-lookbehinds       false
                              :transforms/python                      true
                              :transforms/table                       true
                              :workspace                              true}]
  (defmethod driver/database-supports? [:snowflake feature] [_driver _feature _db] supported?))

(defmethod driver/humanize-connection-error-message :snowflake
  [_ messages]
  (let [message (first messages)]
    (log/spy :error (type message))
    (condp re-matches message
      #"(?s).*Object does not exist.*$"
      :database-name-incorrect

      ; default - the Snowflake errors have a \n in them
      message)))

(defmethod driver/db-start-of-week :snowflake
  [_]
  :sunday)

(defmethod driver.sql/default-schema :snowflake
  [_]
  "PUBLIC")

(defn- start-of-week-setting->snowflake-offset
  "Value to use for the `WEEK_START` connection parameter -- see
  https://docs.snowflake.com/en/sql-reference/parameters.html#label-week-start -- based on
  the [[metabase.lib-be.core/start-of-week]] Setting. Snowflake considers `:monday` to be `1`, through `:sunday`
  as `7`."
  []
  (inc (driver.common/start-of-week->int)))

(defn- handle-conn-uri [details user account private-key-file]
  (let [existing-conn-uri (or (:connection-uri details)
                              (when-let [sub (:subname details)]
                                (format "jdbc:snowflake:%s" sub))
                              (format "jdbc:snowflake://%s.snowflakecomputing.com" account))
        opts-str (sql-jdbc.common/additional-opts->string :url
                                                          (cond-> {:user (codec/url-encode user)
                                                                   :private_key_file (codec/url-encode (.getCanonicalPath ^File private-key-file))}
                                                            (:db details)
                                                            (assoc :db (codec/url-encode (:db details)))))
        new-conn-uri (sql-jdbc.common/conn-str-with-additional-opts existing-conn-uri :url opts-str)]
    (-> details
        (assoc :connection-uri new-conn-uri)
        ;; The Snowflake driver uses the :account property, but we need to drop the region from it first (#30376 comment)
        (m/assoc-some :account (some-> account (str/split #"\.") first)))))

(defn- resolve-private-key
  "Convert the private-key secret properties into a private_key_file property in `details`.
  Setting the Snowflake driver property privatekey would be easier, but that doesn't work
  because clojure.java.jdbc (properly) converts the property values into strings while the
  Snowflake driver expects a java.security.PrivateKey instance."
  [{:keys [user password account]
    :as   details}]
  (if password
    details
    (if-let [private-key-file (driver-api/secret-value-as-file! :snowflake details "private-key")]
      (-> details
          (driver-api/clean-secret-properties-from-details :snowflake)
          (handle-conn-uri user account private-key-file)
          (assoc :private_key_file private-key-file))
      (driver-api/clean-secret-properties-from-details details :snowflake))))

(defn- quote-name
  [raw-name]
  (when raw-name
    (str "\"" (str/replace raw-name "\"" "\"\"") "\"")))

(defn connection-str->parameters
  "Get map of parameters from Snowflake `conn-str`, where keys are uppercase string parameter names and values
  are strings. Returns nil when string is invalid."
  [conn-str]
  (let [^SnowflakeConnectString conn-str* (SnowflakeConnectString/parse conn-str (Properties.))]
    (if-not (.isValid conn-str*)
      (log/warn "Invalid connection string.")
      (.getParameters conn-str*))))

(defn- maybe-add-role-to-spec-url
  "Maybe add role to `spec`'s `:connection-uri`. This is necessary for rsa auth to work, because at the time of writing
  Snowflake jdbc driver ignores `:role` connection property when `:connection-uri` (presumably containing
  private_key_file) is used."
  [spec details]
  (if (and (string? (not-empty (:connection-uri spec)))
           (string? (not-empty (:role details)))
           (not (contains? (connection-str->parameters (:connection-uri spec)) "ROLE")))
    (let [role-opts-str (sql-jdbc.common/additional-opts->string :url {:role (codec/url-encode (:role details))})]
      (-> spec
          (update :connection-uri sql-jdbc.common/conn-str-with-additional-opts :url role-opts-str)))
    spec))

(defmethod driver/db-details-to-test-and-migrate :snowflake
  [_ {:keys [password private-key-id private-key-value private-key-path use-password private-key-options] :as details}]
  (when-not (= 1 (count (remove nil? [password private-key-id private-key-value private-key-path])))
    (let [password-details (when password
                             (-> details
                                 ;; Setting private-key-value to nil will delete the secret
                                 (assoc :use-password true :private-key-value nil)
                                 (dissoc :private-key-id :private-key-path :private-key-options)
                                 ;; Add meta for testing
                                 (with-meta {:auth :password})))
          private-key-path-details (when private-key-path
                                     (-> details
                                         (assoc :use-password false :private-key-options "local")
                                         (dissoc :password :private-key-value)
                                         (with-meta {:auth :private-key-path})))
          private-key-value-details (when private-key-value
                                      (-> details
                                          (assoc :use-password false :private-key-options "uploaded")
                                          (dissoc :password :private-key-path)
                                          (with-meta {:auth :private-key-value})))
          private-key-id-details (when private-key-id
                                   (-> details
                                       (assoc :use-password false)
                                       (dissoc :password :private-key-value :private-key-path :private-key-options)
                                       (with-meta {:auth :private-key-id})))]
      (cond-> []
        (and use-password password-details)
        (conj password-details)

        (and (= "local" private-key-options) private-key-path-details)
        (conj private-key-path-details)

        private-key-value-details
        (conj private-key-value-details)

        (and (not= "local" private-key-options) private-key-path-details)
        (conj private-key-path-details)

        private-key-id-details
        (conj private-key-id-details)

        (and (not use-password) password-details)
        (conj password-details)))))

(defmethod sql-jdbc.conn/connection-details->spec :snowflake
  [_ {:keys [account additional-options host use-hostname password use-password], :as details}]
  (when (get "week_start" (sql-jdbc.common/additional-options->map additional-options :url))
    (log/warn (str "You should not set WEEK_START in Snowflake connection options; this might lead to incorrect "
                   "results. Set the Start of Week Setting instead.")))
  (let [upcase-not-nil (fn [s] (when s (u/upper-case-en s)))]
    ;; it appears to be the case that their JDBC driver ignores `db` -- see my bug report at
    ;; https://support.snowflake.net/s/question/0D50Z00008WTOMCSA5/
    (-> (merge {:classname                                  "net.snowflake.client.jdbc.SnowflakeDriver"
                :subprotocol                                "snowflake"
                :client_metadata_request_use_connection_ctx true
                :ssl                                        true
                ;; keep open connections open indefinitely instead of closing them. See #9674 and
                ;; https://docs.snowflake.net/manuals/sql-reference/parameters.html#client-session-keep-alive
                :client_session_keep_alive                  true
                ;; identify this connection as coming from Metabase for easier monitoring in Snowflake
                :application                                "Metabase_Metabase"
                ;; other SESSION parameters
                ;; not 100% sure why we need to do this but if we don't set the connection to UTC our report timezone
                ;; stuff doesn't work, even though we ultimately override this when we set the session timezone
                :timezone                                   "UTC"
                ;; tell Snowflake to use the same start of week that we have set for the
                ;; [[metabase.lib-be.core/start-of-week]] Setting.
                :week_start                                 (start-of-week-setting->snowflake-offset)}
               (-> details
                   ;; see https://github.com/metabase/metabase/issues/22133
                   (update :subname (fn [subname]
                                      (if subname
                                        subname
                                        (let [base-url (if (and use-hostname (string? host) (not (str/blank? host)))
                                                         (cond-> host
                                                           (not= (last host) \/) (str "/"))
                                                         (str account ".snowflakecomputing.com/"))]
                                          (str "//" base-url)))))
                   ;; original version of the Snowflake driver incorrectly used `dbname` in the details fields instead
                   ;; of `db`. If we run across `dbname` without a `db`, correct our behavior
                   (as-> dtls (if (contains? dtls :db)
                                (dissoc dtls :dbname)
                                (set/rename-keys dtls {:dbname :db})))
                   ;; see https://github.com/metabase/metabase/issues/27856
                   (update :db quote-name)
                   (cond-> use-password
                     (dissoc :private-key))
                   ;; password takes precedence if `use-password` is missing
                   (cond-> (or (false? use-password) (not password))
                     (dissoc :password))
                   ;; see https://github.com/metabase/metabase/issues/9511
                   (update :warehouse upcase-not-nil)
                   (m/update-existing :schema upcase-not-nil)
                   resolve-private-key
                   (dissoc :host :port :timezone)))
        (sql-jdbc.common/handle-additional-options details)
        ;; Role is not respected when used as connection property if connection string is present with private key
        ;; file. Hence it is moved to connection url. https://github.com/metabase/metabase/issues/43600
        (maybe-add-role-to-spec-url details))))

(defmethod sql-jdbc.sync/database-type->base-type :snowflake
  [_driver base-type]
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
    (keyword "DOUBLE PRECISION") :type/Float
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
    ;; This is a weird one. A timestamp with local time zone, stored without time zone but treated as being in the
    ;; Session time zone for filtering purposes etc.
    :TIMESTAMPLTZ               :type/DateTimeWithTZ
    ;; timestamp with no time zone
    :TIMESTAMPNTZ               :type/DateTime
    ;; timestamp with time zone normalized to UTC, similar to Postgres
    :TIMESTAMPTZ                :type/DateTimeWithLocalTZ
    ;; `VARIANT` is allowed to be any type. See https://docs.snowflake.com/en/sql-reference/data-types-semistructured
    :VARIANT                    :type/SnowflakeVariant
    ;; Maybe also type *
    :OBJECT                     :type/Dictionary
    :ARRAY                      :type/*} base-type))

(defmulti ^:private type->database-type
  "Internal type->database-type multimethod for Snowflake that dispatches on type."
  {:arglists '([type])}
  identity)

(defmethod type->database-type :type/Array [_] [:ARRAY])
(defmethod type->database-type :type/Boolean [_] [:BOOLEAN])
(defmethod type->database-type :type/Date [_] [:DATE])
(defmethod type->database-type :type/DateTime [_] [:DATETIME])
(defmethod type->database-type :type/DateTimeWithLocalTZ [_] [:TIMESTAMPTZ])
(defmethod type->database-type :type/DateTimeWithTZ [_] [:TIMESTAMPLTZ])
(defmethod type->database-type :type/Decimal [_] [:DECIMAL])
(defmethod type->database-type :type/Float [_] [:DOUBLE])
(defmethod type->database-type :type/Number [_] [:BIGINT])
(defmethod type->database-type :type/BigInteger [_] [:BIGINT])
(defmethod type->database-type :type/Integer [_] [:INTEGER])
(defmethod type->database-type :type/Text [_] [:TEXT])
(defmethod type->database-type :type/Time [_] [:TIME])

(defmethod driver/type->database-type :snowflake
  [_driver base-type]
  (type->database-type base-type))

(defmethod sql.qp/unix-timestamp->honeysql [:snowflake :seconds]      [_ _ expr] [:to_timestamp_tz expr])
(defmethod sql.qp/unix-timestamp->honeysql [:snowflake :milliseconds] [_ _ expr] [:to_timestamp_tz expr 3])
(defmethod sql.qp/unix-timestamp->honeysql [:snowflake :microseconds] [_ _ expr] [:to_timestamp_tz expr 6])

(defmethod sql.qp/add-interval-honeysql-form :snowflake
  [_driver hsql-form amount unit]
  ;; return type is always the same as expr type, unless expr is a DATE and you're adding something not in a DATE e.g.
  ;; `:seconds`, in which case it returns `timestamp_ntz`. See
  ;; https://docs.snowflake.com/en/sql-reference/functions/dateadd
  (let [db-type     (h2x/database-type hsql-form)
        return-type (if (and (= db-type "date")
                             (not (contains? driver-api/date-bucketing-units unit)))
                      "timestamp_ntz"
                      db-type)]
    (-> [:dateadd
         [:raw (name unit)]
         [:inline (int amount)]
         hsql-form]
        (h2x/with-database-type-info return-type))))

(defn- in-report-timezone
  "Convert timestamps with time zones (`timestamp_tz`) to timestamps that should be interpreted in the session
  timezone (`timestamp_ltz`) so various datetime extraction and truncation operations work as expected."
  [expr]
  (let [report-timezone (driver-api/report-timezone-id-if-supported)]
    (if (and report-timezone
             (= (h2x/database-type expr) "timestamptz"))
      [:to_timestamp_ltz expr]
      expr)))

(defn- extract
  [unit expr]
  (-> [:date_part (h2x/literal unit) (in-report-timezone expr)]
      (h2x/with-database-type-info "integer")))

(defn- date-trunc
  [unit expr]
  (let [acceptable-types (case unit
                           (:millisecond :second :minute :hour) #{"time" "timestampltz" "timestampntz" "timestamptz"}
                           (:day :week :month :quarter :year)   #{"date" "timestampltz" "timestampntz" "timestamptz"})
        expr             (h2x/cast-unless-type-in "timestampntz" acceptable-types expr)]
    (-> [:date_trunc (h2x/literal unit) (in-report-timezone expr)]
        (h2x/with-database-type-info (h2x/database-type expr)))))

(defmethod sql.qp/date [:snowflake :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:snowflake :minute]          [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:snowflake :minute-of-hour]  [_ _ expr] (extract :minute expr))
(defmethod sql.qp/date [:snowflake :hour]            [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:snowflake :hour-of-day]     [_ _ expr] (extract :hour expr))
(defmethod sql.qp/date [:snowflake :day-of-month]    [_ _ expr] (extract :day expr))
(defmethod sql.qp/date [:snowflake :day-of-year]     [_ _ expr] (extract :dayofyear expr))
(defmethod sql.qp/date [:snowflake :month]           [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:snowflake :month-of-year]   [_ _ expr] (extract :month expr))
(defmethod sql.qp/date [:snowflake :quarter]         [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:snowflake :quarter-of-year] [_ _ expr] (extract :quarter expr))
(defmethod sql.qp/date [:snowflake :year]            [_ _ expr] (date-trunc :year expr))
(defmethod sql.qp/date [:snowflake :year-of-era]     [_ _ expr] (extract :year expr))

(defmethod sql.qp/date [:snowflake :day]
  [_driver _unit expr]
  (if (= (h2x/database-type expr) "date")
    expr
    (-> [:to_date [:to_timestamp_ltz expr]]
        (h2x/with-database-type-info "date"))))

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
  ;;
  ;; TODO -- what about the `weekofyear()` or `week()` functions in Snowflake? Would that do what we want?
  ;; https://docs.snowflake.com/en/sql-reference/functions/year
  (throw (ex-info (tru "Snowflake doesn''t support extract us week")
                  {:driver driver
                   :form   expr
                   :type   driver-api/qp.error-type.invalid-query})))

(defmethod sql.qp/date [:snowflake :day-of-week]
  [_driver _unit expr]
  (extract :dayofweek expr))

(defmethod sql.qp/date [:snowflake :day-of-week-iso]
  [_driver _unit expr]
  (extract :dayofweekiso expr))

(defn- time-zoned-datediff
  "Same as snowflake's `datediff` but converts the args to the results time zone
   before calculating date boundaries. This is needed when an argument could be of
   timestamptz type and the unit is day, week, month, quarter or year."
  [unit x y]
  (let [x (if (h2x/is-of-type? x "timestamptz")
            [:convert_timezone (driver-api/results-timezone-id) x]
            x)
        y (if (h2x/is-of-type? y "timestamptz")
            [:convert_timezone (driver-api/results-timezone-id) y]
            y)]
    [:datediff [:raw (name unit)] x y]))

(defn- time-zoned-extract
  "Same as `extract` but converts the arg to the results time zone if it's a timestamptz."
  [unit x]
  (let [x (if (h2x/is-of-type? x "timestamptz")
            [:convert_timezone (driver-api/results-timezone-id) x]
            x)]
    (extract unit x)))

(defn- sub-day-datediff
  "Same as snowflake's `datediff`, but accurate to the millisecond for sub-day units."
  [unit x y]
  (let [milliseconds [:datediff [:raw "milliseconds"] x y]]
    ;; milliseconds needs to be cast to float because division rounds incorrectly with large integers
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

(defmethod sql.qp/cast-temporal-string [:snowflake :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  (h2x/with-database-type-info [:to_timestamp expr (h2x/literal "YYYYMMDDHH24MISS")] "timestamp"))

(defmethod sql.qp/->honeysql [:snowflake :regex-match-first]
  [driver [_ arg pattern]]
  [:regexp_substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)])

(defmethod sql.qp/->honeysql [:snowflake :median]
  [driver [_ arg]]
  (sql.qp/->honeysql driver [:percentile arg 0.5]))

(defmethod sql.qp/->honeysql [:snowflake :split-part]
  [driver [_ text divider position]]
  (let [position (sql.qp/->honeysql driver position)]
    [:case
     [:< position 1]
     ""

     :else
     [:split_part (sql.qp/->honeysql driver text) (sql.qp/->honeysql driver divider) position]]))

(defmethod sql.qp/->honeysql [:snowflake :text]
  [driver [_ value]]
  [:to_char (sql.qp/->honeysql driver value)])

(defmethod sql.qp/->honeysql [:snowflake :collate]
  [driver [_ arg collation]]
  [:collate (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver collation)])

(defn- db-name
  "As mentioned above, old versions of the Snowflake driver used `details.dbname` to specify the physical database, but
  tests (and Snowflake itself) expected `details.db`. This has since been fixed, but for legacy support we'll still
  accept either. Throw an Exception if neither key can be found."
  {:arglists '([database])}
  [{details :details}]
  ;; ignore any blank keys
  (or (m/find-first (every-pred string? (complement str/blank?))
                    ((juxt :db :dbname) details))
      (throw (Exception. (tru "Invalid Snowflake connection details: missing DB name.")))))

(defn- query-db-name []
  ;; the store is always initialized when running QP queries; for some stuff like the test extensions DDL statements
  ;; it won't be, *but* they should already be qualified by database name anyway
  (when (driver-api/initialized?)
    (db-name (driver-api/database (driver-api/metadata-provider)))))

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
  (apply h2x/identifier identifier-type components))

(defmethod sql.qp/->honeysql [:snowflake ::h2x/identifier]
  [_driver [_identifier identifier-type :as identifier]]
  (let [qualify? (and (seq (query-db-name))
                      (= identifier-type :table))]
    (cond-> identifier
      qualify? qualify-identifier)))

;;; TODO -- I don't think these actually ever get qualified since the parent method returns things wrapped
;;; in [[h2x/with-database-type-info]] thus nothing will ever be an identifier.
(defmethod sql.qp/->honeysql [:snowflake :field]
  [driver [_ _ opts :as field-clause]]
  (let [source-table (get opts driver-api/qp.add.source-table)
        parent-method (get-method sql.qp/->honeysql [:sql :field])
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
        timestamptz? (or (sql.qp.u/field-with-tz? arg)
                         (h2x/is-of-type? hsql-form "timestamptz"))]
    (sql.u/validate-convert-timezone-args timestamptz? target-timezone source-timezone)
    (-> (if timestamptz?
          [:convert_timezone target-timezone hsql-form]
          [:to_timestamp_ntz
           [:convert_timezone (or source-timezone (driver-api/results-timezone-id)) target-timezone hsql-form]])
        (h2x/with-database-type-info "timestampntz"))))

(defmethod sql.qp/->honeysql [:snowflake :relative-datetime]
  [driver [_ amount unit]]
  (driver-api/maybe-cacheable-relative-datetime-honeysql
   driver unit amount
   sql.qp/*parent-honeysql-col-type-info*))

(defmethod sql.qp/->honeysql [:snowflake LocalDate]
  [_driver t]
  (-> [:raw (format "'%s'::date" (u.date/format t))]
      (h2x/with-database-type-info "date")))

(defmethod sql.qp/->honeysql [:snowflake LocalTime]
  [_driver t]
  (-> [:raw (format "'%s'::time" (u.date/format "HH:mm:ss.SSS" t))]
      (h2x/with-database-type-info "time")))

;;; Snowflake doesn't have `timetz`, so just convert to an equivalent local time.
(defmethod sql.qp/->honeysql [:snowflake OffsetTime]
  [driver t]
  (sql.qp/->honeysql driver (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))))

(defmethod sql.qp/->honeysql [:snowflake LocalDateTime]
  [_driver t]
  (-> [:raw (format "'%s'::timestamp_ntz" (u.date/format "yyyy-MM-dd HH:mm:ss.SSS" t))]
      (h2x/with-database-type-info "timestampntz")))

(defmethod sql.qp/->honeysql [:snowflake OffsetDateTime]
  [_driver t]
  (-> [:raw (format "'%s'::timestamp_tz" (u.date/format "yyyy-MM-dd HH:mm:ss.SSS xx" t))]
      (h2x/with-database-type-info "timestamptz")))

(defmethod sql.qp/->honeysql [:snowflake ZonedDateTime]
  [driver t]
  (sql.qp/->honeysql driver (t/offset-date-time t)))

(defmethod driver/table-rows-seq :snowflake
  [driver database table]
  (driver-api/with-metadata-provider (u/the-id database)
    (let [table-metadata   (driver-api/table (driver-api/metadata-provider) (:id table))
          table-identifier (sql.qp/->honeysql driver table-metadata)
          query            {:select [:*]
                            :from   [[table-identifier]]}]
      (sql-jdbc/query driver database query))))

(defmethod driver/describe-database* :snowflake
  [driver database]
  (let [db-name          (db-name database)
        excluded-schemas (set (sql-jdbc.sync/excluded-schemas driver))]
    (driver-api/with-metadata-provider (u/the-id database)
      (let [schema-patterns (driver.s/db-details->schema-filter-patterns "schema-filters" database)
            [inclusion-patterns exclusion-patterns] schema-patterns]
        (sql-jdbc.execute/do-with-connection-with-options
         driver
         database
         nil
         ;; you know what, if we really wanted to make this efficient we would do
         ;;
         ;;    SHOW SCHEMAS IN DATABASE <db>
         ;;
         ;; first, and filter out the ones we're not interested in, and THEN do
         ;;
         ;;    SHOW OBJECTS IN SCHEMA <schema>
         ;;
         ;; for each of the schemas we wanted to sync. Right now we're fetching EVERY table, including ones from schemas
         ;; we aren't interested in.
         (fn [^Connection conn]
           {:tables (into #{}
                          (comp (filter (fn [{schema :schema table-name :name}]
                                          (and (not (contains? excluded-schemas schema))
                                               (sql-jdbc.describe-database/include-schema-logging-exclusion inclusion-patterns
                                                                                                            exclusion-patterns
                                                                                                            schema)
                                               (sql-jdbc.sync/have-select-privilege? driver conn schema table-name))))
                                (map #(dissoc % :type)))
                          ;; The Snowflake JDBC drivers is dumb and broken, it will narrow the results to the current
                          ;; session schema pass in `nil` for `schema-or-nil` to `getTables()`... `%` seems to fix it.
                          ;; See [[metabase.driver.snowflake/describe-database-default-schema-test]] and
                          ;; https://metaboat.slack.com/archives/C04DN5VRQM6/p1706220295862639?thread_ts=1706156558.940489&cid=C04DN5VRQM6
                          ;; for more info.
                          (vec (sql-jdbc.describe-database/db-tables driver (.getMetaData conn) "%" db-name)))}))))))

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

(defn- dynamic-table?
  "Check if the table is a dynamic table.

  You can't rely on :table_type from INFORMATION_SCHEMA.TABLES or :type from getTables because in
  both cases it returns `Table` for dynamic tables."
  [^Connection conn ^String db-name ^String schema-name ^String table-name]
  (try
    ;; there is another way of checking this by using SHOW TABLES command and check `is_dynamic` column.
    ;; But this column is not documented on https://docs.snowflake.com/en/sql-reference/sql/show-tables (2024/05/07),
    ;; So we avoid using it here.
    (-> (jdbc/query
         {:connection conn}
         [(format "SHOW DYNAMIC TABLES LIKE '%s' IN SCHEMA \"%s\".\"%s\";"
                  table-name db-name schema-name)])
        first
        some?)
    (catch SnowflakeSQLException e
      (log/warn e "Failed to check if table is dynamic")
      ;; query will fail if schema doesn't exist
      false)))

(defn- table->db-name
  [table]
  (driver-api/with-metadata-provider (:db_id table)
    (-> (driver-api/metadata-provider)
        driver-api/database
        db-name)))

;; The Snowflake JDBC driver is buggy: schema and table name are interpreted as patterns
;; in getPrimaryKeys and getImportedKeys calls. When this bug gets fixed, the
;; [[sql-jdbc.describe-table/get-table-pks]] method and the [[describe-table-fks*]] and
;; [[describe-table-fks]] functions can be dropped and the call to [[describe-table-fks]]
;; can be replaced with a call to [[sql-jdbc.sync/describe-table-fks]]. See #26054 for
;; more context.
(defmethod sql-jdbc.describe-table/get-table-pks :snowflake
  [_driver ^Connection conn db-name-or-nil table]
  (let [^DatabaseMetaData metadata (.getMetaData conn)
        schema-name                (-> table :schema escape-name-for-metadata)
        table-name                 (-> table :name escape-name-for-metadata)]
    (try
      (into [] (sql-jdbc.sync.common/reducible-results
                #(.getPrimaryKeys metadata db-name-or-nil
                                  schema-name
                                  table-name)
                (fn [^ResultSet rs] #(.getString rs "COLUMN_NAME"))))
      (catch SnowflakeSQLException e
        ;; dynamic tables doesn't support pks so it's fine to suppress the exception
        (if (dynamic-table? conn (or db-name-or-nil (table->db-name table)) (:schema table) (:name table))
          []
          (throw e))))))

(defn- describe-table-fks*
  "Stolen from [[sql-jdbc.describe-table]].
  The only change is that it escapes `schema` and `table-name`."
  [_driver ^Connection conn {^String schema :schema, ^String table-name :name} db-name]
  ;; Snowflake bug: schema and table name are interpreted as patterns
  (let [metadata    (.getMetaData conn)
        schema-name (escape-name-for-metadata schema)
        table-name  (escape-name-for-metadata table-name)]
    (try
      (into
       #{}
       (sql-jdbc.sync.common/reducible-results #(.getImportedKeys metadata db-name schema-name table-name)
                                               (fn [^ResultSet rs]
                                                 (fn []
                                                   {:fk-column-name   (.getString rs "FKCOLUMN_NAME")
                                                    :dest-table       {:name   (.getString rs "PKTABLE_NAME")
                                                                       :schema (.getString rs "PKTABLE_SCHEM")}
                                                    :dest-column-name (.getString rs "PKCOLUMN_NAME")}))))
      (catch SnowflakeSQLException e
        ;; dynamic tables doesn't support fks so it's fine to suppress the exception
        (if (dynamic-table? conn db-name schema table-name)
          #{}
          (throw e))))))

(defn- describe-table-fks
  "Stolen from [[sql-jdbc.describe-table]].
  The only change is that it calls the stolen function [[describe-table-fks*]]."
  [driver db-or-id-or-spec table db-name]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   db-or-id-or-spec
   nil
   (fn [conn]
     (describe-table-fks* driver conn table db-name))))

#_{:clj-kondo/ignore [:deprecated-var]}
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
     (with-open [stmt (.prepareStatement conn "show parameters like 'TIMEZONE' in user;")
                 rset (.executeQuery stmt)]
       (when (.next rset)
         (.getString rset "value"))))))

(defmethod sql-jdbc.sync/excluded-schemas :snowflake
  [_]
  #{"INFORMATION_SCHEMA"})

(defn- adjust-host-and-port
  [{:keys [account host port] :as db-details}]
  (cond-> db-details
    (not host) (assoc :host (str account ".snowflakecomputing.com"))
    (not port) (assoc :port 443)))

(defmethod driver/incorporate-ssh-tunnel-details :snowflake
  [_driver db-details]
  (let [details (adjust-host-and-port db-details)]
    (driver/incorporate-ssh-tunnel-details :sql-jdbc details)))

(defmethod driver/can-connect? :snowflake
  [driver {:keys [db], :as details}]
  (let [details (adjust-host-and-port details)]
    (and ((get-method driver/can-connect? :sql-jdbc) driver details)
         (sql-jdbc.conn/with-connection-spec-for-testing-connection [spec [driver details]]
           ;; jdbc/query is used to see if we throw, we want to ignore the results
           (jdbc/query spec (format "SHOW SCHEMAS IN DATABASE \"%s\";" db))
           true))))

(defmethod driver/normalize-db-details :snowflake
  [_ database]
  (cond-> database
    (not (str/blank? (-> database :details :regionid)))
    (-> (update-in [:details :account] #(str/join "." [% (-> database :details :regionid)]))
        (m/dissoc-in [:details :regionid]))

    (and
     (not (contains? (:details database) :use-password))
     (get-in database [:details :password])
     (nil? (get-in database [:details :private-key-id]))
     (nil? (get-in database [:details :private-key-path]))
     (nil? (get-in database [:details :private-key-value])))
    (assoc-in [:details :use-password] true)))

;;; If you try to read a Snowflake `timestamptz` as a String with `.getString` it always comes back in
;;; `America/Los_Angeles` for some reason I cannot figure out. Let's just read them out as UTC, which is what they're
;;; stored as internally anyway, and let the format-rows middleware adjust the timezone as needed
(defmethod sql-jdbc.execute/read-column-thunk [:snowflake Types/TIMESTAMP_WITH_TIMEZONE]
  [_driver ^ResultSet rs _rsmeta ^Integer i]
  ;; if we don't explicitly specify the Calendar then it looks like it defaults to the system timezone, we don't really
  ;; want that now do we.
  (let [utc-calendar (java.util.Calendar/getInstance (java.util.TimeZone/getTimeZone "UTC"))]
    (fn []
      (some-> (.getTimestamp rs i utc-calendar)
              t/instant
              (t/offset-date-time (t/zone-offset 0))))))

;;; --------------------------------------------------- Query remarks ---------------------------------------------------

;; Snowflake strips comments prepended to the SQL statement (default remark injection behavior). We should append the
;; remark instead.
(defmethod sql-jdbc.execute/inject-remark :snowflake
  [_ sql remark]
  (str sql "\n\n-- " remark))

(defmethod driver-api/query->remark :snowflake
  [_ {{:keys [context executed-by card-id pulse-id dashboard-id query-hash]} :info,
      query-type :type,
      database-id :database}]
  (json/encode {:client      "Metabase"
                :context     context
                :queryType   query-type
                :userId      executed-by
                :pulseId     pulse-id
                :cardId      card-id
                :dashboardId dashboard-id
                :databaseId  database-id
                :queryHash   (when (bytes? query-hash) (codecs/bytes->hex query-hash))
                :serverId    (driver-api/site-uuid)}))

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

(defmethod sql-jdbc/impl-query-canceled? :snowflake [_ e]
  (= (sql-jdbc/get-sql-state e) "57014"))

(defmethod sql-jdbc/impl-table-known-to-not-exist? :snowflake
  [_ e]
  (= (sql-jdbc/get-sql-state e) "42S02"))

(defmethod driver/table-exists? :snowflake
  [driver database {:keys [schema name]}]
  (let [db-name (db-name database)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database
     nil
     (fn [^Connection conn]
       (let [^DatabaseMetaData metadata (.getMetaData conn)
             schema-name (escape-name-for-metadata schema)
             table-name (escape-name-for-metadata name)]
         (with-open [rs (.getTables metadata db-name schema-name table-name nil)]
           (.next rs)))))))

(defmethod driver/create-schema-if-needed! :snowflake
  [driver conn-spec schema]
  (let [sql [[(format "CREATE SCHEMA IF NOT EXISTS \"%s\";" schema)]]]
    (driver/execute-raw-queries! driver conn-spec sql)))

(defmethod driver/rename-table! :snowflake
  [driver db-id from-table to-table]
  (let [sql (first (sql/format {:alter-table (keyword from-table)
                                :rename-table (keyword to-table)}
                               :quoted true
                               :dialect (sql.qp/quote-style driver)))]
    (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db-id)]
      (jdbc/execute! conn sql))))

(defmethod driver/table-name-length-limit :snowflake
  [_driver]
  ;; https://docs.snowflake.com/en/sql-reference/identifiers
  255)

(defn get-string-filter-arg
  "Generate the argument to match in the string filters. It's based on sql.qp/generate-pattern."
  [driver
   [type val :as arg]
   {:keys [case-sensitive] :or {case-sensitive true} :as _options}]
  (if case-sensitive
    (sql.qp/->honeysql driver arg)
    (if (= :value type)
      (sql.qp/->honeysql driver [type (u/lower-case-en val)])
      [:lower (sql.qp/->honeysql driver arg)])))

(defn- string-filter
  [driver str-filter field arg {:keys [case-sensitive] :or {case-sensitive true} :as options}]
  (let [casted-field (sql.qp/->honeysql driver (sql.qp/maybe-cast-uuid-for-text-compare field))]
    [str-filter
     (if case-sensitive casted-field [:lower casted-field])
     (get-string-filter-arg driver arg options)]))

(defmethod sql.qp/->honeysql [:snowflake :contains]
  [driver [_ field arg options]]
  (string-filter driver :contains field arg options))

(defmethod sql.qp/->honeysql [:snowflake :starts-with]
  [driver [_ field arg options]]
  (string-filter driver :startswith field arg options))

(defmethod sql.qp/->honeysql [:snowflake :ends-with]
  [driver [_ field arg options]]
  (string-filter driver :endswith field arg options))

<<<<<<< HEAD
;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Workspace Isolation                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- isolation-role-name
  "Generate role name for workspace isolation."
  [workspace]
  (format "MB_ISOLATION_ROLE_%s" (:id workspace)))

(defmethod driver/init-workspace-isolation! :snowflake
  [_driver database workspace]
  (let [schema-name (driver.u/workspace-isolation-namespace-name workspace)
        db-name     (-> database :details :db)
        warehouse   (-> database :details :warehouse)
        role-name   (isolation-role-name workspace)
        read-user   {:user     (driver.u/workspace-isolation-user-name workspace)
                     :password (driver.u/random-workspace-password)}
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    (when-not db-name
      (throw (ex-info "Snowflake database configuration is missing required 'db' (database name) setting"
                      {:database-id (:id database) :step :init})))
    (when-not warehouse
      (throw (ex-info "Snowflake database configuration is missing required 'warehouse' setting"
                      {:database-id (:id database) :step :init})))
    ;; Snowflake RBAC: create schema -> create role -> grant privileges to role -> create user -> grant role to user
    (doseq [sql [(format "CREATE SCHEMA IF NOT EXISTS \"%s\".\"%s\"" db-name schema-name)
                 (format "CREATE ROLE IF NOT EXISTS \"%s\"" role-name)
                 (format "GRANT USAGE ON DATABASE \"%s\" TO ROLE \"%s\"" db-name role-name)
                 (format "GRANT USAGE ON WAREHOUSE \"%s\" TO ROLE \"%s\"" warehouse role-name)
                 (format "GRANT USAGE ON SCHEMA \"%s\".\"%s\" TO ROLE \"%s\"" db-name schema-name role-name)
                 (format "GRANT ALL PRIVILEGES ON SCHEMA \"%s\".\"%s\" TO ROLE \"%s\"" db-name schema-name role-name)
                 (format "GRANT ALL ON FUTURE TABLES IN SCHEMA \"%s\".\"%s\" TO ROLE \"%s\"" db-name schema-name role-name)
                 (format "CREATE USER IF NOT EXISTS \"%s\" PASSWORD = '%s' MUST_CHANGE_PASSWORD = FALSE DEFAULT_ROLE = \"%s\""
                         (:user read-user) (:password read-user) role-name)
                 (format "GRANT ROLE \"%s\" TO USER \"%s\"" role-name (:user read-user))]]
      (jdbc/execute! conn-spec [sql]))
    {:schema           schema-name
     :database_details (assoc read-user :role role-name :use-password true)}))

(defmethod driver/destroy-workspace-isolation! :snowflake
  [_driver database workspace]
  (let [schema-name (driver.u/workspace-isolation-namespace-name workspace)
        db-name     (-> database :details :db)
        role-name   (isolation-role-name workspace)
        username    (driver.u/workspace-isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    (when-not db-name
      (throw (ex-info "Snowflake database configuration is missing required 'db' (database name) setting"
                      {:database-id (:id database) :step :destroy})))
    ;; Drop in reverse order of creation: schema (CASCADE handles tables) -> user -> role
    (doseq [sql [(format "DROP SCHEMA IF EXISTS \"%s\".\"%s\" CASCADE" db-name schema-name)
                 (format "DROP USER IF EXISTS \"%s\"" username)
                 (format "DROP ROLE IF EXISTS \"%s\"" role-name)]]
      (jdbc/execute! conn-spec [sql]))))

(defmethod driver/grant-workspace-read-access! :snowflake
  [_driver database workspace tables]
  (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (:id database))
        db-name   (-> database :details :db)
        role-name (-> workspace :database_details :role)]
    (when-not db-name
      (throw (ex-info "Snowflake database configuration is missing required 'db' (database name) setting"
                      {:database-id (:id database) :step :grant})))
    (when-not role-name
      (throw (ex-info "Workspace isolation is not properly initialized - missing role name"
                      {:workspace-id (:id workspace) :step :grant})))
    ;; Grant USAGE on each unique schema first (required to access tables within)
    (doseq [schema (distinct (map :schema tables))]
      (jdbc/execute! conn-spec [(format "GRANT USAGE ON SCHEMA \"%s\".\"%s\" TO ROLE \"%s\""
                                        db-name schema role-name)]))
    ;; Grant SELECT on each specific table
    (doseq [table tables]
      (jdbc/execute! conn-spec [(format "GRANT SELECT ON TABLE \"%s\".\"%s\".\"%s\" TO ROLE \"%s\""
                                        db-name (:schema table) (:name table) role-name)]))))
=======
(defmethod driver/llm-sql-dialect-resource :snowflake [_]
  "llm/prompts/dialects/snowflake.md")
>>>>>>> master
