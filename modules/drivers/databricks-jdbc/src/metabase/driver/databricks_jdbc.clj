(ns metabase.driver.databricks-jdbc
  (:require
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.hive-like :as driver.hive-like]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util.unprepare :as unprepare]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [ring.util.codec :as codec])
  (:import
   [java.sql Connection Date PreparedStatement Statement Timestamp]
   [java.time LocalDate LocalDateTime OffsetDateTime ZonedDateTime]))

(set! *warn-on-reflection* true)

(driver/register! :databricks-jdbc, :parent :hive-like)

;; TODO: Iterate over features (not limited to following) and maybe add more.
(doseq [[feature supported?] {:basic-aggregations              true
                              :binning                         true
                              :expression-aggregations         true
                              :expressions                     true
                              :native-parameters               true
                              :nested-queries                  true
                              :standard-deviation-aggregations true
                              :test/jvm-timezone-setting       false}]
  (defmethod driver/database-supports? [:databricks-jdbc feature] [_driver _feature _db] supported?))

;; TODO: Is the following required? Why?
#_(when-not (get (methods driver/database-supports?) [:databricks-jdbc :foreign-keys])
    (defmethod driver/database-supports? [:databricks-jdbc :foreign-keys] [_driver _feature _db] true))


(defmethod sql-jdbc.conn/connection-details->spec :databricks-jdbc
  [_driver {:keys [catalog host http-path schema token] :as details}]
  (merge
   {:classname        "com.databricks.client.jdbc.Driver"
    :subprotocol      "databricks"
    ;; TODO: urlencode strings!
    :subname          (str "//" host ":443/"
                          ;; TODO: following should be mandatory!
                           (when (string? (not-empty catalog))
                             (str ";ConnCatalog=" (codec/url-encode catalog)))
                           (when (string? (not-empty schema))
                             (str ";ConnSchema=" (codec/url-encode schema))))
    :transportMode    "http"
    :ssl              1
    :AuthMech         3
    :httpPath         http-path
    :uid              "token"
    :pwd              token
    ;; TODO: Decide whether following is necessary
    ;;       based on https://docs.databricks.com/en/integrations/jdbc/capability.html#jdbc-native.
    :UseNativeQuery 1
    #_#_:LogLevel 0}
   ;; TODO: There's an exception on logging thrown when attempting to create a database for a first time.
   ;;       Following has no effect in that regards.
   ;; TODO: Following is used now just for testing -- `connection-pool-invalidated-on-details-change`. Find a better
   ;;       way.
   (when-some [log-level (:log-level details)]
     {:LogLevel log-level})))

; hl pass ok
(defmethod driver/describe-database :databricks-jdbc
  [driver db-or-id-or-spec]
  {:tables
   (sql-jdbc.execute/do-with-connection-with-options
    driver
    db-or-id-or-spec
    nil
    (fn [^Connection conn]
      (let [database                 (sql-jdbc.describe-database/db-or-id-or-spec->database db-or-id-or-spec)
            {:keys [catalog schema]} (:details database)
            dbmeta                   (.getMetaData conn)]
        (with-open [rs (.getTables dbmeta catalog schema nil
                                   ;; manually verified
                                   (into-array String ["TABLE" "VIEW"]))]
          (let [rs-meta (.getMetaData rs)
                col-count (.getColumnCount rs-meta)
                rows (loop [rows []]
                       (.next rs)
                       (if (.isAfterLast rs)
                         rows
                         (recur (conj rows (mapv (fn [idx]
                                                   (.getObject rs ^long idx))
                                                 (map inc (range col-count)))))))
                fields (map (fn [[_catalog schema table-name _table-type remarks]]
                              {:name table-name
                               :schema schema
                               :description remarks})
                            rows)
                ;; eg this could be execute for all fields first?
                fields* (filter (comp (partial sql-jdbc.sync.interface/have-select-privilege?
                                               :databricks-jdbc
                                               conn
                                               schema)
                                      :name)
                                fields)]
            (set fields*))))))})

;;; This is from spark!!!
(defmethod sql.qp/quote-style :databricks-jdbc
  [_driver]
  :mysql)

;; TODO: unprepare value
;; TODO: Verify following is actually the right thing to do.
(defmethod sql-jdbc.execute/set-parameter [:databricks-jdbc LocalDate]
  [_driver ^PreparedStatement ps i ^LocalDate t]
  (.setObject ps i (Date/valueOf t)))

;; TODO: unprepare value
;; TODO: Verify following is actually the right thing to do.
(defmethod sql-jdbc.execute/set-parameter [:databricks-jdbc LocalDateTime]
  [_driver ^PreparedStatement ps i ^LocalDateTime t]
  (.setObject ps i (Timestamp/valueOf t)))

;; Following implementations are necessary for data loading logic in `insert-rows-honeysql-form :sql/test-extensions`
;; to work correctly. Databricks jdbc driver is unable to execute `.setObject` with argument being instance
;; of those classes.
;;
;; Relevant trace:
;  [[com.databricks.client.exceptions.ExceptionConverter toSQLException nil -1]
;   [com.databricks.client.jdbc.common.SPreparedStatement setObject nil -1]
;   [com.databricks.client.jdbc.common.SPreparedStatement setObject nil -1]
;   [com.databricks.client.hivecommon.jdbc42.Hive42PreparedStatement setObject nil -1]
;   [metabase.db.jdbc_protocols$set_object invokeStatic jdbc_protocols.clj 25]
;   [metabase.db.jdbc_protocols$set_object invoke jdbc_protocols.clj 23]
;   [metabase.db.jdbc_protocols$eval75770$fn__75771 invoke jdbc_protocols.clj 39]
;   ...
;   [metabase.test.data.databricks_jdbc$eval184535$fn__184536$fn__184537 invoke databricks_jdbc.clj 74]
;   [metabase.driver.sql_jdbc.execute$eval128039$fn__128040$fn__128041 invoke execute.clj 390]
;;
;; Specifically, `set-parameter` implementations of `clojure.java.jdbc/ISQLParameter` defined in
;; [[metabase.db.jdbc-protocols]] come into play here.
;;
;; Databricks jdbc driver is unable to convert eg. LocalDate to java.sql.Date. To overcome that, values are converted
;; into java.sql.<TYPE> types.
;;
;; TODO: Check the conversion (when jdbc driver applies parameters) is correct! The instant is same!
;;
;; It may have undesired effect I'm not yet aware of. Analyzing test failures should reveal that.
;; Also I believe there is more reasonable way to do those transformations. TBD.
;;
;; Alternative to this could be unpreparing ddl as Athena does.
(defmethod sql.qp/->honeysql [:databricks-jdbc LocalDateTime]
  [_driver ^LocalDateTime value]
  (Timestamp/valueOf value))

(defmethod sql.qp/->honeysql [:databricks-jdbc LocalDate]
  [_driver ^LocalDate value]
  (Date/valueOf value))

(defmethod sql.qp/->honeysql [:databricks-jdbc ZonedDateTime]
  [_driver ^ZonedDateTime value]
  (t/instant->sql-timestamp (.toInstant value)))

(defmethod sql.qp/->honeysql [:databricks-jdbc OffsetDateTime]
  [_driver ^OffsetDateTime value]
  (t/instant->sql-timestamp (.toInstant value)))

;; TODO: Using INTERVAL -- `filter-by-expression-time-interval-test`
;; https://docs.databricks.com/en/sql/language-manual/functions/dayofweek.html
;; TODO: again, verify this is necessary after removal of all hive stuff!
(defmethod sql.qp/date [:databricks-jdbc :day-of-week] [driver _ expr]
  (sql.qp/adjust-day-of-week driver [:dayofweek (h2x/->timestamp expr)]))

;; TODO: ENSURE THIS IS CORRECT!!!!!!!!!!
(defmethod driver/db-start-of-week :databricks-jdbc
  [_]
  :sunday)

(defmethod sql.qp/date [:databricks-jdbc :week]
  [driver _unit expr]
  (let [week-extract-fn (fn [expr]
                          (-> [:date_sub
                               (h2x/+ (h2x/->timestamp expr)
                                      ;; THIS
                                      [::driver.hive-like/interval 1 :day])
                               ;; THIS!
                               [:dayofweek (h2x/->timestamp expr)]]
                              (h2x/with-database-type-info "timestamp")))]
    (sql.qp/adjust-start-of-week driver week-extract-fn expr)))

;; TODO: I have a feeling that `.toString` should not be used here
;; TODO: Examine after data loading modif (sql time types handling may become redundant.)
(defmethod unprepare/unprepare-value [:databricks-jdbc java.sql.Date]
  [_driver ^java.sql.Date value]
  (str "cast('" (.toString value) "' as DATE)"))

(defmethod sql-jdbc.execute/do-with-connection-with-options :databricks-jdbc
  [driver db-or-id-or-spec options f]
  (sql-jdbc.execute/do-with-resolved-connection
   driver
   db-or-id-or-spec
   options
   (fn [^Connection conn]
     (try
       (.setReadOnly conn false)
       (catch Throwable e
         (log/debug e "Error setting connection to readwrite")))
     ;; Method is re-implemented because `legacy_time_parser_policy` has to be set to pass test suite.
     ;; https://docs.databricks.com/en/sql/language-manual/parameters/legacy_time_parser_policy.html
     (with-open [^Statement stmt (.createStatement conn)]
       (.execute stmt "set legacy_time_parser_policy = legacy")
       #_(.execute stmt "set ansi_mode = false"))
     (sql-jdbc.execute/set-default-connection-options! driver db-or-id-or-spec conn options)
     (f conn))))

;; This makes work the [[metabase.query-processor-test.date-time-zone-functions-test/datetime-diff-base-test]].
;; However it should be probably further modified so (1) ->honeysql -> legacy type is not used and
;; (2) legacy_time_parser could be omitted.
(defmethod sql.qp/datetime-diff [:databricks-jdbc :second]
  [_driver _unit x y]
  [:-
   (into [:unix_timestamp y]
         (remove nil?)
         [(when (instance? java.sql.Date y)
            (h2x/literal "yyyy-MM-dd"))
          (when (instance? java.sql.Timestamp y)
            (h2x/literal "yyyy-MM-dd HH:mm:ss"))])
   (into [:unix_timestamp x]
         (remove nil?)
         [(when (instance? java.sql.Date x)
            (h2x/literal "yyyy-MM-dd"))
          (when (instance? java.sql.Timestamp x)
            (h2x/literal "yyyy-MM-dd HH:mm:ss"))])])
