(ns metabase.driver.h2
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.db.jdbc-protocols :as mdb.jdbc-protocols]
   [metabase.db.spec :as mdb.spec]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.driver.h2.actions :as h2.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.plugins.classloader :as classloader]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.upload :as upload]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.ssh :as ssh])
  (:import
   (java.sql Clob ResultSet ResultSetMetaData)
   (java.time OffsetTime)
   (org.h2.command CommandInterface Parser)
   (org.h2.engine SessionLocal)))

(set! *warn-on-reflection* true)

;; method impls live in this namespace
(comment h2.actions/keep-me)

(driver/register! :h2, :parent :sql-jdbc)

(def ^:dynamic *allow-testing-h2-connections*
  "Whether to allow testing new H2 connections. Normally this is disabled, which effectively means you cannot create new
  H2 databases from the API, but this flag is here to disable that behavior for syncing existing databases, or when
  needed for tests."
  ;; you can disable this flag with the env var below, please do not use it under any circumstances, it is only here so
  ;; existing e2e tests will run without us having to update a million tests. We should get rid of this and rework those
  ;; e2e tests to use SQLite ASAP.
  (or (config/config-bool :mb-dangerous-unsafe-enable-testing-h2-connections-do-not-enable)
      false))

;;; this will prevent the H2 driver from showing up in the list of options when adding a new Database.
(defmethod driver/superseded-by :h2 [_driver] :deprecated)

(defmethod sql.qp/honey-sql-version :h2
  [_driver]
  2)

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

(doseq [[feature supported?] {:full-join                 false
                              :regex                     true
                              :percentile-aggregations   false
                              :actions                   true
                              :actions/custom            true
                              :datetime-diff             true
                              :now                       true
                              :test/jvm-timezone-setting false
                              :uploads                   true}]
  (defmethod driver/database-supports? [:h2 feature]
    [_driver _feature _database]
    supported?))

