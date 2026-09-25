(ns metabase.app-db.sqlite
  "SQLite application database connection and value conventions. Independent of the warehouse driver."
  (:require
   [clojure.string :as str]
   [metabase.util :as u])
  (:import
   (java.sql Connection ResultSet ResultSetMetaData)
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZoneOffset ZonedDateTime)
   (java.time.format DateTimeFormatter)
   (org.sqlite SQLiteConfig$TransactionMode SQLiteConnection)))

(set! *warn-on-reflection* true)

(defn connection?
  "Whether `connection` wraps an SQLite JDBC connection."
  [^Connection connection]
  (or (instance? SQLiteConnection connection)
      (.isWrapperFor connection SQLiteConnection)))

(defn initialize-connection!
  "Configure every app DB connection, including unpooled migration and Quartz connections.
  IMMEDIATE reserves the writer before a read/write transaction takes its snapshot."
  ^Connection [^Connection connection]
  (let [^SQLiteConnection sqlite (.unwrap connection SQLiteConnection)]
    (.setTransactionMode (.getConnectionConfig sqlite) SQLiteConfig$TransactionMode/IMMEDIATE)
    (with-open [stmt (.createStatement connection)]
      (.execute stmt "PRAGMA busy_timeout = 5000")
      (.execute stmt "PRAGMA foreign_keys = ON")
      (.execute stmt "PRAGMA journal_mode = WAL")
      (.execute stmt "PRAGMA synchronous = FULL"))
    connection))

(def ^:private timestamp-format
  ;; A fixed width keeps bound values, SQL defaults and date arithmetic lexically comparable.
  (DateTimeFormatter/ofPattern "yyyy-MM-dd HH:mm:ss.SSSSSS"))

(defn temporal-value
  "Encode temporal parameters as ISO text; timestamps with offsets are normalized to UTC."
  [value]
  (cond
    (instance? Instant value) (recur (OffsetDateTime/ofInstant value ZoneOffset/UTC))
    (instance? ZonedDateTime value) (recur (.toOffsetDateTime ^ZonedDateTime value))
    (instance? OffsetDateTime value) (.format (.toLocalDateTime (.withOffsetSameInstant ^OffsetDateTime value ZoneOffset/UTC)) timestamp-format)
    (instance? LocalDateTime value) (.format ^LocalDateTime value timestamp-format)
    (instance? OffsetTime value) (str (.toLocalTime (.withOffsetSameInstant ^OffsetTime value ZoneOffset/UTC)))
    :else (str value)))

(defn read-column
  "Read by declared type: SQLite reports booleans as integers and timestamps as strings."
  [^ResultSet rs ^ResultSetMetaData metadata ^long i]
  (let [type-name (u/upper-case-en (.getColumnTypeName metadata i))]
    (cond
      (contains? #{"BOOLEAN" "BOOL"} type-name)
      (let [value (.getBoolean rs i)] (when-not (.wasNull rs) value))

      (or (str/starts-with? type-name "TIMESTAMP") (= type-name "DATETIME"))
      (when-let [s (.getString rs i)]
        (let [value (LocalDateTime/parse (str/replace s " " "T"))]
          (if (str/includes? type-name "WITH TIME ZONE")
            (.atOffset value ZoneOffset/UTC)
            value)))

      (= type-name "DATE")
      (some-> (.getString rs i) LocalDate/parse)

      (= type-name "TIME")
      (some-> (.getString rs i) LocalTime/parse)

      :else (.getObject rs i))))
