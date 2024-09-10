(ns metabase.driver.databricks-jdbc
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.hive-like :as driver.hive-like]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [ring.util.codec :as codec])
  (:import
   [java.sql Connection ResultSet ResultSetMetaData Statement]
   [java.time LocalDate LocalDateTime LocalTime OffsetDateTime ZonedDateTime OffsetTime]))

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

(defmethod sql-jdbc.sync/database-type->base-type :databricks-jdbc
  [driver database-type]
  (condp re-matches (u/lower-case-en (name database-type))
    #"timestamp" :type/DateTimeWithLocalTZ
    #"timestamp_ntz" :type/DateTime
    ((get-method sql-jdbc.sync/database-type->base-type :hive-like)
     driver database-type)))

(defmethod sql-jdbc.execute/set-timezone-sql :databricks-jdbc
  [_driver]
  "SET TIME ZONE %s;")

(defmethod sql-jdbc.conn/connection-details->spec :databricks-jdbc
  [_driver {:keys [catalog host http-path log-level schema token] :as _details}]
  (assert (string? (not-empty catalog)) "Catalog is mandatory.")
  (merge
   {:classname        "com.databricks.client.jdbc.Driver"
    :subprotocol      "databricks"
    ;; Reading through the changelog revealed `EnableArrow=0` solves multiple problems. Including the exception logged
    ;; during first `can-connect?` call. Ref:
    ;; https://databricks-bi-artifacts.s3.us-east-2.amazonaws.com/simbaspark-drivers/jdbc/2.6.40/docs/release-notes.txt
    :subname          (str "//" host ":443/;EnableArrow=0"
                           ";ConnCatalog=" (codec/url-encode catalog)
                           (when (string? (not-empty schema))
                             (str ";ConnSchema=" (codec/url-encode schema))))
    :transportMode    "http"
    :ssl              1
    :AuthMech         3
    :HttpPath         http-path
    :uid              "token"
    :pwd              token
    :UseNativeQuery 1}
   ;; Following is used just for tests. See the [[metabase.driver.sql-jdbc.connection-test/perturb-db-details]]
   ;; and test that is using the function.
   (when log-level
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

(def ^:private ^:dynamic *database*
  "Used to get `[:details :catalog]` in `sql-jdbc.sync/describe-table-fields :databricks-jdbc`. Bound in
  `driver/describe-table :databricks-jdbc`. Catalog is used as parameter of [[table-fields-sql-str]]."
  nil)

(defmethod driver/describe-table :databricks-jdbc
  [driver database table]
  (binding [*database* database]
    ((get-method driver/describe-table :sql-jdbc) driver database table)))

(def ^:private describe-table-field-keys
  #{:column_name :column_default :comment :is_nullable :data_type})

#_{:clj-kondo/ignore true}
(defn- row-map->field-metadata
  [{:keys [column_name column_default comment is_nullable data_type]
    :as row-map}]
  (doseq [key describe-table-field-keys]
    (assert (contains? row-map key)))
  (merge {:name column_name
          :database-type data_type
          ;; At the moment there is no way to decide whether column is auto increment with Databricks.
          ;; `IS_IDENTITY` column is always "NO". Docs say it is reserved for future use. See the following:
          ;; https://docs.databricks.com/en/sql/language-manual/information-schema/columns.html. Then, with regards
          ;; to alternative ways of fetching that information, `describe ...` does not contain that and rows that
          ;; are result of `.getColumns` have corresponding column always set to nil.
          :database-is-autoincrement false
          :database-required? (and (nil? column_default)
                                   (= "NO" is_nullable))}
         (when comment
           {:comment comment})))

#_{:clj-kondo/ignore true}
(def ^:private table-fields-sql-str
  (str/join "\n"
            ["select *"
             "  from information_schema.columns"
             "  where"
             "    table_catalog = ?"
             "    AND table_schema = ?"
             "    AND table_name = ?"]))

#_(defmethod sql-jdbc.sync/describe-table-fields :databricks-jdbc
  [driver ^Connection _conn table _db-name-or-nil]
  (let [catalog-name (get-in *database* [:details :catalog])
        schema-name  (get-in *database* [:details :schema])
        table-name   (:name table)]
    (into
     #{}
     (comp
      (map row-map->field-metadata)
      (sql-jdbc.sync/describe-table-fields-xf driver *database*))
     ;; TODO: Maybe I could swap this for plain jdbc version! hence I'd be able to use existing connection!
     (sql-jdbc.execute/reducible-query *database* [table-fields-sql-str
                                                   catalog-name
                                                   schema-name
                                                   table-name]))))

(defmethod sql.qp/quote-style :databricks-jdbc
  [_driver]
  :mysql)

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
         (log/debug e "Error setting readOnly false on connection")))
     ;; Method is re-implemented because `legacy_time_parser_policy` has to be set to pass the test suite.
     ;; https://docs.databricks.com/en/sql/language-manual/parameters/legacy_time_parser_policy.html
     (with-open [^Statement stmt (.createStatement conn)]
       (.execute stmt "set legacy_time_parser_policy = legacy"))
     (sql-jdbc.execute/set-default-connection-options! driver db-or-id-or-spec conn options)
     (f conn))))

