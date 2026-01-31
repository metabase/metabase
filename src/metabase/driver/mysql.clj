(ns metabase.driver.mysql
  "MySQL driver. Builds off of the SQL-JDBC driver."
  (:refer-clojure :exclude [some not-empty])
  (:require
   [clojure.java.io :as jio]
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql :as sql]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common :as driver.common]
   [metabase.driver.mysql.actions :as mysql.actions]
   [metabase.driver.mysql.ddl :as mysql.ddl]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.quoting :refer [quote-columns]]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf :refer [some not-empty]])
  (:import
   (java.io File)
   (java.sql
    Connection
    DatabaseMetaData
    ResultSet
    ResultSetMetaData
    SQLException
    Statement
    Types)
   (java.time
    LocalDateTime
    OffsetDateTime
    OffsetTime
    ZoneOffset
    ZonedDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

(comment
  ;; method impls live in these namespaces.
  mysql.actions/keep-me
  mysql.ddl/keep-me)

(driver/register! :mysql, :parent :sql-jdbc)

(def ^:private ^:const min-supported-mysql-version 5.7)
(def ^:private ^:const min-supported-mariadb-version 10.2)

(defmethod driver/display-name :mysql [_] "MySQL")

(doseq [[feature supported?] {;; MySQL LIKE clauses are case-sensitive or not based on whether the collation of the
                              ;; server and the columns themselves. Since this isn't something we can really change in
                              ;; the query itself don't present the option to the users in the UI
                              :case-sensitivity-string-filter-options false
                              :connection-impersonation               true
                              :connection-impersonation-requires-role true
                              :describe-fields                        true
                              :describe-fks                           true
                              :convert-timezone                       true
                              :datetime-diff                          true
                              :full-join                              false
                              ;; Index sync is turned off across the application as it is not used ATM.
                              :index-info                             false
                              :now                                    true
                              :percentile-aggregations                false
                              :persist-models                         true
                              :schemas                                false
                              :uploads                                true
                              :identifiers-with-spaces                true
                              :rename                                 true
                              :atomic-renames                         true
                              :expressions/integer                    true
                              :expressions/float                      true
                              :expressions/date                       true
                              :expressions/text                       true
                              :split-part                             true
                              ;; MySQL doesn't let you have lag/lead in the same part of a query as a `GROUP BY`; to
                              ;; fully support `offset` we need to do some kooky query transformations just for MySQL
                              ;; and make this work.
                              :window-functions/offset                false
                              :expression-literals                    true
                              :database-routing                       true
                              :metadata/table-existence-check         true
                              :transforms/python                      true
                              :transforms/table                       true
                              ;; currently disabled as :describe-indexes is not supported
                              :transforms/index-ddl                   false
                              :describe-default-expr                  true
                              :describe-is-nullable                   true
                              :describe-is-generated                  true
                              :workspace                              true}]
  (defmethod driver/database-supports? [:mysql feature] [_driver _feature _db] supported?))

;; This is a bit of a lie since the JSON type was introduced for MySQL since 5.7.8.
;; And MariaDB doesn't have the JSON type at all, though `JSON` was introduced as an alias for LONGTEXT in 10.2.7.
;; But since JSON unfolding will only apply columns with JSON types, this won't cause any problems during sync.
(defmethod driver/database-supports? [:mysql :nested-field-columns]
  [_driver _feat db]
  (driver.common/json-unfolding-default db))

(doseq [feature [:actions :actions/custom :actions/data-editing]]
  (defmethod driver/database-supports? [:mysql feature]
    [driver _feat _db]
    ;; Only supported for MySQL right now. Revise when a child driver is added.
    (= driver :mysql)))

(defn mariadb?
  "Returns true if the database is MariaDB. Assumes the database has been synced so `:dbms_version` is present."
  [database]
  (-> database :dbms_version :flavor (= "MariaDB")))

(defn- mysql?
  "Returns true if the database is MySQL (not MariaDB).
   Returns true for unsynced databases (unknown flavor)."
  [db]
  (= "MySQL"
     (if-let [conn (:connection db)]
       (->> ^java.sql.Connection conn .getMetaData .getDatabaseProductName)
       (-> db :dbms_version :flavor))))

(defn mariadb-connection?
  "Returns true if the database is MariaDB."
  [driver conn]
  (->> conn (sql-jdbc.sync/dbms-version driver) :flavor (= "MariaDB")))

(defn- partial-revokes-enabled?
  [driver db]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   db
   nil
   (fn [^java.sql.Connection conn]
     (let [stmt (.prepareStatement conn "SHOW VARIABLES LIKE 'partial_revokes';")
           rset (.executeQuery stmt)]
       (when (.next rset)
         (= "ON" (.getString rset 2)))))))

(defmethod driver/database-supports? [:mysql :table-privileges]
  [_driver _feat _db]
  ;; Disabled completely due to errors when dealing with partial revokes (metabase#38499)
  false
  #_(and (= driver :mysql) (not (mariadb? db))))

(defmethod driver/database-supports? [:mysql :metadata/table-writable-check]
  [driver _feat db]
  (and (= driver :mysql)
       (mysql? db)
       (not (try
              (partial-revokes-enabled? driver db)
              (catch Exception e
                (log/warn e "Failed to check table writable")
                false)))))

(defmethod driver/database-supports? [:mysql :regex/lookaheads-and-lookbehinds]
  [driver _feat db]
  (and (= driver :mysql)
       (not (mariadb? db))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- db-version [^DatabaseMetaData metadata]
  (Double/parseDouble
   (format "%d.%d" (.getDatabaseMajorVersion metadata) (.getDatabaseMinorVersion metadata))))

(defn- unsupported-version? [^DatabaseMetaData metadata]
  (let [mariadb? (= (.getDatabaseProductName metadata) "MariaDB")]
    (< (db-version metadata)
       (if mariadb?
         min-supported-mariadb-version
         min-supported-mysql-version))))

(defn- warn-on-unsupported-versions [driver details]
  (sql-jdbc.conn/with-connection-spec-for-testing-connection [jdbc-spec [driver details]]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     jdbc-spec
     nil
     (fn [^java.sql.Connection conn]
       (when (unsupported-version? (.getMetaData conn))
         (log/warn
          (u/format-color :red
                          (str "\n\n********************************************************************************\n"
                               (format
                                "WARNING: Metabase only officially supports MySQL %s/MariaDB %s and above."
                                min-supported-mysql-version
                                min-supported-mariadb-version)
                               "\n"
                               "All Metabase features may not work properly when using an unsupported version."
                               "\n********************************************************************************\n"))))))))

(defmethod driver/can-connect? :mysql
  [driver details]
  ;; delegate to parent method to check whether we can connect; if so, check if it's an unsupported version and issue
  ;; a warning if it is
  (when ((get-method driver/can-connect? :sql-jdbc) driver details)
    (warn-on-unsupported-versions driver details)
    true))

(declare table-names->privileges)
(declare privilege-grants-for-user)

(defmethod sql-jdbc.sync/current-user-table-privileges :mysql
  [driver conn & {:as _options}]
  ;; MariaDB doesn't allow users to query the privileges of roles a user might have (unless they have select privileges
  ;; for the mysql database), so we can't query the full privileges of the current user.
  (when-not (mariadb-connection? driver conn)
    (let [sql->tuples (fn [sql] (drop 1 (jdbc/query conn sql {:as-arrays? true})))
          db-name     (ffirst (sql->tuples "SELECT DATABASE()"))
          table-names (map first (sql->tuples "SHOW TABLES"))]
      (for [[table-name privileges] (table-names->privileges (privilege-grants-for-user conn "CURRENT_USER()")
                                                             db-name
                                                             table-names)]
        {:role   nil
         :schema nil
         :table  table-name
         :select (contains? privileges :select)
         :update (contains? privileges :update)
         :insert (contains? privileges :insert)
         :delete (contains? privileges :delete)}))))

(def default-ssl-cert-details
  "Server SSL certificate chain, in PEM format."
  {:name         "ssl-cert"
   :display-name (deferred-tru "Server SSL certificate chain")
   :placeholder  ""
   :visible-if   {"ssl" true}})

(defmethod driver/connection-properties :mysql
  [_]
  (->>
   [{:type :group
     :container-style ["grid" "3fr 1fr"]
     :fields [driver.common/default-host-details
              (assoc driver.common/default-port-details :placeholder 3306)]}
    driver.common/default-dbname-details
    driver.common/default-user-details
    (driver.common/auth-provider-options #{:aws-iam})
    (assoc driver.common/default-password-details
           :visible-if {"use-auth-provider" false})
    driver.common/default-role-details
    driver.common/cloud-ip-address-info
    {:type :group
     :container-style ["component" "backdrop"]
     :fields [driver.common/default-ssl-details
              default-ssl-cert-details
              driver.common/ssh-tunnel-preferences]}
    driver.common/advanced-options-start
    driver.common/json-unfolding
    (assoc driver.common/additional-options
           :placeholder  "tinyInt1isBit=false")
    driver.common/default-advanced-options]
   (into [] (mapcat u/one-or-many))))

(defmethod sql.qp/add-interval-honeysql-form :mysql
  [driver hsql-form amount unit]
  (h2x/add-interval-honeysql-form driver hsql-form amount unit))

;; now() returns current timestamp in seconds resolution; now(6) returns it in nanosecond resolution
(defmethod sql.qp/current-datetime-honeysql-form :mysql
  [driver]
  (h2x/current-datetime-honeysql-form driver))

(defmethod driver/humanize-connection-error-message :mysql
  [_ messages]
  (let [message (first messages)]
    (condp re-matches message
      #"^Communications link failure\s+The last packet sent successfully to the server was 0 milliseconds ago. The driver has not received any packets from the server.$"
      :cannot-connect-check-host-and-port

      #"^Unknown database .*$"
      :database-name-incorrect

      #"Access denied for user.*$"
      :username-or-password-incorrect

      #"Must specify port after ':' in connection string"
      :invalid-hostname

      ;; else
      message)))

#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod sql-jdbc.sync/db-default-timezone :mysql
  [_ spec]
  (let [sql                                    (str "SELECT @@GLOBAL.time_zone AS global_tz,"
                                                    " @@system_time_zone AS system_tz,"
                                                    " time_format("
                                                    "   timediff("
                                                    "      now(), convert_tz(now(), @@GLOBAL.time_zone, '+00:00')"
                                                    "   ),"
                                                    "   '%H:%i'"
                                                    " ) AS 'offset';")
        [{:keys [global_tz system_tz offset]}] (jdbc/query spec sql)
        the-valid-id                           (fn [zone-id]
                                                 (when zone-id
                                                   (try
                                                     (.getId (t/zone-id zone-id))
                                                     (catch Throwable _))))]
    (or
     ;; if global timezone ID is 'SYSTEM', then try to use the system timezone ID
     (when (= global_tz "SYSTEM")
       (the-valid-id system_tz))
     ;; otherwise try to use the global ID
     (the-valid-id global_tz)
     ;; failing that, calculate the offset between now in the global timezone and now in UTC. Non-negative offsets
     ;; don't come back with `+` so add that if needed
     (if (str/starts-with? offset "-")
       offset
       (str \+ offset)))))

(defmethod driver/db-start-of-week :mysql
  [_]
  :sunday)

(defmethod driver/rename-tables!* :mysql
  [_driver db-id sorted-rename-map]
  (let [rename-clauses (map (fn [[from-table to-table]]
                              (str (sql/format-entity from-table) " TO " (sql/format-entity to-table)))
                            sorted-rename-map)
        sql (str "RENAME TABLE " (str/join ", " rename-clauses))]
    (sql-jdbc.execute/do-with-connection-with-options
     :mysql
     db-id
     nil
     (fn [^java.sql.Connection conn]
       (jdbc/execute! {:connection conn} [sql])))))

;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver.sql/json-field-length :mysql
  [_ json-field-identifier]
  [:length [:cast json-field-identifier :char]])

(defmethod sql.qp/unix-timestamp->honeysql [:mysql :seconds] [_ _ expr]
  (h2x/with-database-type-info [:from_unixtime expr] "datetime"))

(defmethod sql.qp/cast-temporal-string [:mysql :Coercion/ISO8601->DateTime]
  [_driver _coercion-strategy expr]
  (h2x/->datetime expr))

(defmethod sql.qp/cast-temporal-string [:mysql :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  (h2x/with-database-type-info [:convert expr [:raw "DATETIME"]] "datetime"))

(defmethod sql.qp/cast-temporal-byte [:mysql :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal expr))

(defmethod sql.qp/cast-temporal-byte [:mysql :Coercion/ISO8601Bytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/ISO8601->DateTime expr))

(defn- date-format [format-str expr]
  [:date_format expr (h2x/literal format-str)])

(defn- str-to-date
  "From the dox:

  > STR_TO_DATE() returns a DATETIME value if the format string contains both date and time parts, or a DATE or TIME
  > value if the string contains only date or time parts.

  See https://dev.mysql.com/doc/refman/8.0/en/date-and-time-functions.html#function_date-format for a list of format
  specifiers."
  [format-str expr]
  (let [contains-date-parts? (some #(str/includes? format-str %)
                                   ["%a" "%b" "%c" "%D" "%d" "%e" "%j" "%M" "%m" "%U"
                                    "%u" "%V" "%v" "%W" "%w" "%X" "%x" "%Y" "%y"])
        contains-time-parts? (some #(str/includes? format-str %)
                                   ["%f" "%H" "%h" "%I" "%i" "%k" "%l" "%p" "%r" "%S" "%s" "%T"])
        database-type        (cond
                               (and contains-date-parts? (not contains-time-parts?)) "date"
                               (and contains-time-parts? (not contains-date-parts?)) "time"
                               :else                                                 "datetime")]
    (-> [:str_to_date expr (h2x/literal format-str)]
        (h2x/with-database-type-info database-type))))

(defmethod sql.qp/integer-dbtype :mysql
  [_]
  :signed)

(defmethod sql.qp/->honeysql [:mysql :split-part]
  [driver [_ text divider position]]
  (let [text (sql.qp/->honeysql driver text)
        div  (sql.qp/->honeysql driver divider)
        pos  (sql.qp/->honeysql driver position)]
    [:case
     ;; non-positive position
     [:< pos 1]
     ""

     ;; position greater than number of parts
     [:> pos
      [:+ 1
       [:floor
        [:/
         [:- [:length text]
          [:length [:replace text div ""]]]
         [:length div]]]]]
     ""

     ;; This needs some explanation.
     ;; The inner substring_index returns the string up to the `pos` instance of `div`
     ;; The outer substring_index returns the string from the last instance of `div` to the end
     :else
     [:substring_index
      [:substring_index text div pos]
      div -1]]))

(defmethod sql.qp/->honeysql [:mysql :text]
  [driver [_ value]]
  (h2x/maybe-cast "CHAR" (sql.qp/->honeysql driver value)))

(defmethod sql.qp/->honeysql [:mysql :regex-match-first]
  [driver [_ arg pattern]]
  [:regexp_substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)])

(defmethod sql.qp/->honeysql [:mysql :length]
  [driver [_ arg]]
  [:char_length (sql.qp/->honeysql driver arg)])

(def ^:private database-type->mysql-cast-type-name
  "MySQL supports the ordinary SQL standard database type names for actual type stuff but not for coercions, sometimes.
  If it doesn't support the ordinary SQL standard type, then we coerce it to a different type that MySQL does support here"
  {"integer"          "signed"
   "text"             "char"
   ;; MySQL decimal defaults to 0 decimal places, so cast it as a double
   ;; See https://dev.mysql.com/doc/refman/8.4/en/fixed-point-types.html
   "decimal"          "double"
   "double precision" "double"
   "bigint"           "unsigned"})

(defmethod sql.qp/json-query :mysql
  [_driver unwrapped-identifier stored-field]
  {:pre [(h2x/identifier? unwrapped-identifier)]}
  (letfn [(handle-name [x] (str "\"" (if (number? x) (str x) (name x)) "\""))]
    (let [field-type            (:database-type stored-field)
          field-type            (get database-type->mysql-cast-type-name field-type field-type)
          nfc-path              (:nfc-path stored-field)
          parent-identifier     (sql.qp.u/nfc-field->parent-identifier unwrapped-identifier stored-field)
          jsonpath-query        (format "$.%s" (str/join "." (map handle-name (rest nfc-path))))
          json-extract+jsonpath [:json_unquote [:json_extract parent-identifier jsonpath-query]]]
      (case (u/lower-case-en field-type)
        ;; If we see JSON datetimes we expect them to be in ISO8601. However, MySQL expects them as something different.
        ;; We explicitly tell MySQL to go and accept ISO8601, because that is JSON datetimes, although there is no real standard for JSON, ISO8601 is the de facto standard.
        "timestamp" [:convert
                     [:str_to_date json-extract+jsonpath "\"%Y-%m-%dT%T.%fZ\""]
                     [:raw "DATETIME"]]

        "boolean" json-extract+jsonpath

        ;; in older versions of MySQL you can't do `convert(<string>, double)` or `cast(<string> AS double)` which is
        ;; equivalent; instead you can do `<string> + 0.0` =(
        ("float" "double") [:+ json-extract+jsonpath [:inline 0.0]]

        [:convert json-extract+jsonpath [:raw (u/upper-case-en field-type)]]))))

(defmethod sql.qp/->honeysql [:mysql :field]
  [driver [_ id-or-name opts :as mbql-clause]]
  (let [stored-field  (when (integer? id-or-name)
                        (driver-api/field (driver-api/metadata-provider) id-or-name))
        parent-method (get-method sql.qp/->honeysql [:sql :field])
        honeysql-expr (parent-method driver mbql-clause)]
    (cond
      (not (driver-api/json-field? stored-field))
      honeysql-expr

      (::sql.qp/forced-alias opts)
      (keyword (driver-api/qp.add.source-alias opts))

      :else
      (perf/postwalk #(if (h2x/identifier? %)
                        (sql.qp/json-query :mysql % stored-field)
                        %)
                     honeysql-expr))))

;; Since MySQL doesn't have date_trunc() we fake it by formatting a date to an appropriate string and then converting
;; back to a date. See http://dev.mysql.com/doc/refman/5.6/en/date-and-time-functions.html#function_date-format for an
;; explanation of format specifiers
;; this will generate a SQL statement casting the TIME to a DATETIME so date_format doesn't fail:
;; date_format(CAST(mytime AS DATETIME), '%Y-%m-%d %H') AS mytime
(defn- trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str (h2x/->datetime expr))))

