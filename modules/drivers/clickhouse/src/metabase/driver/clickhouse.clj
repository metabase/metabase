(ns metabase.driver.clickhouse
  "Driver for ClickHouse databases"
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.clickhouse-introspection]
   [metabase.driver.clickhouse-nippy]
   [metabase.driver.clickhouse-qp]
   [metabase.driver.clickhouse-version :as clickhouse-version]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import  [com.clickhouse.client.api.query QuerySettings]
            [java.sql SQLException PreparedStatement]
            [java.time LocalDate]))

(set! *warn-on-reflection* true)

(System/setProperty "clickhouse.jdbc.v2" "true")
(driver/register! :clickhouse :parent #{:sql-jdbc})

(defmethod driver/display-name :clickhouse [_] "ClickHouse")

(defmethod driver/prettify-native-form :clickhouse
  [_ native-form]
  (sql.u/format-sql-and-fix-params :mysql native-form))

(doseq [[feature supported?] {:actions                          false
                              :convert-timezone                 false
                              :database-routing                 false
                              :datetime-diff                    true
                              :describe-default-expr            true
                              :describe-fks                     false
                              ;; JDBC driver always provides "NO" for the IS_GENERATEDCOLUMN JDBC metadata
                              :describe-is-generated            false
                              :describe-is-nullable             true
                              :expression-literals              true
                              :expressions/date                 true
                              :expressions/float                true
                              :expressions/integer              true
                              :expressions/text                 true
                              :left-join                        (not driver-api/is-test?)
                              :metadata/key-constraints         false
                              :now                              true
                              :regex/lookaheads-and-lookbehinds false
                              :rename                           true
                              :schemas                          true
                              :set-timezone                     true
                              :split-part                       true
                              :standard-deviation-aggregations  true
                              :test/date-time-type              false
                              :test/jvm-timezone-setting        false
                              :test/time-type                   false
                              :transforms/python                true
                              :transforms/table                 true
                              :upload-with-auto-pk              false
                              :window-functions/cumulative      (not driver-api/is-test?)
                              :window-functions/offset          false}]
  (defmethod driver/database-supports? [:clickhouse feature] [_driver _feature _db] supported?))

(def ^:private default-connection-details
  {:user "default" :password "" :dbname "default" :host "localhost" :port 8123})

(defmethod sql-jdbc.execute/do-with-connection-with-options :clickhouse
  [driver db-or-id-or-spec {:keys [^String session-timezone _write?] :as options} f]
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
     (when-not (sql-jdbc.execute/recursive-connection?)
       (when session-timezone
         (let [^com.clickhouse.jdbc.ConnectionImpl clickhouse-conn (.unwrap conn com.clickhouse.jdbc.ConnectionImpl)
               query-settings  (new QuerySettings)]
           (.setOption query-settings "session_timezone" session-timezone)
           (.setDefaultQuerySettings clickhouse-conn query-settings)))
       (sql-jdbc.execute/set-best-transaction-level! driver conn)
       (sql-jdbc.execute/set-time-zone-if-supported! driver conn session-timezone))
     (f conn))))

(defmethod sql-jdbc.conn/connection-details->spec :clickhouse
  [_ details]
  (let [;; ensure defaults merge on top of nils
        details (reduce-kv (fn [m k v] (assoc m k (or v (k default-connection-details))))
                           default-connection-details
                           details)
        {:keys [user password dbname host port ssl clickhouse-settings max-open-connections]} details
        host   (cond ; JDBCv1 used to accept schema in the `host` configuration option
                 (str/starts-with? host "http://")  (subs host 7)
                 (str/starts-with? host "https://") (subs host 8)
                 :else host)]
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
         :select_sequential_consistency  true
         :max_open_connections           (or max-open-connections 100)
         ;; see also: https://clickhouse.com/docs/en/integrations/java#configuration
         :custom_http_params             (or clickhouse-settings "")}
        (sql-jdbc.common/handle-additional-options details :separator-style :url))))

(defmethod driver/database-supports? [:clickhouse :uploads] [_driver _feature db]
  (boolean (-> db clickhouse-version/dbms-version :cloud)))

