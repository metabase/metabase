(ns metabase.driver.h2
  (:refer-clojure :exclude [some every? get-in])
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.math.combinatorics :as math.combo]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common :as driver.common]
   [metabase.driver.h2.actions :as h2.actions]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql :as sql]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.connection.ssh-tunnel :as ssh]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-mbql5]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.like-escape-char-built-in :as like-escape-char-built-in]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [every? get-in some]])
  (:import
   (java.sql Clob Connection ResultSet ResultSetMetaData SQLException Statement)
   (java.time OffsetTime)
   (org.h2.command CommandInterface Parser)
   (org.h2.engine SessionLocal)))

(set! *warn-on-reflection* true)

;; method impls live in this namespace
(comment h2.actions/keep-me)

(driver/register! :h2, :parent #{:sql-jdbc ::like-escape-char-built-in/like-escape-char-built-in :sql/mbql5})

;;; this will prevent the H2 driver from showing up in the list of options when adding a new Database.
(defmethod driver/superseded-by :h2 [_driver] :deprecated)

(defn- get-field
  "Returns value of private field. This function is used to bypass field protection to instantiate
   a low-level H2 Parser object in order to detect DDL statements in queries."
  ([obj field]
   (.get (doto (.getDeclaredField (class obj) field)
           (.setAccessible true))
         obj))
  ([obj field or-else]
   (try (get-field obj field)
        (catch java.lang.NoSuchFieldException _e
          ;; when there are no fields: return or-else
          or-else))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(doseq [[feature supported?] {:actions                   true
                              :actions/custom            true
                              :actions/data-editing      true
                              :datetime-diff             true
                              :expression-literals       true
                              :full-join                 false
                              ;; Index sync is turned off across the application as it is not used ATM.
                              :index-info                false
                              :now                       true
                              :percentile-aggregations   false
                              :regex                     true
                              :test/jvm-timezone-setting false
                              :uuid-type                 true
                              :uploads                   true
                              ;; (Ngoc - 2026-01-27) we have the code to support workspace isolation but since workspace
                              ;; is useless with out transforms, so we disable it for now
                              :workspace                 false
                              :database-routing          true
                              :describe-is-generated     true
                              :describe-is-nullable      true
                              :describe-default-expr     true
                              :metadata/table-existence-check true}]
  (defmethod driver/database-supports? [:h2 feature]
    [_driver _feature _database]
    supported?))

(defmethod sql.qp/->honeysql [:h2 :regex-match-first]
  [driver [_ _opts arg pattern]]
  [:regexp_substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)])

(defmethod driver/connection-properties :h2
  [_]
  (->>
   [{:name         "db"
     :display-name (tru "Connection String")
     :helper-text (deferred-tru "The local path relative to where Metabase is running from. Your string should not include the .mv.db extension.")
     :placeholder  (str "file:/" (deferred-tru "Users/camsaul/bird_sightings/toucans"))
     :required     true}
    driver.common/cloud-ip-address-info
    driver.common/advanced-options-start
    driver.common/default-advanced-options]
   (into [] (mapcat u/one-or-many))))

(defn- malicious-property-value
  "Checks an h2 connection string for connection properties that could be malicious. Markers of this include semi-colons
  which allow for sql injection in org.h2.engine.Engine/openSession. The others are markers for languages like
  javascript and ruby that we want to suppress."
  [s]
  ;; list of strings it looks for to compile scripts:
  ;; https://github.com/h2database/h2database/blob/master/h2/src/main/org/h2/util/SourceCompiler.java#L178-L187 we
  ;; can't use the static methods themselves since they expect to check the beginning of the string
  (let [bad-markers [";"
                     "//javascript"
                     "#ruby"
                     "//groovy"
                     "@groovy"]
        pred        (apply some-fn (map (fn [marker] (fn [s] (str/includes? s marker)))
                                        bad-markers))]
    (pred s)))

(defmethod driver/can-connect? :h2
  [driver {:keys [db] :as details}]
  (when-not driver.settings/*allow-testing-h2-connections*
    (throw (ex-info (tru "H2 is not supported as a data warehouse") {:status-code 400})))
  (when (string? db)
    (let [connection-str  (cond-> db
                            (not (str/includes? db "h2:")) (str/replace-first #"^" "h2:")
                            (not (str/includes? db "jdbc:")) (str/replace-first #"^" "jdbc:"))
          connection-info (org.h2.engine.ConnectionInfo. connection-str nil nil nil)
          properties      (get-field connection-info "prop")
          bad-props       (into {} (keep (fn [[k v]] (when (malicious-property-value v) [k v])))
                                properties)]
      (when (seq bad-props)
        (throw (ex-info "Malicious keys detected" {:keys (keys bad-props)})))
      ;; keys are uppercased by h2 when parsed:
      ;; https://github.com/h2database/h2database/blob/master/h2/src/main/org/h2/engine/ConnectionInfo.java#L298
      (when (contains? properties "INIT")
        (throw (ex-info "INIT not allowed" {:keys ["INIT"]})))))
  (sql-jdbc.conn/can-connect? driver details))

(defmethod driver/db-start-of-week :h2
  [_]
  :monday)

;; TODO - it would be better not to put all the options in the connection string in the first place?
(defn connection-string->file+options
  "Explode a `connection-string` like `file:my-db;OPTION=100;OPTION_2=TRUE` to a pair of file and an options map.

    (connection-string->file+options \"file:my-crazy-db;OPTION=100;OPTION_X=TRUE\")
      -> [\"file:my-crazy-db\" {\"OPTION\" \"100\", \"OPTION_X\" \"TRUE\"}]"
  [^String connection-string]
  {:pre [(string? connection-string)]}
  (let [[file & options] (str/split connection-string #";+")
        options          (into {} (for [option options]
                                    (str/split option #"=" 2)))]
    [file options]))

(defn- db-details->user [{:keys [db], :as details}]
  {:pre [(string? db)]}
  (or (some (partial get details) ["USER" :USER])
      (let [[_ {:strs [USER]}] (connection-string->file+options db)]
        USER)))

(mu/defn- check-native-query-not-using-default-user [{query-type :type, :as query} :- [:map
                                                                                       [:type [:enum :native :query]]]]
  (u/prog1 query
    ;; For :native queries check to make sure the DB in question has a (non-default) NAME property specified in the
    ;; connection string. We don't allow SQL execution on H2 databases for the default admin account for security
    ;; reasons
    (when (= (keyword query-type) :native)
      (let [{:keys [details]} (driver-api/database (driver-api/metadata-provider))
            user              (db-details->user details)]
        (when (and config/is-prod? ;; we elevated permissions in workspace tests
                   (or (str/blank? user)
                       (= user "sa")))        ; "sa" is the default USER
          (throw
           (ex-info (tru "Running SQL queries against H2 databases using the default (admin) database user is forbidden.")
                    {:type driver-api/qp.error-type.db})))))))

(defn- make-h2-parser
  "Returns an H2 Parser object for the given (H2) database ID"
  ^Parser [h2-database-or-id]
  (with-open [conn (.getConnection (sql-jdbc.execute/datasource-with-diagnostic-info! :h2 h2-database-or-id))]
    ;; The H2 Parser class is created from the H2 JDBC session, but these fields are not public
    (let [^org.h2.jdbc.JdbcConnection inner (try
                                              ;; May be a wrapper, get the innermost object that has session field
                                              (u/prog1 (.unwrap conn org.h2.jdbc.JdbcConnection)
                                                (assert (instance? org.h2.jdbc.JdbcConnection <>)))
                                              (catch java.sql.SQLException e
                                                (throw (ex-info "Not an H2 connection. Are we sure this is an H2 database?"
                                                                {:database h2-database-or-id
                                                                 :conn     conn}
                                                                e))))
          session (get-field inner "session")]
      ;; Only SessionLocal represents a connection we can create a parser with. Remote sessions and other
      ;; session types are ignored.
      (when (instance? SessionLocal session)
        (Parser. session)))))

(mu/defn- classify-query :- [:maybe
                             [:map
                              [:command-types [:vector pos-int?]]
                              [:remaining-sql [:maybe :string]]]]
  "Takes an h2 db id, and a query, returns the command-types from `query` and any remaining sql.
   More info on command types here:
   https://github.com/h2database/h2database/blob/master/h2/src/main/org/h2/command/CommandInterface.java

  If the h2 parser cannot be built, returns `nil`.

  - Each `command-type` corresponds to a value in org.h2.command.CommandInterface, and match the commands from `query` in order.
  - `remaining-sql` is a nillable sql string that is unable to be classified without running preceding queries first.
    Usually if `remaining-sql` exists we will deny the query."
  [database-or-id :- [:or
                      ::lib.schema.id/database
                      ::lib.schema.metadata/database]
   ^String query  :- :string]
  (when-let [h2-parser (make-h2-parser database-or-id)]
    (try
      (let [command            (.prepareCommand h2-parser query)
            first-command-type (.getCommandType command)
            command-types      (cond-> [first-command-type]
                                 (not (instance? org.h2.command.CommandContainer command))
                                 (into
                                  (map #(.getType ^org.h2.command.Prepared %))
                                  ;; when there are no fields: return no commands
                                  (get-field command "commands" [])))]
        {:command-types command-types
         ;; when there is no remaining sql: return nil for remaining-sql
         :remaining-sql (get-field command "remaining" nil)})
      ;; only valid queries can be classified.
      (catch org.h2.message.DbException _
        {:command-types [] :remaining-sql nil}))))

(defn- every-command-allowed-for-actions? [{:keys [command-types remaining-sql]}]
  (let [cmd-type-nums command-types]
    (boolean
     ;; Command types are organized with all DDL commands listed first, so all ddl commands are before ALTER_SEQUENCE.
     ;; see https://github.com/h2database/h2database/blob/master/h2/src/main/org/h2/command/CommandInterface.java#L297
     ;; This doesn't list all the possible commands, but it lists the most common and useful ones.
     (and (every? #{CommandInterface/INSERT
                    CommandInterface/MERGE
                    CommandInterface/TRUNCATE_TABLE
                    CommandInterface/UPDATE
                    CommandInterface/DELETE
                    CommandInterface/CREATE_TABLE
                    CommandInterface/DROP_TABLE
                    CommandInterface/CREATE_SCHEMA
                    CommandInterface/DROP_SCHEMA
                    CommandInterface/ALTER_TABLE_RENAME
                    CommandInterface/ALTER_TABLE_ADD_COLUMN
                    CommandInterface/ALTER_TABLE_DROP_COLUMN
                    CommandInterface/ALTER_TABLE_ALTER_COLUMN_CHANGE_TYPE
                    CommandInterface/ALTER_TABLE_ALTER_COLUMN_NOT_NULL
                    CommandInterface/ALTER_TABLE_ALTER_COLUMN_DROP_NOT_NULL
                    CommandInterface/ALTER_TABLE_ALTER_COLUMN_RENAME
                    ;; Read-only commands might not make sense for actions, but they are allowed
                    CommandInterface/SELECT ; includes SHOW, TABLE, VALUES
                    CommandInterface/EXPLAIN
                    CommandInterface/CALL} cmd-type-nums)
          (nil? remaining-sql)))))

(defn- check-action-commands-allowed [{:keys [database] {:keys [query]} :native}]
  (when query
    (when-let [query-classification (classify-query database query)]
      (when-not (every-command-allowed-for-actions? query-classification)
        (throw (ex-info "DDL commands are not allowed to be used with H2."
                        {:classification query-classification}))))))

(defn- read-only-statements? [{:keys [command-types remaining-sql]}]
  (let [cmd-type-nums command-types]
    (boolean
     (and (every? #{CommandInterface/SELECT ; includes SHOW, TABLE, VALUES
                    CommandInterface/EXPLAIN
                    CommandInterface/CALL} cmd-type-nums)
          (nil? remaining-sql)))))

(mu/defn- check-read-only-statements [{{sql :query} :native, :as _query} :- [:map
                                                                             [:type [:enum :query :native]]
                                                                             [:native
                                                                              [:map
                                                                               [:query string?]]]]]
  (when sql
    (let [query-classification (classify-query (driver-api/database (driver-api/metadata-provider))
                                               sql)]
      (when-not (read-only-statements? query-classification)
        (throw (ex-info "Only SELECT statements are allowed in a native query."
                        {:classification query-classification}))))))

(defmethod driver/execute-reducible-query :h2
  [driver query chans respond]
  (check-native-query-not-using-default-user query)
  (check-read-only-statements query)
  ((get-method driver/execute-reducible-query :sql-jdbc) driver query chans respond))

(mu/defmethod driver/execute-write-query! :h2
  [driver :- :keyword
   query  :- [:map
              [:type   [:= :native]]
              [:native [:map
                        [:query :string]]]]]
  (check-native-query-not-using-default-user query)
  (check-action-commands-allowed query)
  ((get-method driver/execute-write-query! :sql-jdbc) driver query))

(defmethod driver/execute-raw-queries! :h2
  [driver conn-spec queries]
  ;; FIXME: need to check the equivalent of check-native-query-not-using-default-user and check-action-commands-allowed
  ((get-method driver/execute-raw-queries! :sql-jdbc) driver conn-spec queries))

(defmethod sql.qp/add-interval-honeysql-form :h2
  [driver hsql-form amount unit]
  (h2x/add-interval-honeysql-form driver hsql-form amount unit))

(defmethod driver/humanize-connection-error-message :h2
  [_ messages]
  (let [message (first messages)]
    (condp re-matches message
      #"^A file path that is implicitly relative to the current working directory is not allowed in the database URL .*$"
      :implicitly-relative-db-file-path

      #"^Database .* not found, .*$"
      :db-file-not-found

      #"^Wrong user name or password .*$"
      :username-or-password-incorrect

      message)))

(defmethod driver/db-default-timezone :h2
  [_driver _database]
  ;; Based on this answer https://stackoverflow.com/a/18883531 and further experiments, h2 uses timezone of the jvm
  ;; where the driver is loaded.
  (System/getProperty "user.timezone"))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/current-datetime-honeysql-form :h2
  [driver]
  (h2x/current-datetime-honeysql-form driver))

(defn- add-to-1970 [expr unit-str]
  [:timestampadd
   (h2x/literal unit-str)
   expr
   [:raw "timestamp '1970-01-01T00:00:00Z'"]])

(defmethod sql.qp/unix-timestamp->honeysql [:h2 :seconds] [_ _ expr]
  (add-to-1970 expr "second"))

(defmethod sql.qp/unix-timestamp->honeysql [:h2 :milliseconds] [_ _ expr]
  (add-to-1970 expr "millisecond"))

(defmethod sql.qp/unix-timestamp->honeysql [:h2 :microseconds] [_ _ expr]
  (add-to-1970 expr "microsecond"))

(defmethod sql.qp/cast-temporal-string [:h2 :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  [:parsedatetime expr (h2x/literal "yyyyMMddHHmmss")])

(defmethod sql.qp/cast-temporal-byte [:h2 :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal
                               [:utf8tostring expr]))

(defmethod sql.qp/cast-temporal-byte [:h2 :Coercion/ISO8601Bytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/ISO8601->DateTime
                               [:utf8tostring expr]))

;; H2 v2 added date_trunc and extract
(defn- date-trunc [unit expr]
  (-> [:date_trunc (h2x/literal unit) expr]
      ;; date_trunc returns an arg of the same type as `expr`.
      (h2x/with-database-type-info (h2x/database-type expr))))

(defn- extract [unit expr] [::h2x/extract unit expr])

(defn- extract-integer [unit expr]
  (-> (extract unit expr)
      (h2x/with-database-type-info "integer")))

(defmethod sql.qp/date [:h2 :default]          [_ _ expr] expr)
(defmethod sql.qp/date [:h2 :second-of-minute] [_ _ expr] (extract-integer :second expr))
(defmethod sql.qp/date [:h2 :minute]           [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:h2 :minute-of-hour]   [_ _ expr] (extract-integer :minute expr))
(defmethod sql.qp/date [:h2 :hour]             [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:h2 :hour-of-day]      [_ _ expr] (extract-integer :hour expr))
(defmethod sql.qp/date [:h2 :day]              [_ _ expr] (h2x/->date expr))
(defmethod sql.qp/date [:h2 :day-of-month]     [_ _ expr] (extract-integer :day expr))
(defmethod sql.qp/date [:h2 :day-of-year]      [_ _ expr] (extract-integer :doy expr))
(defmethod sql.qp/date [:h2 :month]            [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:h2 :month-of-year]    [_ _ expr] (extract-integer :month expr))
(defmethod sql.qp/date [:h2 :quarter]          [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:h2 :quarter-of-year]  [_ _ expr] (extract-integer :quarter expr))
(defmethod sql.qp/date [:h2 :year]             [_ _ expr] (date-trunc :year expr))
(defmethod sql.qp/date [:h2 :year-of-era]      [_ _ expr] (extract-integer :year expr))

(defmethod sql.qp/date [:h2 :day-of-week]
  [_ _ expr]
  (sql.qp/adjust-day-of-week :h2 (extract :iso_day_of_week expr)))

(defmethod sql.qp/date [:h2 :week]
  [_ _ expr]
  (sql.qp/add-interval-honeysql-form :h2 (sql.qp/date :h2 :day expr)
                                     (h2x/- 1 (sql.qp/date :h2 :day-of-week expr))
                                     :day))

(defmethod sql.qp/date [:h2 :week-of-year-iso] [_ _ expr] (extract :iso_week expr))

(defmethod sql.qp/->honeysql [:h2 :log]
  [driver [_ _opts field]]
  [:log10 (sql.qp/->honeysql driver field)])

(defmethod sql.qp/->honeysql [:h2 ::sql.qp/expression-literal-text-value]
  [driver [_ _opts value]]
  ;; A literal text value gets compiled to a parameter placeholder like "?". H2 attempts to compile the prepared
  ;; statement immediately, presumably before the types of the params are known, and sometimes raises an "Unknown
  ;; data type" error if it can't deduce the type. The recommended workaround is to insert an explicit CAST.
  ;;
  ;; https://linear.app/metabase/issue/QUE-726/
  ;; https://github.com/h2database/h2database/issues/1383
  (->> (sql.qp/->honeysql driver value)
       (h2x/cast :text)))

(defn- datediff
  "Like H2's `datediff` function but accounts for timestamps with time zones."
  [unit x y]
  [:datediff [:raw (name unit)] (h2x/->timestamp x) (h2x/->timestamp y)])

(defn- time-zoned-extract
  "Like H2's extract but accounts for timestamps with time zones."
  [unit x]
  (extract unit (h2x/->timestamp x)))

(defmethod sql.qp/datetime-diff [:h2 :year]    [driver _unit x y] (h2x// (sql.qp/datetime-diff driver :month x y) 12))
(defmethod sql.qp/datetime-diff [:h2 :quarter] [driver _unit x y] (h2x// (sql.qp/datetime-diff driver :month x y) 3))

(defmethod sql.qp/datetime-diff [:h2 :month]
  [_driver _unit x y]
  (h2x/+ (datediff :month x y)
         ;; datediff counts month boundaries not whole months, so we need to adjust
         ;; if x<y but x>y in the month calendar then subtract one month
         ;; if x>y but x<y in the month calendar then add one month
         [:case
          [:and [:< x y] [:> (time-zoned-extract :day x) (time-zoned-extract :day y)]]
          -1

          [:and [:> x y] [:< (time-zoned-extract :day x) (time-zoned-extract :day y)]]
          1

          :else
          0]))

(defmethod sql.qp/datetime-diff [:h2 :week] [_driver _unit x y] (h2x// (datediff :day x y) 7))
(defmethod sql.qp/datetime-diff [:h2 :day]  [_driver _unit x y] (datediff :day x y))
(defmethod sql.qp/datetime-diff [:h2 :hour] [_driver _unit x y] (h2x// (datediff :millisecond x y) 3600000))
(defmethod sql.qp/datetime-diff [:h2 :minute] [_driver _unit x y] (datediff :minute x y))
(defmethod sql.qp/datetime-diff [:h2 :second] [_driver _unit x y] (datediff :second x y))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Datatype grammar adapted from BNF at https://h2database.com/html/datatypes.html

(defn- expand-grammar
  "Expands BNF-like grammar to all possible data types"
  [grammar]
  (cond
    (set? grammar)  (mapcat expand-grammar grammar)
    (list? grammar) (map (partial str/join " ")
                         (apply math.combo/cartesian-product
                                (map expand-grammar grammar)))
    :else           [grammar]))

(def ^:private base-type->db-type-grammar
  '{:type/Boolean             #{BOOLEAN}
    :type/Integer             #{TINYINT SMALLINT INTEGER INT}
    :type/BigInteger          #{BIGINT}
    :type/Decimal             #{NUMERIC DECIMAL DEC}
    :type/Float               #{REAL FLOAT "DOUBLE PRECISION" DECFLOAT}
    :type/Text                #{CHARACTER
                                CHAR
                                (NATIONAL #{CHARACTER CHAR})
                                NCHAR
                                (#{CHARACTER CHAR} VARYING)
                                VARCHAR
                                (#{(NATIONAL #{CHARACTER CHAR}) NCHAR} VARYING)
                                VARCHAR_CASESENSITIVE
                                (#{CHARACTER CHAR} LARGE OBJECT)
                                CLOB
                                (#{NATIONAL CHARACTER NCHAR} LARGE OBJECT)
                                NCLOB}
    :type/UUID                #{UUID}
    :type/*                   #{ARRAY
                                BINARY
                                "BINARY VARYING"
                                VARBINARY
                                "BINARY LARGE OBJECT"
                                BLOB
                                GEOMETRY
                                IMAGE}
    :type/Date                #{DATE}
    :type/DateTime            #{TIMESTAMP}
    :type/Time                #{TIME "TIME WITHOUT TIME ZONE"}
    :type/TimeWithLocalTZ     #{"TIME WITH TIME ZONE"}
    :type/DateTimeWithLocalTZ #{"TIMESTAMP WITH TIME ZONE"}})

(def ^:private db-type->base-type
  (into {}
        (for [[base-type grammar] base-type->db-type-grammar
              db-type (expand-grammar grammar)]
          [(keyword db-type) base-type])))

(defmethod sql-jdbc.sync/database-type->base-type :h2
  [_ database-type]
  (db-type->base-type database-type))

;; These functions for exploding / imploding the options in the connection strings are here so we can override shady
;; options users might try to put in their connection string, like INIT=...

(defn file+options->connection-string
  "Implode the results of `connection-string->file+options` back into a connection string."
  [file options]
  (apply str file (for [[k v] options]
                    (str ";" k "=" v))))

(defn- connection-string-set-safe-options
  "Add Metabase Security Settings™ to this `connection-string` (i.e. try to keep shady users from writing nasty SQL)."
  [connection-string]
  {:pre [(string? connection-string)]}
  (let [[file options] (connection-string->file+options connection-string)]
    (file+options->connection-string file (merge
                                           (->> options
                                                ;; Remove INIT=... from options for security reasons (Metaboat #165)
                                                ;; http://h2database.com/html/features.html#execute_sql_on_connection
                                                (remove (fn [[k _]] (= (u/lower-case-en k) "init")))
                                                (into {}))
                                           {"IFEXISTS" "TRUE"}))))

(defmethod sql-jdbc.conn/connection-details->spec :h2
  [_ details]
  {:pre [(map? details)]}
  (driver-api/spec :h2 (cond-> details
                         (string? (:db details)) (update :db connection-string-set-safe-options))))

(defmethod sql-jdbc.sync/active-tables :h2
  [& args]
  ;; HACK: we assume that all h2 tables are writable
  (eduction (map #(assoc % :is_writable true))
            (apply sql-jdbc.sync/post-filtered-active-tables args)))

(defmethod sql-jdbc.sync/excluded-schemas :h2
  [_]
  #{"INFORMATION_SCHEMA"})

(defmethod sql-jdbc.execute/do-with-connection-with-options :h2
  [driver db-or-id-or-spec {:keys [write?], :as options} f]
  ;; h2 doesn't support setting timezones, or changing the transaction level without admin perms, so we can skip those
  ;; steps that are in the default impl
  (sql-jdbc.execute/do-with-resolved-connection
   driver
   db-or-id-or-spec
   (dissoc options :session-timezone)
   (fn [^java.sql.Connection conn]
     (when-not (sql-jdbc.execute/recursive-connection?)
       ;; in H2, setting readOnly to true doesn't prevent writes
       ;; see https://github.com/h2database/h2database/issues/1163
       (.setReadOnly conn (not write?)))
     (f conn))))

;; de-CLOB any CLOB values that come back
(defmethod sql-jdbc.execute/read-column-thunk :h2
  [_ ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (let [classname (some-> (.getColumnClassName rsmeta i)
                          (Class/forName true (driver-api/the-classloader)))]
    (if (isa? classname Clob)
      (fn []
        (driver-api/clob->str (.getObject rs i)))
      (fn []
        (.getObject rs i)))))

(defmethod sql-jdbc.execute/set-parameter [:h2 OffsetTime]
  [driver prepared-statement i t]
  (let [local-time (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))]
    (sql-jdbc.execute/set-parameter driver prepared-statement i local-time)))

(defmethod driver/incorporate-ssh-tunnel-details :h2
  [_ db-details]
  (if (and (:tunnel-enabled db-details) (ssh/ssh-tunnel-open? db-details))
    (if (and (:db db-details) (str/starts-with? (:db db-details) "tcp://"))
      (let [details (ssh/include-ssh-tunnel! db-details)
            db      (:db details)]
        (assoc details :db (str/replace-first db (str (:orig-port details)) (str (:tunnel-entrance-port details)))))
      (do (log/error "SSH tunnel can only be established for H2 connections using the TCP protocol")
          db-details))
    db-details))

(defmethod driver/upload-type->database-type :h2
  [_driver upload-type]
  (case upload-type
    :metabase.upload/varchar-255              [:varchar]
    :metabase.upload/text                     [:varchar]
    :metabase.upload/int                      [:bigint]
    :metabase.upload/auto-incrementing-int-pk [:bigint :generated-always :as :identity]
    :metabase.upload/float                    [(keyword "DOUBLE PRECISION")]
    :metabase.upload/boolean                  [:boolean]
    :metabase.upload/date                     [:date]
    :metabase.upload/datetime                 [:timestamp]
    :metabase.upload/offset-datetime          [:timestamp-with-time-zone]))

(defmulti ^:private type->database-type
  "Internal type->database-type multimethod for H2 that dispatches on type."
  {:arglists '([type])}
  identity)

(defmethod type->database-type :type/TextLike [_] [:varchar])
(defmethod type->database-type :type/Text [_] [:varchar])
(defmethod type->database-type :type/Integer [_] [:int])
(defmethod type->database-type :type/Number [_] [:bigint])
(defmethod type->database-type :type/BigInteger [_] [:bigint])
(defmethod type->database-type :type/Float [_] [(keyword "DOUBLE PRECISION")])
(defmethod type->database-type :type/Decimal [_] [:decimal])
(defmethod type->database-type :type/Boolean [_] [:boolean])
(defmethod type->database-type :type/Date [_] [:date])
(defmethod type->database-type :type/DateTime [_] [:timestamp])
(defmethod type->database-type :type/DateTimeWithTZ [_] [:timestamp-with-time-zone])
(defmethod type->database-type :type/Time [_] [:time])
(defmethod type->database-type :type/TimeWithTZ [_] [:time-with-time-zone])
(defmethod type->database-type :type/UUID [_] [:uuid])

(defmethod driver/type->database-type :h2
  [_driver base-type]
  (type->database-type base-type))

(defmethod driver/create-auto-pk-with-append-csv? :h2 [_driver] true)

(defmethod driver/table-name-length-limit :h2
  [_driver]
  ;; http://www.h2database.com/html/advanced.html#limits_limitations
  256)

(defmethod driver/add-columns! :h2
  [driver db-id table-name column-definitions & {:as settings}]
  ;; Workaround for the fact that H2 uses different syntax for adding multiple columns, which is difficult to
  ;; produce with HoneySQL. As a simpler workaround we instead break it up into single column statements.
  (let [f (get-method driver/add-columns! :sql-jdbc)]
    (doseq [[k v] column-definitions]
      (f driver db-id table-name {k v} settings))))

(defmethod driver/alter-table-columns! :h2
  [driver db-id table-name column-definitions & opts]
  ;; H2 doesn't support altering multiple columns at a time, so we break it up into individual ALTER TABLE statements
  (let [f (get-method driver/alter-table-columns! :sql-jdbc)]
    (doseq [[k v] column-definitions]
      (apply f driver db-id table-name {k v} opts))))

(defmethod driver/allowed-promotions :h2
  [_driver]
  {:metabase.upload/int     #{:metabase.upload/float}
   :metabase.upload/boolean #{:metabase.upload/int
                              :metabase.upload/float}})

(defmethod sql-jdbc/impl-query-canceled? :h2 [_ ^SQLException e]
  ;; ok to hardcode driver name here because this function only supports app DB types
  (driver-api/query-canceled-exception? :h2 e))

(defmethod sql-jdbc/impl-table-known-to-not-exist? :h2
  [_ e]
  (#{"42S02" "42S03" "42S04"} (sql-jdbc/get-sql-state e)))

(defmethod sql.normalize/normalize-unquoted-name :h2
  [_ name-str]
  (u/upper-case-en name-str))

(defmethod sql/default-schema :h2
  [_]
  "PUBLIC")

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Workspace Isolation                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- replace-credentials
  "Replace USER and PASSWORD in an H2 connection string."
  [connection-string new-user new-password]
  (let [[file options] (connection-string->file+options connection-string)]
    (file+options->connection-string file (assoc options "USER" new-user "PASSWORD" new-password))))

(defn- get-user-from-connection-string
  "Extract the USER from an H2 connection string."
  [connection-string]
  (let [[_file options] (connection-string->file+options connection-string)]
    (get options "USER")))

(defmethod driver/init-workspace-isolation! :h2
  [_driver database workspace]
  (let [schema-name (driver.u/workspace-isolation-namespace-name workspace)
        username    (driver.u/workspace-isolation-user-name workspace)
        password    (driver.u/random-workspace-password)
        ;; H2 embeds credentials in the :db connection string, so we need to build a new one
        original-db (get-in database [:details :db])
        new-db      (replace-credentials original-db username password)]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [^Statement stmt (.createStatement ^Connection (:connection t-conn))]
        (doseq [sql [(format "CREATE USER IF NOT EXISTS \"%s\" PASSWORD '%s'" username password)
                     (format "CREATE SCHEMA IF NOT EXISTS \"%s\" AUTHORIZATION \"%s\"" schema-name username)
                     (format "GRANT ALL ON SCHEMA \"%s\" TO \"%s\"" schema-name username)]]
          (.addBatch ^Statement stmt ^String sql))
        (.executeBatch ^Statement stmt)))
    {:schema           schema-name
     :database_details {:db new-db}}))

(defmethod driver/destroy-workspace-isolation! :h2
  [_driver database workspace]
  (let [schema-name (driver.u/workspace-isolation-namespace-name workspace)
        username    (driver.u/workspace-isolation-user-name workspace)]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [^Statement stmt (.createStatement ^Connection (:connection t-conn))]
        (doseq [sql [;; CASCADE drops all objects (tables, etc.) in the schema
                     (format "DROP SCHEMA IF EXISTS \"%s\" CASCADE" schema-name)
                     (format "DROP USER IF EXISTS \"%s\"" username)]]
          (.addBatch ^Statement stmt ^String sql))
        (.executeBatch ^Statement stmt)))))

(defmethod driver/grant-workspace-read-access! :h2
  [_driver database workspace tables]
  (let [username (-> workspace :database_details :db get-user-from-connection-string)
        schemas  (distinct (map :schema tables))]
    ;; H2 uses GRANT SELECT ON SCHEMA schemaName TO userName
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [^Statement stmt (.createStatement ^Connection (:connection t-conn))]
        (doseq [schema schemas]
          (.addBatch ^Statement stmt
                     ^String (format "GRANT SELECT ON SCHEMA \"%s\" TO \"%s\"" schema username)))
        ;; Also grant on individual tables for more fine-grained access
        (doseq [table tables]
          (.addBatch ^Statement stmt
                     ^String (format "GRANT SELECT ON \"%s\".\"%s\" TO \"%s\""
                                     (:schema table) (:name table) username)))
        (.executeBatch ^Statement stmt)))))

(defmethod driver/llm-sql-dialect-resource :h2 [_]
  "llm/prompts/dialects/h2.md")