(defmethod sql.qp/date [:mysql :minute]
  [_driver _unit expr]
  (let [format-str (if (= (h2x/database-type expr) "time")
                     "%H:%i"
                     "%Y-%m-%d %H:%i")]
    (trunc-with-format format-str expr)))

(defmethod sql.qp/date [:mysql :hour]
  [_driver _unit expr]
  (let [format-str (if (= (h2x/database-type expr) "time")
                     "%H"
                     "%Y-%m-%d %H")]
    (trunc-with-format format-str expr)))

(defmethod sql.qp/date [:mysql :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:mysql :minute-of-hour]  [_ _ expr] (h2x/minute expr))
(defmethod sql.qp/date [:mysql :hour-of-day]     [_ _ expr] (h2x/hour expr))
(defmethod sql.qp/date [:mysql :day-of-month]    [_ _ expr] [:dayofmonth expr])
(defmethod sql.qp/date [:mysql :day-of-year]     [_ _ expr] [:dayofyear expr])
(defmethod sql.qp/date [:mysql :month-of-year]   [_ _ expr] (h2x/month expr))
(defmethod sql.qp/date [:mysql :quarter-of-year] [_ _ expr] (h2x/quarter expr))

(defmethod sql.qp/date [:mysql :day-of-week]
  [driver _unit expr]
  (sql.qp/adjust-day-of-week driver [:dayofweek expr]))

