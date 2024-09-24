(ns metabase.driver.databricks-jdbc
  (:require
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.hive-like :as driver.hive-like]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
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
                              :describe-fields                 true
                              :describe-fks                    true
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

(defmethod sql-jdbc.sync/describe-fields-sql :databricks-jdbc
  [driver & {:keys [schema-names table-names]}]
  (sql/format {:select [[:c.column_name :name]
                        [:c.full_data_type :database-type]
                        [:c.ordinal_position :database-position]
                        [:c.table_schema :table-schema]
                        [:c.table_name :table-name]
                        [[:case [:= :cs.constraint_type [:inline "PRIMARY KEY"]] true :else false] :pk?]
                        [[:case [:not= :c.comment [:inline ""]] :c.comment :else nil] :field-comment]]
               :from [[:information_schema.columns :c]]
               ;; Join constraint_type to every row; mapping of one to at most one, thanks
               ;; to `[:= [:inline "PRIMARY KEY"] :cs.constraint_type]` condition.
               :left-join [[{:select   [[:tc.table_catalog :table_catalog]
                                        [:tc.table_schema :table_schema]
                                        [:tc.table_name :table_name]
                                        [:ccu.column_name :column_name]
                                        [:tc.constraint_type :constraint_type]]
                             :from     [[:information_schema.table_constraints :tc]]
                             :join     [[:information_schema.constraint_column_usage :ccu]
                                        [:and
                                         [:= :tc.table_catalog :ccu.table_catalog]
                                         [:= :tc.table_schema :ccu.table_schema]
                                         [:= :tc.table_name :ccu.table_name]]]
                             :group-by [:tc.table_catalog
                                        :tc.table_schema
                                        :tc.table_name
                                        :ccu.column_name
                                        :tc.constraint_type]}
                            :cs]
                           [:and
                            [:= :c.table_catalog :cs.table_catalog]
                            [:= :c.table_schema :cs.table_schema]
                            [:= :c.table_name :cs.table_name]
                            [:= :c.column_name :cs.column_name]
                            [:= [:inline "PRIMARY KEY"] :cs.constraint_type]]]
               :where [:and
                       ;; Ignore `timestamp_ntz` type columns. Columns of this type are not recognizable from
                       ;; `timestamp` columns when fetching the data. This exception should be removed when the problem
                       ;; is resolved by Databricks in underlying jdbc driver.
                       [:not= :c.full_data_type [:inline "timestamp_ntz"]]
                       [:not [:in :c.table_schema ["information_schema"]]]
                       (when schema-names [:in :c.table_schema schema-names])
                       (when table-names [:in :c.table_name table-names])]
               :order-by [:table-schema :table-name :database-position]}
              :dialect (sql.qp/quote-style driver)))

(defmethod sql-jdbc.sync/describe-fks-sql :databricks-jdbc
  [driver & {:keys [schema-names table-names]}]
  (sql/format {:select (vec
                        {:fk_kcu.table_schema  "fk-table-schema"
                         :fk_kcu.table_name    "fk-table-name"
                         :fk_kcu.column_name   "fk-column-name"
                         :pk_kcu.table_schema  "pk-table-schema"
                         :pk_kcu.table_name    "pk-table-name"
                         :pk_kcu.column_name   "pk-column-name"})
               :from [[:information_schema.key_column_usage :fk_kcu]]
               :join [[:information_schema.referential_constraints :rc]
                      [:and
                       [:= :fk_kcu.constraint_catalog :rc.constraint_catalog]
                       [:= :fk_kcu.constraint_schema :rc.constraint_schema]
                       [:= :fk_kcu.constraint_name :rc.constraint_name]]
                      [:information_schema.key_column_usage :pk_kcu]
                      [[:and
                        [:= :pk_kcu.constraint_catalog :rc.unique_constraint_catalog]
                        [:= :pk_kcu.constraint_schema :rc.unique_constraint_schema]
                        [:= :pk_kcu.constraint_name :rc.unique_constraint_name]]]]
               :where [:and
                       [:not [:in :fk_kcu.table_schema ["information_schema"]]]
                       (when table-names [:in :fk_kcu.table_name table-names])
                       (when schema-names [:in :fk_kcu.table_schema schema-names])]
               :order-by [:fk-table-schema :fk-table-name]}
              :dialect (sql.qp/quote-style driver)))

(defmethod sql-jdbc.execute/set-timezone-sql :databricks-jdbc
  [_driver]
  "SET TIME ZONE %s;")

(defmethod sql-jdbc.conn/connection-details->spec :databricks-jdbc
  [_driver {:keys [catalog host http-path log-level token additional-options] :as _details}]
  (assert (string? (not-empty catalog)) "Catalog is mandatory.")
  (merge
   {:classname        "com.databricks.client.jdbc.Driver"
    :subprotocol      "databricks"
    ;; Reading through the changelog revealed `EnableArrow=0` solves multiple problems. Including the exception logged
    ;; during first `can-connect?` call. Ref:
    ;; https://databricks-bi-artifacts.s3.us-east-2.amazonaws.com/simbaspark-drivers/jdbc/2.6.40/docs/release-notes.txt
    :subname          (str "//" host ":443/;EnableArrow=0"
                           ";ConnCatalog=" (codec/url-encode catalog)
                           (when (string? (not-empty additional-options))
                             additional-options))
    :transportMode  "http"
    :ssl            1
    :AuthMech       3
    :HttpPath       http-path
    :uid            "token"
    :pwd            token
    :UseNativeQuery 1}
   ;; Following is used just for tests. See the [[metabase.driver.sql-jdbc.connection-test/perturb-db-details]]
   ;; and test that is using the function.
   (when log-level
     {:LogLevel log-level})))

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
