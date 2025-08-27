(ns metabase.driver.clickhouse
  "Driver for ClickHouse databases"
  (:require
   [clojure.core.memoize :as memoize]
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
   [metabase.driver.sql.util :as sql.u]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import  [com.clickhouse.client.api.query QuerySettings]
            [java.sql SQLException]))

(set! *warn-on-reflection* true)

(System/setProperty "clickhouse.jdbc.v2" "true")
(driver/register! :clickhouse :parent #{:sql-jdbc})

(defmethod driver/display-name :clickhouse [_] "ClickHouse")

(defmethod driver/prettify-native-form :clickhouse
  [_ native-form]
  (sql.u/format-sql-and-fix-params :mysql native-form))

(doseq [[feature supported?] {:standard-deviation-aggregations true
                              :now                             true
                              :set-timezone                    true
                              :convert-timezone                false
                              :test/jvm-timezone-setting       false
                              :test/date-time-type             false
                              :test/time-type                  false
                              :datetime-diff                   true
                              :expression-literals             true
                              :expressions/integer             true
                              :expressions/float               true
                              :expressions/text                true
                              :expressions/date                true
                              :split-part                      true
                              :upload-with-auto-pk             false
                              :window-functions/offset         false
                              :window-functions/cumulative     (not driver-api/is-test?)
                              :left-join                       (not driver-api/is-test?)
                              :describe-fks                    false
                              :actions                         false
                              :metadata/key-constraints        (not driver-api/is-test?)
                              :database-routing                true}]
  (defmethod driver/database-supports? [:clickhouse feature] [_driver _feature _db] supported?))

(defmethod driver/database-supports? [:clickhouse :schemas]
  [_driver _feature db]
  (boolean (:enable-multiple-db (:details db))))

(def ^:private default-connection-details
  {:user "default" :password "" :dbname "default" :host "localhost" :port 8123})

(defn- connection-details->spec* [details]
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
         :max_open_connections           (or max-open-connections 100)
         ;; see also: https://clickhouse.com/docs/en/integrations/java#configuration
         :custom_http_params             (or clickhouse-settings "")}
        (sql-jdbc.common/handle-additional-options details :separator-style :url))))

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

(def ^:private ^{:arglists '([db-details])} cloud?
  "Returns true if the `db-details` are for a ClickHouse Cloud instance, and false otherwise. If it fails to connect
   to the database, it throws a java.sql.SQLException."
  (memoize/ttl
   (fn [db-details]
     (let [spec (connection-details->spec* db-details)]
       (sql-jdbc.execute/do-with-connection-with-options
        :clickhouse spec nil
        (fn [^java.sql.Connection conn]
          (with-open [stmt (.createStatement conn)
                      rset (.executeQuery stmt "SELECT value='1' FROM system.settings WHERE name='cloud_mode'")]
            (if (.next rset) (.getBoolean rset 1) false))))))
   ;; cache the results for 48 hours; TTL is here only to eventually clear out old entries
   :ttl/threshold (* 48 60 60 1000)))

(defmethod sql-jdbc.conn/connection-details->spec :clickhouse
  [_ details]
  (cond-> (connection-details->spec* details)
    (try (cloud? details)
         (catch java.sql.SQLException _e
           false))
    ;; select_sequential_consistency guarantees that we can query data from any replica in CH Cloud
    ;; immediately after it is written
    (assoc :select_sequential_consistency true)))

(defmethod driver/database-supports? [:clickhouse :uploads] [_driver _feature db]
  (if (:details db)
    (try (cloud? (:details db))
         (catch java.sql.SQLException _e
           false))
    false))

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

(defmethod driver/table-name-length-limit :clickhouse
  [_driver]
  ;; FIXME: This is a lie because you're really limited by a filesystems' limits, because Clickhouse uses
  ;; filenames as table/column names. But its an approximation
  206)

(defn- quote-name [s]
  (let [parts (str/split (name s) #"\.")]
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
       (.execute stmt (create-table!-sql driver table-name column-definitions :primary-key primary-key))))))

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
    (try (clickhouse-version/is-at-least? 24 4 db)
         (catch Throwable _e
           false))
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
  (str/starts-with? (.getMessage e) "Code: 60."))