(defn- temporal-cast [type expr]
  ;; mysql does not allow casting to timestamp
  (if (= "timestamp" (u/lower-case-en type))
    (h2x/maybe-cast "datetime" expr)
    (h2x/maybe-cast type expr)))

(defmethod sql.qp/date [:mysql :day]
  [_ _ expr]
  (if (h2x/is-of-type? expr "date")
    expr
    (->> (h2x/with-database-type-info [:date expr] "date")
         (temporal-cast (h2x/database-type expr)))))

;; To convert a YEARWEEK (e.g. 201530) back to a date you need tell MySQL which day of the week to use,
;; because otherwise as far as MySQL is concerned you could be talking about any of the days in that week
(defmethod sql.qp/date [:mysql :week]
  [_ _ expr]
  (let [extract-week-fn (fn [expr]
                          (str-to-date "%X%V %W"
                                       (h2x/concat [:yearweek expr]
                                                   (h2x/literal " Sunday"))))]
    (->> (sql.qp/adjust-start-of-week :mysql extract-week-fn expr)
         (temporal-cast (h2x/database-type expr)))))

(defmethod sql.qp/date [:mysql :week-of-year-iso] [_ _ expr] (h2x/week expr 3))

(defmethod sql.qp/date [:mysql :month]
  [_ _ expr]
  (->> (str-to-date "%Y-%m-%d" (h2x/concat (date-format "%Y-%m" expr) (h2x/literal "-01")))
       (temporal-cast (h2x/database-type expr))))