(defmethod sql.qp/datetime-diff [:databricks-jdbc :second]
  [_driver _unit x y]
  [:-
   [:unix_timestamp y (if (instance? LocalDate y)
                        (h2x/literal "yyyy-MM-dd")
                        (h2x/literal "yyyy-MM-dd HH:mm:ss"))]
   [:unix_timestamp x (if (instance? LocalDate x)
                        (h2x/literal "yyyy-MM-dd")
                        (h2x/literal "yyyy-MM-dd HH:mm:ss"))]])

(def ^:private timestamp-database-type-names #{"TIMESTAMP" "TIMESTAMP_NTZ"})

;; Both timestamp types, TIMESTAMP and TIMESTAMP_NTZ, are returned in `Types/TIMESTAMP` sql type. TIMESTAMP is wall
;; clock with date in session timezone. Hence the following implementation adds the results timezone in LocalDateTime
;; gathered from JDBC driver and then adjusts the value to ZULU. Presentation tweaks (ie. changing to report for users'
;; pleasure) are done in `wrap-value-literals` middleware.
(defmethod sql-jdbc.execute/read-column-thunk [:databricks-jdbc java.sql.Types/TIMESTAMP]
  [_driver ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  ;; TIMESTAMP is returned also for TIMESTAMP_NTZ type!!! Hence only true branch is hit until this is fixed upstream.
  (let [database-type-name (.getColumnTypeName rsmeta i)]
    (assert (timestamp-database-type-names database-type-name))
    (if (= "TIMESTAMP" database-type-name)
      (fn []
        (assert (some? (qp.timezone/results-timezone-id)))
        (when-let [t (.getTimestamp rs i)]
          (t/with-offset-same-instant
            (t/offset-date-time
             (t/zoned-date-time (t/local-date-time t)
                                (t/zone-id (qp.timezone/results-timezone-id))))
            (t/zone-id "Z"))))
      (fn []
        (when-let [t (.getTimestamp rs i)]
          (t/local-date-time t))))))

(defn- date-time->results-local-date-time
  "For datetime types with zone info generate LocalDateTime as in that zone. Databricks java driver does not support
  setting OffsetDateTime or ZonedDateTime parameters. It uses parameters as in session timezone. Hence, this function
  shifts LocalDateTime so wall clock corresponds to Databricks' timezone."
  [dt]
  (if (instance? LocalDateTime dt)
    dt
    (let [tz-str      (try (qp.timezone/results-timezone-id)
                           (catch Throwable _
                             (log/trace "Failed to get `results-timezone-id`. Using system timezone.")
                             (qp.timezone/system-timezone-id)))
          adjusted-dt (t/with-zone-same-instant (t/zoned-date-time dt) (t/zone-id tz-str))]
      (t/local-date-time adjusted-dt))))

(defn- set-parameter-to-local-date-time
  [driver prepared-statement index object]
  ((get-method sql-jdbc.execute/set-parameter [::sql-jdbc.legacy/use-legacy-classes-for-read-and-set LocalDateTime])
   driver prepared-statement index (date-time->results-local-date-time object)))

(defmethod sql-jdbc.execute/set-parameter [:databricks-jdbc OffsetDateTime]
  [driver prepared-statement index object]
  (set-parameter-to-local-date-time driver prepared-statement index object))

(defmethod sql-jdbc.execute/set-parameter [:databricks-jdbc ZonedDateTime]
  [driver prepared-statement index object]
  (set-parameter-to-local-date-time driver prepared-statement index object))

;;
;; `set-parameter` is implmented also for LocalTime and OffsetTime, even though Databricks does not support time types.
;; It enables creation of `attempted-murders` dataset, hence making the driver compatible with more of existing tests.
;;

(defmethod sql-jdbc.execute/set-parameter [:databricks-jdbc LocalTime]
  [driver prepared-statement index object]
  (set-parameter-to-local-date-time driver prepared-statement index
                                    (t/local-date-time (t/local-date 1970 1 1) object)))

(defmethod sql-jdbc.execute/set-parameter [:databricks-jdbc OffsetTime]
  [driver prepared-statement index object]
  (set-parameter-to-local-date-time driver prepared-statement index
                                    (t/local-date-time (t/local-date 1970 1 1) object)))
