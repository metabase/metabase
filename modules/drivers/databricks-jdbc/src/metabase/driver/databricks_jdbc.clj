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
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [ring.util.codec :as codec])
  (:import
   [java.sql Connection ResultSet Statement]
   [java.time LocalDate]))

(set! *warn-on-reflection* true)

(driver/register! :databricks-jdbc, :parent :hive-like)

(doseq [[feature supported?] {:basic-aggregations              true
                              :binning                         true
                              :expression-aggregations         true
                              :expressions                     true
                              :native-parameters               true
                              :nested-queries                  true
                              :set-timezone                    true
                              :standard-deviation-aggregations true
                              :test/jvm-timezone-setting       false}]
  (defmethod driver/database-supports? [:databricks-jdbc feature] [_driver _feature _db] supported?))

;; See the https://docs.databricks.com/en/sql/language-manual/sql-ref-syntax-aux-conf-mgmt-set-timezone.html
;; for timzone formatting
(defmethod sql-jdbc.execute/set-timezone-sql :databricks-jdbc
  [_driver]
  "SET TIME ZONE %s;")

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
    :HttpPath         http-path
    :uid              "token"
    :pwd              token
    :UseNativeQuery 1}
   ;; TODO: There's an exception on logging thrown when attempting to create a database for a first time.
   ;;       Following has no effect in that regards.
   (when-some [log-level (:log-level details)]
     {:LogLevel log-level})))

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
                fields* (filter (comp (partial sql-jdbc.sync.interface/have-select-privilege?
                                               :databricks-jdbc
                                               conn
                                               schema)
                                      :name)
                                fields)]
            (set fields*))))))})

(defmethod sql.qp/quote-style :databricks-jdbc
  [_driver]
  :mysql)

;; TODO: Using INTERVAL -- `filter-by-expression-time-interval-test`
;; https://docs.databricks.com/en/sql/language-manual/functions/dayofweek.html
;; TODO: again, verify this is necessary after removal of all hive stuff!
(defmethod sql.qp/date [:databricks-jdbc :day-of-week] [driver _ expr]
  (sql.qp/adjust-day-of-week driver [:dayofweek (h2x/->timestamp expr)]))

(defmethod driver/db-start-of-week :databricks-jdbc
  [_]
  :sunday)

(defmethod sql.qp/date [:databricks-jdbc :week]
  [driver _unit expr]
  (let [week-extract-fn (fn [expr]
                          (-> [:date_sub
                               (h2x/+ (h2x/->timestamp expr)
                                      [::driver.hive-like/interval 1 :day])
                               [:dayofweek (h2x/->timestamp expr)]]
                              (h2x/with-database-type-info "timestamp")))]
    (sql.qp/adjust-start-of-week driver week-extract-fn expr)))

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
     ;; Method is re-implemented because `legacy_time_parser_policy` has to be set to pass the test suite.
     ;; https://docs.databricks.com/en/sql/language-manual/parameters/legacy_time_parser_policy.html
     (with-open [^Statement stmt (.createStatement conn)]
       (.execute stmt "set legacy_time_parser_policy = legacy"))
     (sql-jdbc.execute/set-default-connection-options! driver db-or-id-or-spec conn options)
     (f conn))))

;; This makes work the [[metabase.query-processor-test.date-time-zone-functions-test/datetime-diff-base-test]].
(defmethod sql.qp/datetime-diff [:databricks-jdbc :second]
  [_driver _unit x y]
  [:-
   [:unix_timestamp y (if (instance? LocalDate y)
                        (h2x/literal "yyyy-MM-dd")
                        (h2x/literal "yyyy-MM-dd HH:mm:ss"))]
   [:unix_timestamp x (if (instance? LocalDate x)
                        (h2x/literal "yyyy-MM-dd")
                        (h2x/literal "yyyy-MM-dd HH:mm:ss"))]])

(defmethod sql-jdbc.execute/read-column-thunk [:databricks-jdbc java.sql.Types/TIMESTAMP]
  [_driver ^ResultSet rs _rsmeta ^Integer i]
  (fn []
    (when-let [t (.getTimestamp rs i)]
      (t/zoned-date-time (t/local-date-time t) (t/zone-id (qp.timezone/results-timezone-id))))))