(defmethod driver/can-connect? :clickhouse
  [driver details]
  (if driver-api/is-test?
    (try
      ;; Default SELECT 1 is not enough for Metabase test suite,
      ;; as it works slightly differently than expected there
      (let [spec  (sql-jdbc.conn/connection-details->spec driver details)
            db    (ddl.i/format-name driver (or (:dbname details) (:db details) "default"))]
        (sql-jdbc.execute/do-with-connection-with-options
         driver spec nil
         (fn [^java.sql.Connection conn]
           (let [stmt (.prepareStatement conn "SELECT count(*) > 0 FROM system.databases WHERE name = ?")
                 _    (.setString stmt 1 db)
                 rset (.executeQuery stmt)]
             (when (.next rset)
               (.getBoolean rset 1))))))
      (catch Throwable e
        (log/error e "An exception during ClickHouse connectivity check")
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
  ;; FIXME: This is a lie because you're really limited by a filesystems' limits, because Clickhouse uses
  ;; filenames as table/column names. But its an approximation
  206)

(defn- quote-name [s]
  (let [s (if (and (keyword? s) (namespace s)) (str (namespace s) "." (name s)) s)
        parts (filter identity (str/split (name s) #"\."))]
    (str/join "." (map #(str "`" % "`") parts))))

(defn- create-table!-sql
  "Creates a ClickHouse table with the given name and column definitions. It assumes the engine is MergeTree,
   so it only works with Clickhouse Cloud and single node on-premise deployments at the moment."
  [_driver table-name column-definitions & {:keys [primary-key] :as opts}]
  (str/join "\n"
            [(#'sql-jdbc/create-table!-sql :sql-jdbc table-name column-definitions opts)
             "ENGINE = MergeTree"
             (format "ORDER BY (%s)" (str/join ", " (map quote-name primary-key)))
             ;; disable insert idempotency to allow duplicate inserts
             "SETTINGS replicated_deduplication_window = 0"]))

(defmethod driver/create-table! :clickhouse
  [driver db-id table-name column-definitions & {:keys [primary-key]}]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   db-id
   {:write? true}
   (fn [^java.sql.Connection conn]
     (with-open [stmt (.createStatement conn)]
       (let [sql (create-table!-sql driver table-name column-definitions :primary-key primary-key)]
         (.execute stmt sql))))))

;; rename-tables!* only supported by the atomic engine
;; https://clickhouse.com/docs/engines/database-engines/atomic#exchange-tables

(defmethod driver/rename-table! :clickhouse
  [_driver db-id old-table-name new-table-name]
  (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db-id)]
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

(defmethod driver.sql/set-role-statement :clickhouse
  [_ role]
  (let [default-role (driver.sql/default-database-role :clickhouse nil)
        quote-if-needed (fn [r]
                          (if (or (re-matches #"\".*\"" r) (= role default-role))
                            r
                            (format "\"%s\"" r)))
        quoted-role (->> (str/split role #",")
                         (map quote-if-needed)
                         (str/join ","))
        statement   (format "SET ROLE %s" quoted-role)]
    statement))

(defmethod driver.sql/default-database-role :clickhouse
  [_ _]
  "NONE")

(defmethod sql-jdbc/impl-table-known-to-not-exist? :clickhouse
  [_ ^SQLException e]
  ;; the clickhouse driver doesn't set ErrorCode, we must parse it from the message
  (let [msg (.getMessage e)]
    (or (str/starts-with? msg "Code: 60")
        (str/starts-with? msg "Code: 81"))))

(defmethod driver/compile-transform :clickhouse
  [driver {:keys [query output-table]}]
  (let [{sql-query :query sql-params :params} query
        pieces [(sql.qp/format-honeysql driver {:create-table output-table})
                ;; TODO(rileythomp, 2025-08-22): Is there a better way to do this?
                ;; i.e. only do this if we don't have a non-nullable field to use as a primary key?
                (sql.qp/format-honeysql driver {:raw "ORDER BY ()"})
                ["AS"]
                [sql-query sql-params]]
        sql (str/join " " (map first pieces))]
    (into [sql] (mapcat rest) pieces)))

(defmethod driver/compile-insert :clickhouse
  [driver {:keys [query output-table]}]
  (let [{sql-query :query sql-params :params} query]
    [(first (sql.qp/format-honeysql driver {:insert-into [output-table {:raw sql-query}]}))
     sql-params]))

(defmethod driver/create-schema-if-needed! :clickhouse
  [driver conn-spec schema]
  (let [sql [[(format "CREATE DATABASE IF NOT EXISTS `%s`;" schema)]]]
    (driver/execute-raw-queries! driver conn-spec sql)))

#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod driver/describe-table-fks :clickhouse
  [_driver _database _table]
  (log/warn "Clickhouse does not support foreign keys. `describe-table-fks` should not have been called!")
  #{})

;; Override clickhouse to not pass in the Types/DATE parameter due to jdbc
;; driver issue: https://github.com/ClickHouse/clickhouse-java/issues/2701
(defmethod sql-jdbc.execute/set-parameter [:clickhouse LocalDate]
  [_ ^PreparedStatement prepared-statement i object]
  (.setObject prepared-statement i object))

(defmethod sql-jdbc.conn/data-warehouse-connection-pool-properties :clickhouse
  [driver database]
  (merge
   ((get-method sql-jdbc.conn/data-warehouse-connection-pool-properties :sql-jdbc) driver database)
   ;; TODO(rileythomp, 2026-01-29): Remove this once we upgrade past 0.8.4
   ;; This is to work around 68674 where connections are being poisoned with bad roles
   {"preferredTestQuery" "SELECT 1"}))