;; Truncating to a quarter is trickier since there aren't any format strings.
;; See the explanation in the H2 driver, which does the same thing but with slightly different syntax.
(defmethod sql.qp/date [:mysql :quarter]
  [_ _ expr]
  (->> (str-to-date "%Y-%m-%d"
                    (h2x/concat (h2x/year expr)
                                (h2x/literal "-")
                                (h2x/- (h2x/* (h2x/quarter expr)
                                              3)
                                       2)
                                (h2x/literal "-01")))
       (temporal-cast (h2x/database-type expr))))

(defmethod sql.qp/date [:mysql :year]
  [_ _ expr]
  (->> (h2x/with-database-type-info [:makedate (h2x/year expr) (sql.qp/inline-num 1)] "date")
       (temporal-cast (h2x/database-type expr))))

(defmethod sql.qp/->honeysql [:mysql :convert-timezone]
  [driver [_ arg target-timezone source-timezone]]
  (let [expr       (sql.qp/->honeysql driver arg)
        timestamp? (or (sql.qp.u/field-with-tz? arg)
                       (h2x/is-of-type? expr "timestamp"))]
    (sql.u/validate-convert-timezone-args timestamp? target-timezone source-timezone)
    (h2x/with-database-type-info
     [:convert_tz expr (or source-timezone (driver-api/results-timezone-id)) target-timezone]
     "datetime")))

(defn- timestampdiff-dates [unit x y]
  [:timestampdiff [:raw (name unit)] (h2x/->date x) (h2x/->date y)])

(defn- timestampdiff [unit x y]
  [:timestampdiff [:raw (name unit)] x y])

(defmethod sql.qp/datetime-diff [:mysql :year]    [_driver _unit x y] (timestampdiff-dates :year x y))
(defmethod sql.qp/datetime-diff [:mysql :quarter] [_driver _unit x y] (timestampdiff-dates :quarter x y))
(defmethod sql.qp/datetime-diff [:mysql :month]   [_driver _unit x y] (timestampdiff-dates :month x y))
(defmethod sql.qp/datetime-diff [:mysql :week]    [_driver _unit x y] (timestampdiff-dates :week x y))
(defmethod sql.qp/datetime-diff [:mysql :day]     [_driver _unit x y] [:datediff y x])
(defmethod sql.qp/datetime-diff [:mysql :hour]    [_driver _unit x y] (timestampdiff :hour x y))
(defmethod sql.qp/datetime-diff [:mysql :minute]  [_driver _unit x y] (timestampdiff :minute x y))
(defmethod sql.qp/datetime-diff [:mysql :second]  [_driver _unit x y] (timestampdiff :second x y))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.sync/database-type->base-type :mysql
  [_ database-type]
  ({:BIGINT     :type/BigInteger
    :BINARY     :type/*
    :BIT        :type/Boolean
    :BLOB       :type/*
    :CHAR       :type/Text
    :DATE       :type/Date
    :DATETIME   :type/DateTime
    :DECIMAL    :type/Decimal
    :DOUBLE     :type/Float
    :ENUM       :type/MySQLEnum
    :FLOAT      :type/Float
    :INT        :type/Integer
    :INTEGER    :type/Integer
    :LONGBLOB   :type/*
    :LONGTEXT   :type/Text
    :MEDIUMBLOB :type/*
    :MEDIUMINT  :type/Integer
    :MEDIUMTEXT :type/Text
    :NUMERIC    :type/Decimal
    :REAL       :type/Float
    :SET        :type/*
    :SMALLINT   :type/Integer
    :TEXT       :type/Text
    :TIME       :type/Time
    :TIMESTAMP  :type/DateTimeWithLocalTZ ; stored as UTC in the database
    :TINYBLOB   :type/*
    :TINYINT    :type/Integer
    :TINYTEXT   :type/Text
    :VARBINARY  :type/*
    :VARCHAR    :type/Text
    :YEAR       :type/Integer
    :JSON       :type/JSON}
   ;; strip off " UNSIGNED" from end if present
   (keyword (str/replace (name database-type) #"\sUNSIGNED$" ""))))

(defmethod sql-jdbc.sync/column->semantic-type :mysql
  [_ database-type _]
  ;; More types to be added when we start caring about them
  (case database-type
    "JSON"  :type/SerializedJSON
    nil))

(def ^:private default-connection-args
  "Map of args for the MySQL/MariaDB JDBC connection string."
  {;; 0000-00-00 dates are valid in MySQL; convert these to `null` when they come back because they're illegal in Java
   :zeroDateTimeBehavior "convertToNull"
   ;; Force UTF-8 encoding of results
   :useUnicode           true
   :characterEncoding    "UTF8"
   :characterSetResults  "UTF8"
   ;; GZIP compress packets sent between Metabase server and MySQL/MariaDB database
   :useCompression       true
   ;; record transaction isolation level and auto-commit locally, and avoid hitting the DB if we do something like
   ;; `.setTransactionIsolation()` to something we previously set it to. Since we do this every time we run a
   ;; query (see [[metabase.driver.sql-jdbc.execute/set-best-transaction-level!]]) this should speed up things a bit by
   ;; removing that overhead. See also
   ;; https://dev.mysql.com/doc/connector-j/en/connector-j-connp-props-performance-extensions.html#cj-conn-prop_useLocalSessionState
   ;; and #44507
   :useLocalSessionState true})

(defn- maybe-add-program-name-option [jdbc-spec additional-options-map]
  ;; connectionAttributes (if multiple) are separated by commas, so values that contain spaces are OK, so long as they
  ;; don't contain a comma; our mb-version-and-process-identifier shouldn't contain one, but just to be on the safe side
  (let [set-prog-nm-fn (fn []
                         (let [prog-name (str/replace driver-api/mb-version-and-process-identifier "," "_")]
                           (assoc jdbc-spec :connectionAttributes (str "program_name:" prog-name))))]
    (if-let [conn-attrs (get additional-options-map "connectionAttributes")]
      (if (str/includes? conn-attrs "program_name")
        jdbc-spec ; additional-options already includes the program_name; don't set it here
        (set-prog-nm-fn))
      (set-prog-nm-fn)))) ; additional-options did not contain connectionAttributes at all; set it

(defmethod sql-jdbc.conn/connection-details->spec :mysql
  [_ {ssl? :ssl, :keys [additional-options ssl-cert auth-provider], :as details}]
  ;; In versions older than 0.32.0 the MySQL driver did not correctly save `ssl?` connection status. Users worked
  ;; around this by including `useSSL=true`. Check if that's there, and if it is, assume SSL status. See #9629
  ;;
  ;; TODO - should this be fixed by a data migration instead?
  (let [addl-opts-map (sql-jdbc.common/additional-options->map additional-options :url "=" false)
        use-iam?      (= (some-> auth-provider keyword) :aws-iam)
        ssl?          (or ssl? (= "true" (get addl-opts-map "useSSL")))
        ssl-cert?     (and ssl? (some? ssl-cert))]
    (when (and ssl? (not (contains? addl-opts-map "trustServerCertificate")))
      (log/info "You may need to add 'trustServerCertificate=true' to the additional connection options to connect with SSL."))
    (when (and use-iam? (not ssl?))
      (throw (ex-info "You must enable SSL in order to use AWS IAM authentication" {})))
    (when (and use-iam?
               (contains? addl-opts-map "sslMode")
               (not= (get addl-opts-map "sslMode") "VERIFY_CA"))
      (throw (ex-info "sslMode must be VERIFY_CA in order to use AWS IAM authentication" {})))
    (merge
     default-connection-args
     ;; newer versions of MySQL will complain if you don't specify this when not using SSL
     {:useSSL (boolean ssl?)}
     (let [details (cond-> details
                     ssl-cert?
                     (set/rename-keys {:ssl-cert :serverSslCert})

                     use-iam?
                     (->
                      (assoc :subprotocol "aws-wrapper:mysql"
                             :classname "software.amazon.jdbc.ds.AwsWrapperDataSource"
                             :sslMode "VERIFY_CA"
                             :wrapperPlugins "iam")
                      (dissoc :auth-provider :use-auth-provider))

                     true
                     (-> (set/rename-keys {:dbname :db})
                         (dissoc :ssl)))]
       (-> (driver-api/spec :mysql details)
           (maybe-add-program-name-option addl-opts-map)
           (sql-jdbc.common/handle-additional-options details))))))

(defmethod sql-jdbc.sync/active-tables :mysql
  [& args]
  (apply sql-jdbc.sync/post-filtered-active-tables args))

(defmethod sql-jdbc.sync/excluded-schemas :mysql
  [_]
  #{"INFORMATION_SCHEMA"})

(defmethod sql.qp/quote-style :mysql [_] :mysql)

;; If this fails you need to load the timezone definitions from your system into MySQL; run the command
;;
;;    `mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root mysql`
;;
;; See https://dev.mysql.com/doc/refman/5.7/en/time-zone-support.html for details
;;
(defmethod sql-jdbc.execute/set-timezone-sql :mysql
  [_]
  "SET @@session.time_zone = %s;")

(defmethod sql-jdbc.execute/set-parameter [:mysql OffsetTime]
  [driver ps i t]
  ;; convert to a LocalTime so MySQL doesn't get F U S S Y
  (sql-jdbc.execute/set-parameter driver ps i (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))))

;; Regardless of session timezone it seems to be the case that OffsetDateTimes get normalized to UTC inside MySQL
;;
;; Since MySQL TIMESTAMPs aren't timezone-aware this means comparisons are done between timestamps in the report
;; timezone and the local datetime portion of the parameter, in UTC. Bad!
;;
;; Convert it to a LocalDateTime, in the report timezone, so comparisons will work correctly.
;;
;; See also — https://dev.mysql.com/doc/refman/5.5/en/datetime.html
;;
;; TIMEZONE FIXME — not 100% sure this behavior makes sense
(defmethod sql-jdbc.execute/set-parameter [:mysql OffsetDateTime]
  [driver ^java.sql.PreparedStatement ps ^Integer i t]
  (let [zone   (t/zone-id (driver-api/results-timezone-id))
        offset (.. zone getRules (getOffset (t/instant t)))
        t      (t/local-date-time (t/with-offset-same-instant t offset))]
    (sql-jdbc.execute/set-parameter driver ps i t)))

;; MySQL TIMESTAMPS are actually TIMESTAMP WITH LOCAL TIME ZONE, i.e. they are stored normalized to UTC when stored.
;; However, MySQL returns them in the report time zone in an effort to make our lives horrible.
(defmethod sql-jdbc.execute/read-column-thunk [:mysql Types/TIMESTAMP]
  [_ ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  ;; Check and see if the column type is `TIMESTAMP` (as opposed to `DATETIME`, which is the equivalent of
  ;; LocalDateTime), and normalize it to a UTC timestamp if so.
  (if (= (.getColumnTypeName rsmeta i) "TIMESTAMP")
    (fn read-timestamp-thunk []
      (when-let [t (.getObject rs i LocalDateTime)]
        (t/with-offset-same-instant (t/offset-date-time t (t/zone-id (driver-api/results-timezone-id))) (t/zone-offset 0))))
    (fn read-datetime-thunk []
      (.getObject rs i LocalDateTime))))

;; Results of `timediff()` might come back as negative values, or might come back as values that aren't valid
;; `LocalTime`s e.g. `-01:00:00` or `25:00:00`.
;;
;; There is currently no way to tell whether the column is the result of a `timediff()` call (i.e., a duration) or a
;; normal `LocalTime` -- JDBC doesn't have interval/duration type enums. `java.time.LocalTime`only accepts values of
;; hour between 0 and 23 (inclusive). The MariaDB JDBC driver's implementations of `(.getObject rs i
;; java.time.LocalTime)` will throw Exceptions in these cases.
;;
;; Thus we should attempt to fetch temporal results the normal way and fall back to string representations for cases
;; where the values are unparseable.
(defmethod sql-jdbc.execute/read-column-thunk [:mysql Types/TIME]
  [driver ^ResultSet rs rsmeta ^Integer i]
  (let [parent-thunk ((get-method sql-jdbc.execute/read-column-thunk [:sql-jdbc Types/TIME]) driver rs rsmeta i)]
    (fn read-time-thunk []
      (try
        (parent-thunk)
        (catch Throwable _
          (.getString rs i))))))

;; Mysql 8.1+ returns results of YEAR(..) function having a YEAR type. In Mysql 8.0.33, return value of that function
;; has an integral type. Let's make the returned values consistent over mysql versions.
;; Context: https://dev.mysql.com/doc/connector-j/en/connector-j-YEAR.html
(defmethod sql-jdbc.execute/read-column-thunk [:mysql Types/DATE]
  [driver ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (if (= "YEAR" (.getColumnTypeName rsmeta i))
    (fn read-time-thunk []
      (when-let [x (.getObject rs i)]
        (.getYear (.toLocalDate ^java.sql.Date x))))
    (let [parent-thunk ((get-method sql-jdbc.execute/read-column-thunk [:sql-jdbc Types/DATE]) driver rs rsmeta i)]
      parent-thunk)))

(defn- format-offset [t]
  (let [offset (t/format "ZZZZZ" (t/zone-offset t))]
    (if (= offset "Z")
      "UTC"
      offset)))

(defmethod sql.qp/inline-value [:mysql OffsetTime]
  [_ t]
  ;; MySQL doesn't support timezone offsets in literals so pass in a local time literal wrapped in a call to convert
  ;; it to the appropriate timezone
  (format "convert_tz('%s', '%s', @@session.time_zone)"
          (t/format "HH:mm:ss.SSS" t)
          (format-offset t)))

(defmethod sql.qp/inline-value [:mysql OffsetDateTime]
  [_ t]
  (format "convert_tz('%s', '%s', @@session.time_zone)"
          (t/format "yyyy-MM-dd HH:mm:ss.SSS" t)
          (format-offset t)))

(defmethod sql.qp/inline-value [:mysql ZonedDateTime]
  [_ t]
  (format "convert_tz('%s', '%s', @@session.time_zone)"
          (t/format "yyyy-MM-dd HH:mm:ss.SSS" t)
          (str (t/zone-id t))))

(defmethod driver/upload-type->database-type :mysql
  [_driver upload-type]
  (case upload-type
    :metabase.upload/varchar-255              [[:varchar 255]]
    :metabase.upload/text                     [:text]
    :metabase.upload/int                      [:bigint]
    :metabase.upload/auto-incrementing-int-pk [:bigint :not-null :auto-increment]
    :metabase.upload/float                    [:double]
    :metabase.upload/boolean                  [:boolean]
    :metabase.upload/date                     [:date]
    :metabase.upload/datetime                 [:datetime]
    :metabase.upload/offset-datetime          [:timestamp]))

(defmulti ^:private type->database-type
  "Internal type->database-type multimethod for MySQL that dispatches on type."
  {:arglists '([type])}
  identity)

(defmethod type->database-type :type/TextLike [_] [:text])
(defmethod type->database-type :type/Text [_] [:text])
(defmethod type->database-type :type/Number [_] [:bigint])
(defmethod type->database-type :type/BigInteger [_] [:bigint])
(defmethod type->database-type :type/Integer [_] [:int])
(defmethod type->database-type :type/Float [_] [:double])
(defmethod type->database-type :type/Decimal [_] [:decimal])
(defmethod type->database-type :type/Boolean [_] [:boolean])
(defmethod type->database-type :type/Date [_] [:date])
(defmethod type->database-type :type/DateTime [_] [:datetime])
(defmethod type->database-type :type/DateTimeWithTZ [_] [:timestamp])
(defmethod type->database-type :type/Time [_] [:time])
(defmethod type->database-type :type/JSON [_] [:json])
(defmethod type->database-type :type/SerializedJSON [_] [:json])

(defmethod driver/type->database-type :mysql
  [_driver base-type]
  (type->database-type base-type))

(defmethod driver/allowed-promotions :mysql
  [_driver]
  {:metabase.upload/int     #{:metabase.upload/float}
   :metabase.upload/boolean #{:metabase.upload/int
                              :metabase.upload/float}})

(defmethod driver/create-auto-pk-with-append-csv? :mysql [_driver] true)

(defmethod driver/table-name-length-limit :mysql
  [_driver]
  ;; https://dev.mysql.com/doc/refman/8.0/en/identifier-length.html
  64)

(defn- format-load
  [_clause [file-path table-name]]
  [(format "LOAD DATA LOCAL INFILE '%s' INTO TABLE %s" file-path (sql/format-entity table-name))])

(sql/register-clause! ::load format-load :insert-into)

(defn- offset-datetime->unoffset-datetime
  "Remove the offset from a datetime, returning a string representation in whatever timezone the `database` is
  configured to use. This is necessary since MariaDB doesn't support timestamp-with-time-zone literals and so we need
  to calculate one by hand."
  [driver database ^OffsetDateTime offset-time]
  (let [zone-id (t/zone-id (driver/db-default-timezone driver database))]
    (t/local-date-time offset-time zone-id)))

(defmulti ^:private value->string
  "Convert a value into a string that's safe for insertion"
  {:arglists '([driver val])}
  (fn [_ val] (type val)))

(defmethod value->string :default
  [_driver val]
  (str val))

(defmethod value->string nil
  [_driver _val]
  nil)

(defmethod value->string Boolean
  [_driver val]
  (if val
    "1"
    "0"))

(defmethod value->string LocalDateTime
  [_driver val]
  (t/format :iso-local-date-time val))

(let [zulu-fmt         "yyyy-MM-dd'T'HH:mm:ss"
      offset-fmt       "XXX"
      zulu-formatter   (DateTimeFormatter/ofPattern zulu-fmt)
      offset-formatter (DateTimeFormatter/ofPattern (str zulu-fmt offset-fmt))]
  (defmethod value->string OffsetDateTime
    [driver ^OffsetDateTime val]
    (let [uploads-db (driver-api/current-database)]
      (if (mariadb? uploads-db)
        (offset-datetime->unoffset-datetime driver uploads-db val)
        (t/format (if (.equals (.getOffset val) ZoneOffset/UTC)
                    zulu-formatter
                    offset-formatter)
                  val)))))

(defn- sanitize-value
  ;; Per https://dev.mysql.com/doc/refman/8.0/en/load-data.html#load-data-field-line-handling
  ;; Backslash is the MySQL escape character within strings in SQL statements. Thus, to specify a literal backslash,
  ;; you must specify two backslashes for the value to be interpreted as a single backslash. The escape sequences
  ;; '\t' and '\n' specify tab and newline characters, respectively.
  [v]
  (if (nil? v)
    "\\N"
    (str/replace v #"\\|\n|\r|\t" {"\\" "\\\\"
                                   "\n" "\\n"
                                   "\r" "\\r"
                                   "\t" "\\t"})))

(defn- row->tsv
  [driver column-count row]
  (when (not= column-count (count row))
    (throw (Exception. (format "ERROR: missing data in row \"%s\"" (str/join "," row)))))
  (->> row
       (map (comp sanitize-value (partial value->string driver)))
       (str/join "\t")))

(defn- get-global-variable
  "The value of the given global variable in the DB. Does not do any type coercion, so, e.g., booleans come back as
  \"ON\" and \"OFF\"."
  [db-id var-name]
  (:value
   (first
    (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec db-id)
                ["show global variables like ?" var-name]))))

(defmethod driver/insert-into! :mysql
  [driver db-id ^String table-name column-names values]
  ;; `local_infile` must be turned on per
  ;; https://dev.mysql.com/doc/refman/8.0/en/load-data.html#load-data-local
  (if (not= (get-global-variable db-id "local_infile") "ON")
    ;; If it isn't turned on, fall back to the generic "INSERT INTO ..." way
    ((get-method driver/insert-into! :sql-jdbc) driver db-id table-name column-names values)
    (let [temp-file (File/createTempFile (name table-name) ".tsv")
          file-path (.getAbsolutePath temp-file)]
      (try
        (let [tsvs    (map (partial row->tsv driver (count column-names)) values)
              dialect (sql.qp/quote-style driver)
              sql     (sql/format {::load   [file-path (keyword table-name)]
                                   :columns (quote-columns driver column-names)}
                                  :quoted true
                                  :dialect dialect)]
          (with-open [^java.io.Writer writer (jio/writer file-path)]
            (doseq [value (interpose \newline tsvs)]
              (.write writer (str value))))
          (sql-jdbc.execute/do-with-connection-with-options
           driver
           db-id
           nil
           (fn [conn]
             (jdbc/execute! {:connection conn} sql))))
        (finally
          (.delete temp-file))))))

(defmethod driver/insert-col->val [:mysql :jsonl-file]
  [_driver _ column-def v]
  (if (string? v)
    (cond
      (isa? (:type column-def) :type/DateTimeWithTZ)
      (t/offset-date-time v)

      (isa? (:type column-def) :type/DateTime)
      (u.date/parse v)

      :else
      v)
    v))

(defn- parse-grant
  "Parses the contents of a row from the output of a `SHOW GRANTS` statement, to extract the data needed
   to reconstruct the set of table privileges that the current user has. Returns nil if the grant doesn't
   contain any information we care about. Running `help show grants` in the mysql console shows the
   syntax for the output strings of `SHOW GRANTS` statements.

   There are two types of grants we care about: privileges and roles.

   Privilege example:
   (parse-grant \"GRANT SELECT, INSERT, UPDATE, DELETE ON `test-data`.* TO 'metabase'@'localhost'\")
   =>
   {:type            :privileges
    :privilege-types #{:select :insert :update :delete}
    :level           :table
    :object          \"test-data\"}

   Role example:
   (parse-grant \"GRANT 'example_role_1'@'%','example_role_2'@'%' TO 'metabase'@'localhost'\")
   =>
   {:type  :roles
    :roles #{'example_role_1'@'%' 'example_role_2'@'%'}}"
  [grant]
  (condp re-find grant
    #"^GRANT PROXY ON "
    nil
    #"^GRANT (.+) ON FUNCTION "
    nil
    #"^GRANT (.+) ON PROCEDURE "
    nil
    ;; GRANT
    ;;     priv_type [(column_list)]
    ;;       [, priv_type [(column_list)]] ...
    ;;     ON object
    ;;     TO user etc.
    ;; }
    ;; For now we ignore column-level privileges. But this is how we could get them in the future.
    #"^GRANT (.+) ON (.+) TO "
    :>>
    (fn [[_ priv-types object]]
      (when-let [priv-types' (if (= priv-types "ALL PRIVILEGES")
                               #{:select :update :delete :insert}
                               (let [split-priv-types (->> (str/split priv-types #", ")
                                                           (map (comp keyword u/lower-case-en))
                                                           set)]
                                 (set/intersection #{:select :update :delete :insert} split-priv-types)))]
        {:type             :privileges
         :privilege-types  (not-empty priv-types')
         :level            (cond
                             (= object "*.*")             :global
                             (str/ends-with? object ".*") :database
                             :else                        :table)
         :object           object}))
    ;; GRANT role [, role] ... TO user etc.
    #"^GRANT (.+) TO "
    :>>
    (fn [[_ roles]]
      {:type  :roles
       :roles (set (map u/lower-case-en (str/split roles #",")))})))

(defn- privilege-grants-for-user
  "Returns a list of parsed privilege grants for a user, taking into account the roles that the user has.
   It does so by first querying: `SHOW GRANTS FOR <user>`. If the results include any roles granted to the user,
   we query `SHOW GRANTS FOR <user> USING <role1> [,<role2>] ...`. The results from this query will contain
   all privileges granted for the user, either directly or indirectly through the role hierarchy."
  [conn-spec user]
  (let [query  (fn [q] (->> (jdbc/query conn-spec q {:as-arrays? true})
                            (drop 1)
                            (map first)))
        grants (map parse-grant (query (str "SHOW GRANTS FOR " user)))
        {role-grants      :roles
         privilege-grants :privileges} (group-by :type grants)]
    (if (seq role-grants)
      (let [roles  (:roles (first role-grants))
            grants (map parse-grant (query (str "SHOW GRANTS FOR " user "USING " (str/join "," roles))))
            {privilege-grants :privileges} (group-by :type grants)]
        privilege-grants)
      privilege-grants)))

(defn- table-names->privileges
  "Given a set of parsed grants for a user, a database name, and a list of table names in the database,
   return a map with table names as keys, and the set of privilege types that the user has on the table as values.

   The rules are:
   - global grants apply to all tables
   - database grants apply to all tables in the database
   - table grants apply to the table"
  [privilege-grants database-name table-names]
  (let [{global-grants   :global
         database-grants :database
         table-grants    :table} (group-by :level privilege-grants)
        lower-database-name  (u/lower-case-en database-name)
        all-table-privileges (set/union (:privilege-types (first global-grants))
                                        (:privilege-types (m/find-first #(= (:object %) (str "`" lower-database-name "`.*"))
                                                                        database-grants)))
        table-privileges (into {}
                               (keep (fn [grant]
                                       (when-let [match (re-find (re-pattern (str "^`" lower-database-name "`.`(.+)`")) (:object grant))]
                                         (let [[_ table-name] match]
                                           [table-name (:privilege-types grant)]))))
                               table-grants)]
    (into {}
          (keep (fn [table-name]
                  (when-let [privileges (not-empty (set/union all-table-privileges (get table-privileges table-name)))]
                    [table-name privileges])))
          table-names)))

;; Coerces boolean fields since mysql returns them as 0/1 integers
(defmethod sql-jdbc.sync/describe-fields-pre-process-xf :mysql
  [_driver _db & _args]
  (map (fn [col]
         (-> col
             (update :pk? pos?)
             (update :database-required pos?)
             (update :database-is-auto-increment pos?)
             (update :database-is-nullable pos?)
             (update :database-is-generated pos?)))))

(defmethod sql-jdbc.sync/describe-fields-sql :mysql
  [driver & {:keys [table-names details]}]
  (sql/format {:select [[:c.column_name :name]
                        [[:- :c.ordinal_position 1] :database-position]
                        [nil :table-schema]
                        [:c.table_name :table-name]
                        (if (some-> details :additional-options (str/includes? "tinyInt1isBit=false"))
                          [[:upper :c.data_type] :database-type]
                          [[:if [:= :column_type [:inline "tinyint(1)"]] [:inline "BIT"] [:upper :c.data_type]] :database-type])
                        [[:= :c.extra [:inline "auto_increment"]] :database-is-auto-increment]
                        [[:and
                          [:or [:= :column_default nil] [:= [:lower :column_default] [:inline "null"]]]
                          [:= :is_nullable [:inline "NO"]]
                          [:not [:= :c.extra [:inline "auto_increment"]]]]
                         :database-required]
                        [[:= :c.column_key [:inline "PRI"]] :pk?]
                        [[:= :is_nullable [:inline "YES"]] :database-is-nullable]
                        [[:if [:= [:lower :column_default] [:inline "null"]] nil :column_default] :database-default]

                        [[:and
                          ;; mariadb
                          [:!= :generation_expression nil]
                          ;; mysql
                          [:<> :generation_expression ""]]
                         :database-is-generated]

                        [[:nullif :c.column_comment [:inline ""]] :field-comment]]
               :from [[:information_schema.columns :c]]
               :where
               [:and [:raw "c.table_schema not in ('information_schema','performance_schema','sys','mysql')"]
                [:raw "c.table_name not in ('innodb_table_stats', 'innodb_index_stats')"]
                (when-let [db-name ((some-fn :db :dbname) details)]
                  [:= :c.table_schema db-name])
                (when (seq table-names) [:in [:lower :c.table_name] (map u/lower-case-en table-names)])]
               :order-by [:c.table_name :c.ordinal_position]}
              :dialect (sql.qp/quote-style driver)))

(defmethod sql-jdbc.sync/describe-fks-sql :mysql
  [driver & {:keys [table-names]}]
  (sql/format {:select [[nil :pk-table-schema]
                        [:a.referenced_table_name :pk-table-name]
                        [:a.referenced_column_name :pk-column-name]
                        [nil :fk-table-schema]
                        [:a.table_name :fk-table-name]
                        [:a.column_name :fk-column-name]]
               :from [[:information_schema.key_column_usage :a]]
               :join [[:information_schema.table_constraints :b] [:using :constraint_schema :constraint_name :table_name]]
               :where [:and [:= :b.constraint_type [:inline "FOREIGN KEY"]]
                       [:!= :a.referenced_table_schema nil]
                       (when (seq table-names) [:in :a.table_name table-names])]
               :order-by [:a.table_name]}
              :dialect (sql.qp/quote-style driver)))

(defmethod sql-jdbc/impl-query-canceled? :mysql [_ ^SQLException e]
  ;; ok to hardcode driver name here because this function only supports app DB types
  (driver-api/query-canceled-exception? :mysql e))

(defmethod sql-jdbc/drop-index-sql :mysql [_ _schema table-name index-name]
  (let [{quote-identifier :quote} (sql/get-dialect :mysql)]
    (format "DROP INDEX %s ON %s" (quote-identifier (name index-name)) (quote-identifier (name table-name)))))

;;; ------------------------------------------------- User Impersonation --------------------------------------------------

(defmethod driver.sql/default-database-role :mysql
  [_driver database]
  (-> database :details :role))

(defmethod driver.sql/set-role-statement :mysql
  [_driver role]
  (format "SET ROLE '%s';" role))

(defmethod sql-jdbc/impl-table-known-to-not-exist? :mysql
  [_ e]
  (= (sql-jdbc/get-sql-state e) "42S02"))

(defmethod driver.sql/default-schema :mysql
  [_]
  nil)

;; Override db-type-name to handle tinyint(1) as boolean
;; During sync, tinyint(1) is mapped to BIT (boolean) unless tinyInt1isBit=false is set
;; We need to do the same during query execution to ensure type consistency
(defmethod sql-jdbc.execute/db-type-name :mysql
  [_driver ^ResultSetMetaData rsmeta column-index]
  (let [db (try
             (driver-api/database (driver-api/metadata-provider))
             (catch Throwable _ nil))
        tiny-int-1-is-bit? (not (some-> db :details :additional-options (str/includes? "tinyInt1isBit=false")))
        db-type-name (.getColumnTypeName rsmeta column-index)
        precision    (try
                       (.getPrecision rsmeta column-index)
                       (catch Throwable _ nil))]
    (if (and (= "TINYINT" db-type-name)
             (= precision 1)
             tiny-int-1-is-bit?)
      "BIT"
      db-type-name)))

(defmethod driver/extra-info :mysql
  [_driver]
  nil)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Workspace Isolation                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- mysql-user-exists?
  "Check if a MySQL user exists."
  [conn username]
  (seq (jdbc/query conn ["SELECT 1 FROM mysql.user WHERE user = ?" username])))

(defmethod driver/init-workspace-isolation! :mysql
  [_driver database workspace]
  ;; MySQL doesn't have schemas in the PostgreSQL sense - each database is its own namespace.
  ;; We create a separate database for workspace isolation.
  (let [db-name          (driver.u/workspace-isolation-namespace-name workspace)
        user             (driver.u/workspace-isolation-user-name workspace)
        password         (driver.u/random-workspace-password)
        escaped-password (sql.u/escape-sql password :ansi)]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (let [user-sql (if (mysql-user-exists? t-conn user)
                       (format "ALTER USER `%s`@'%%' IDENTIFIED BY '%s'"
                               user escaped-password)
                       (format "CREATE USER `%s`@'%%' IDENTIFIED BY '%s'"
                               user escaped-password))]
        (with-open [^Statement stmt (.createStatement ^Connection (:connection t-conn))]
          (doseq [sql [;; Create the isolated database
                       (format "CREATE DATABASE IF NOT EXISTS `%s`" db-name)
                       user-sql
                       ;; Grant all privileges on the isolated database
                       (format "GRANT ALL PRIVILEGES ON `%s`.* TO `%s`@'%%'" db-name user)]]
            (.addBatch ^Statement stmt ^String sql))
          (.executeBatch ^Statement stmt))))
    {:schema           db-name
     :database_details {:user user, :password password :db db-name}}))

(defmethod driver/destroy-workspace-isolation! :mysql
  [_driver database workspace]
  (let [db-name  (:schema workspace)
        username (-> workspace :database_details :user)]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [^Statement stmt (.createStatement ^Connection (:connection t-conn))]
        (doseq [sql (cond-> [(format "DROP DATABASE IF EXISTS `%s`" db-name)]
                      (mysql-user-exists? t-conn username)
                      (conj (format "DROP USER IF EXISTS `%s`@'%%'" username)))]
          (.addBatch ^Statement stmt ^String sql))
        (.executeBatch ^Statement stmt)))))

(defmethod driver/grant-workspace-read-access! :mysql
  [_driver database workspace tables]
  (let [username (-> workspace :database_details :user)
        ;; In MySQL, tables don't have separate schemas within a database,
        ;; but the :schema field contains the source database name
        sqls     (for [{db :schema, t :name} tables]
                   (if (str/blank? db)
                     (format "GRANT SELECT ON `%s` TO `%s`@'%%'" t username)
                     (format "GRANT SELECT ON `%s`.`%s` TO `%s`@'%%'" db t username)))]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [^Statement stmt (.createStatement ^Connection (:connection t-conn))]
        (doseq [sql sqls]
          (.addBatch ^Statement stmt ^String sql))
        (.executeBatch ^Statement stmt)))))

;; MySQL doesn't support transactional DDL, so we need to override check-isolation-permissions
;; to manually clean up after testing rather than relying on transaction rollback.
(def ^:private perm-check-workspace-id "-1337")

(defmethod driver/check-isolation-permissions :mysql
  [driver database test-table]
  (let [test-workspace {:id   perm-check-workspace-id
                        :name "_mb_perm_check_"}]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database
     {:write? true}
     (fn [^Connection _conn]
       (let [result (try
                      (let [init-result (try
                                          (driver/init-workspace-isolation! driver database test-workspace)
                                          (catch Exception e
                                            (throw (ex-info (format "Failed to initialize workspace isolation (CREATE DATABASE/USER): %s"
                                                                    (ex-message e))
                                                            {:step :init} e))))
                            workspace-with-details (merge test-workspace init-result)]
                        (when test-table
                          (try
                            (driver/grant-workspace-read-access! driver database workspace-with-details [test-table])
                            (catch Exception e
                              (throw (ex-info (format "Failed to grant read access to table %s.%s: %s"
                                                      (:schema test-table) (:name test-table) (ex-message e))
                                              {:step :grant :table test-table} e)))))
                        (try
                          (driver/destroy-workspace-isolation! driver database workspace-with-details)
                          (catch Exception e
                            (throw (ex-info (format "Failed to destroy workspace isolation (DROP DATABASE/USER): %s"
                                                    (ex-message e))
                                            {:step :destroy} e))))
                        nil)
                      (catch Exception e
                        ;; On failure, attempt cleanup
                        (try
                          (driver/destroy-workspace-isolation! driver database
                                                               (merge test-workspace
                                                                      {:schema           (driver.u/workspace-isolation-namespace-name test-workspace)
                                                                       :database_details {:user (driver.u/workspace-isolation-user-name test-workspace)}}))
                          (catch Exception _cleanup-error
                            nil))
                        (ex-message e)))]
         result)))))