(defmethod sql.qp/->honeysql [:h2 :regex-match-first]
  [driver [_ arg pattern]]
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
   (map u/one-or-many)
   (apply concat)))

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
  (when-not *allow-testing-h2-connections*
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
(defn- connection-string->file+options
  "Explode a `connection-string` like `file:my-db;OPTION=100;OPTION_2=TRUE` to a pair of file and an options map.

    (connection-string->file+options \"file:my-crazy-db;OPTION=100;OPTION_X=TRUE\")
      -> [\"file:my-crazy-db\" {\"OPTION\" \"100\", \"OPTION_X\" \"TRUE\"}]"
  [^String connection-string]
  {:pre [(string? connection-string)]}
  (let [[file & options] (str/split connection-string #";+")
        options          (into {} (for [option options]
                                    (str/split option #"=")))]
    [file options]))

(defn- db-details->user [{:keys [db], :as details}]
  {:pre [(string? db)]}
  (or (some (partial get details) ["USER" :USER])
      (let [[_ {:strs [USER]}] (connection-string->file+options db)]
        USER)))

(defn- check-native-query-not-using-default-user [{query-type :type, :as query}]
  (u/prog1 query
    ;; For :native queries check to make sure the DB in question has a (non-default) NAME property specified in the
    ;; connection string. We don't allow SQL execution on H2 databases for the default admin account for security
    ;; reasons
    (when (= (keyword query-type) :native)
      (let [{:keys [details]} (lib.metadata/database (qp.store/metadata-provider))
            user              (db-details->user details)]
        (when (or (str/blank? user)
                  (= user "sa"))        ; "sa" is the default USER
          (throw
           (ex-info (tru "Running SQL queries against H2 databases using the default (admin) database user is forbidden.")
                    {:type qp.error-type/db})))))))


(defn- make-h2-parser
  "Returns an H2 Parser object for the given (H2) database ID"
  ^Parser [h2-db-id]
  (with-open [conn (.getConnection (sql-jdbc.execute/datasource-with-diagnostic-info! :h2 h2-db-id))]
    ;; The H2 Parser class is created from the H2 JDBC session, but these fields are not public
    (let [session (-> conn (get-field "inner") (get-field "session"))]
      ;; Only SessionLocal represents a connection we can create a parser with. Remote sessions and other
      ;; session types are ignored.
      (when (instance? SessionLocal session)
        (Parser. session)))))

(mu/defn ^:private classify-query :- [:maybe
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
  [database query]
  (when-let [h2-parser (make-h2-parser database)]
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

(defn- check-read-only-statements [{:keys [database] {:keys [query]} :native}]
  (when query
    (let [query-classification (classify-query database query)]
      (when-not (read-only-statements? query-classification)
        (throw (ex-info "Only SELECT statements are allowed in a native query."
                        {:classification query-classification}))))))

(defmethod driver/execute-reducible-query :h2
  [driver query chans respond]
  (check-native-query-not-using-default-user query)
  (check-read-only-statements query)
  ((get-method driver/execute-reducible-query :sql-jdbc) driver query chans respond))

(defmethod driver/execute-write-query! :h2
  [driver query]
  (check-native-query-not-using-default-user query)
  (check-action-commands-allowed query)
  ((get-method driver/execute-write-query! :sql-jdbc) driver query))

(defmethod sql.qp/add-interval-honeysql-form :h2
  [driver hsql-form amount unit]
  (cond
    (= unit :quarter)
    (recur driver hsql-form (h2x/* amount 3) :month)

    ;; H2 only supports long ints in the `dateadd` amount field; since we want to support fractional seconds (at least
    ;; for application DB purposes) convert to `:millisecond`
    (and (= unit :second)
         (not (zero? (rem amount 1))))
    (recur driver hsql-form (* amount 1000.0) :millisecond)

    :else
    [:dateadd
     (h2x/literal unit)
     (h2x/cast :long (if (number? amount)
                       (sql.qp/inline-num amount)
                       amount))
     (h2x/cast :datetime hsql-form)]))

(defmethod driver/humanize-connection-error-message :h2
  [_ message]
  (condp re-matches message
    #"^A file path that is implicitly relative to the current working directory is not allowed in the database URL .*$"
    :implicitly-relative-db-file-path

    #"^Database .* not found, .*$"
    :db-file-not-found

    #"^Wrong user name or password .*$"
    :username-or-password-incorrect

    message))

(defmethod driver/db-default-timezone :h2
  [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver database nil
   (fn [^java.sql.Connection conn]
     (with-open [stmt (.prepareStatement conn "select current_timestamp();")
                 rset (.executeQuery stmt)]
       (when (.next rset)
         (when-let [zoned-date-time (.getObject rset 1 java.time.ZonedDateTime)]
           (t/zone-id zoned-date-time)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/current-datetime-honeysql-form :h2
  [_]
  (h2x/with-database-type-info :%now :TIMESTAMP))

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

;; H2 v2 added date_trunc and extract, so we can borrow the Postgres implementation
(defn- date-trunc [unit expr] [:date_trunc (h2x/literal unit) expr])
(defn- extract [unit expr] [::h2x/extract unit expr])

(def ^:private extract-integer (comp h2x/->integer extract))

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
  [driver [_ field]]
  [:log10 (sql.qp/->honeysql driver field)])

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
                                NCLOB
                                UUID}
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

(defn- file+options->connection-string
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
  (mdb.spec/spec :h2 (cond-> details
                       (string? (:db details)) (update :db connection-string-set-safe-options))))

(defmethod sql-jdbc.sync/active-tables :h2
  [& args]
  (apply sql-jdbc.sync/post-filtered-active-tables args))

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
                          (Class/forName true (classloader/the-classloader)))]
    (if (isa? classname Clob)
      (fn []
        (mdb.jdbc-protocols/clob->str (.getObject rs i)))
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
      (do (log/error (tru "SSH tunnel can only be established for H2 connections using the TCP protocol"))
          db-details))
    db-details))

(defmethod driver/upload-type->database-type :h2
  [_driver upload-type]
  (case upload-type
    ::upload/varchar-255              [:varchar]
    ::upload/text                     [:varchar]
    ::upload/int                      [:bigint]
    ::upload/auto-incrementing-int-pk [:bigint :generated-always :as :identity :primary-key]
    ::upload/float                    [(keyword "DOUBLE PRECISION")]
    ::upload/boolean                  [:boolean]
    ::upload/date                     [:date]
    ::upload/datetime                 [:timestamp]
    ::upload/offset-datetime          [:timestamp-with-time-zone]))

(defmethod driver/table-name-length-limit :h2
  [_driver]
  ;; http://www.h2database.com/html/advanced.html#limits_limitations
  256)
