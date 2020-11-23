(ns metabase.db.jdbc-protocols
  "Implementations of `clojure.java.jdbc` protocols for the Metabase application database. These handle type mappings
  for setting parameters and for reading results from the DB — mainly by automatically converting CLOBs to Strings and
  using new `java.time` classes."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.plugins.classloader :as classloader]
            [metabase.util.date-2 :as u.date])
  (:import java.io.BufferedReader
           [java.sql PreparedStatement ResultSet ResultSetMetaData Types]
           [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime ZoneOffset]))

(def ^:private db-type
  (delay
    (classloader/require 'metabase.db)
    ((resolve 'metabase.db/db-type))))

(defn- set-object
  [^PreparedStatement stmt ^Integer index object ^Integer target-sql-type]
  (.setObject stmt index object target-sql-type))

(extend-protocol jdbc/ISQLParameter
  ;; DB's don't seem to handle Instant correctly so convert it to an OffsetDateTime with zone offset = 0
  Instant
  (set-parameter [t stmt i]
    (jdbc/set-parameter (t/offset-date-time t (t/zone-offset 0)) stmt i))

  LocalDate
  (set-parameter [t stmt i]
    (set-object stmt i t Types/DATE))

  LocalDateTime
  (set-parameter [t stmt i]
    (set-object stmt i t Types/TIMESTAMP))

  LocalTime
  (set-parameter [t stmt i]
    (set-object stmt i t Types/TIME))

  OffsetDateTime
  (set-parameter [t stmt i]
    (if (= @db-type :mysql)
      ;; Regardless of session timezone it seems to be the case that OffsetDateTimes get normalized to UTC inside MySQL
      ;;
      ;; Since MySQL TIMESTAMPs aren't timezone-aware this means comparisons are done between timestamps in the report
      ;; timezone and the local datetime portion of the parameter, in UTC. Bad!
      ;;
      ;; Convert it to a LocalDateTime, in the report timezone, so comparisions will work correctly.
      ;;
      ;; See also — https://dev.mysql.com/doc/refman/5.5/en/datetime.html
      (let [offset (.. (t/zone-id) getRules (getOffset (t/instant t)))
            t      (t/local-date-time (t/with-offset-same-instant t offset))]
        (set-object stmt i t Types/TIMESTAMP))
      ;; h2 and Postgres work as expected
      (set-object stmt i t Types/TIMESTAMP_WITH_TIMEZONE)))

  ;; MySQL, Postgres, and H2 all don't support OffsetTime
  OffsetTime
  (set-parameter [t stmt i]
    (set-object stmt i (t/local-time (t/with-offset-same-instant t (t/zone-offset 0))) Types/TIME))

  ;; Similarly, none of them handle ZonedDateTime out of the box either, so convert it to an OffsetDateTime first
  ZonedDateTime
  (set-parameter [t stmt i]
    (jdbc/set-parameter (t/offset-date-time t) stmt i)))

(defn clob->str
  "Convert an H2 clob to a String."
  ^String [^org.h2.jdbc.JdbcClob clob]
  (when clob
    (letfn [(->str [^BufferedReader buffered-reader]
              (loop [acc []]
                (if-let [line (.readLine buffered-reader)]
                  (recur (conj acc line))
                  (str/join "\n" acc))))]
      (with-open [reader (.getCharacterStream clob)]
        (if (instance? BufferedReader reader)
          (->str reader)
          (with-open [buffered-reader (BufferedReader. reader)]
            (->str buffered-reader)))))))

(extend-protocol jdbc/IResultSetReadColumn
  org.postgresql.util.PGobject
  (result-set-read-column [clob _ _]
    (.getValue clob))

  org.h2.jdbc.JdbcClob
  (result-set-read-column [clob _ _]
    (clob->str clob))

  org.h2.api.TimestampWithTimeZone
  (result-set-read-column [t _ _]
    (let [date        (t/local-date (.getYear t) (.getMonth t) (.getDay t))
          time        (LocalTime/ofNanoOfDay (.getNanosSinceMidnight t))
          zone-offset (ZoneOffset/ofTotalSeconds (* (.getTimeZoneOffsetMins t) 60))]
      (t/offset-date-time date time zone-offset))))

(defmulti ^:private read-column
  {:arglists '([rs rsmeta i])}
  (fn [_ ^ResultSetMetaData rsmeta ^Integer i]
    (.getColumnType rsmeta i)))

(defmethod read-column :default
  [^ResultSet rs _ ^Integer i]
  (.getObject rs i))

(defmethod read-column Types/TIMESTAMP
  [^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (case @db-type
    :postgres
    ;; for some reason postgres `TIMESTAMP WITH TIME ZONE` columns still come back as `Type/TIMESTAMP`, which seems
    ;; like a bug with the JDBC driver?
    (let [^Class klass (if (= (str/lower-case (.getColumnTypeName rsmeta i)) "timestamptz")
                         OffsetDateTime
                         LocalDateTime)]
      (.getObject rs i klass))

    :mysql
    ;; MySQL TIMESTAMPS are actually TIMESTAMP WITH LOCAL TIME ZONE, i.e. they are stored normalized to UTC when stored.
    ;; However, MySQL returns them in the report time zone in an effort to make our lives horrible.
    ;;
    ;; Check and see if the column type is `TIMESTAMP` (as opposed to `DATETIME`, which is the equivalent of
    ;; LocalDateTime), and normalize it to a UTC timestamp if so.
    (when-let [t (.getObject rs i LocalDateTime)]
      (if (= (.getColumnTypeName rsmeta i) "TIMESTAMP")
        (t/with-offset-same-instant (t/offset-date-time t (t/zone-id)) (t/zone-offset 0))
        t))

    ;; h2
    (.getObject rs i LocalDateTime)))

(defmethod read-column Types/TIMESTAMP_WITH_TIMEZONE
  [^ResultSet rs _ ^Integer i]
  (.getObject rs i OffsetDateTime))

(defmethod read-column Types/DATE
  [^ResultSet rs _ ^Integer i]
  (.getObject rs i LocalDate))

(defmethod read-column Types/TIME
  [^ResultSet rs _ ^Integer i]
  (case @db-type
    :postgres
    ;; Sometimes Postgres times come back as strings like `07:23:18.331+00` (no minute in offset) and there's a bug in
    ;; the JDBC driver where it can't parse those correctly. We can do it ourselves in that case.
    (try
      (.getObject rs i LocalTime)
      (catch Throwable _
        (when-let [s (.getString rs i)]
          (log/tracef "Error in Postgres JDBC driver reading TIME value, fetching as string '%s'" s)
          (u.date/parse s))))

    ;; H2 & MySQL work as expected
    (.getObject rs i LocalTime)))

(defmethod read-column Types/TIME_WITH_TIMEZONE
  [^ResultSet rs _ ^Integer i]
  (.getObject rs i OffsetTime))

(defn read-columns
  "Default `clojure.java.jdbc` `:read-columns` method to use for Metabase. Reads temporal values as `java.sql.time`
  types rather than legacy `java.sql.Timestamp` and the like."
  [rs rsmeta indexes]
  (mapv
   (fn [i]
     (-> (read-column rs rsmeta i)
         (jdbc/result-set-read-column rsmeta i)))
   indexes))
