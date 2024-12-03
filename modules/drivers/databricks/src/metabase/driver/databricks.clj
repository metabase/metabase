(ns metabase.driver.databricks
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.hive-like :as driver.hive-like]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sync :as driver.s]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [ring.util.codec :as codec])
  (:import
   [java.sql Connection ResultSet ResultSetMetaData Statement]
   [java.time LocalDate LocalDateTime LocalTime OffsetDateTime ZonedDateTime OffsetTime]))

(set! *warn-on-reflection* true)

(driver/register! :databricks, :parent :hive-like)

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
  (defmethod driver/database-supports? [:databricks feature] [_driver _feature _db] supported?))

(defmethod sql-jdbc.sync/database-type->base-type :databricks
  [driver database-type]
  (condp re-matches (u/lower-case-en (name database-type))
    #"timestamp" :type/DateTimeWithLocalTZ
    #"timestamp_ntz" :type/DateTime
    ((get-method sql-jdbc.sync/database-type->base-type :hive-like)
     driver database-type)))

(defn- catalog-present?
  [jdbc-spec catalog]
  (let [sql "select 0 from `system`.`information_schema`.`catalogs` where catalog_name = ?"]
    (= 1 (count (jdbc/query jdbc-spec [sql catalog])))))

(defmethod driver/can-connect? :databricks
  [driver details]
  (sql-jdbc.conn/with-connection-spec-for-testing-connection [jdbc-spec [driver details]]
    (and (catalog-present? jdbc-spec (:catalog details))
         (sql-jdbc.conn/can-connect-with-spec? jdbc-spec))))

(defn- get-tables-sql
  [catalog]
  (assert (string? (not-empty catalog)))
  [(str/join
    "\n"
    ["select"
     "  TABLE_NAME as name,"
     "  TABLE_SCHEMA as schema,"
     "  COMMENT description"
     "  from system.information_schema.tables"
     "  where TABLE_CATALOG = ?"
     "    AND TABLE_SCHEMA <> 'information_schema'"])
   catalog])

(defn- describe-database-tables
  [database]
  (let [[inclusion-patterns
         exclusion-patterns] (driver.s/db-details->schema-filter-patterns database)
        syncable? (fn [schema]
                    (driver.s/include-schema? inclusion-patterns exclusion-patterns schema))]
    (eduction
     (filter (comp syncable? :schema))
     (sql-jdbc.execute/reducible-query database (get-tables-sql (-> database :details :catalog))))))

(defmethod driver/describe-database :databricks
  [driver database]
  (try
    {:tables (into #{} (describe-database-tables database))}
    (catch Throwable e
      (throw (ex-info (format "Error in %s describe-database: %s" driver (ex-message e))
                      {}
                      e)))))

(defmethod sql-jdbc.sync/describe-fields-sql :databricks
  [driver & {:keys [schema-names table-names catalog]}]
  (assert (string? (not-empty catalog)) "`catalog` is required for sync.")
  (sql/format {:select [[:c.column_name :name]
                        [:c.full_data_type :database-type]
                        [:c.ordinal_position :database-position]
                        [:c.table_schema :table-schema]
                        [:c.table_name :table-name]
                        [[:case [:= :cs.constraint_type [:inline "PRIMARY KEY"]] true :else false] :pk?]
                        [[:case [:not= :c.comment [:inline ""]] :c.comment :else nil] :field-comment]]
               :from [[:system.information_schema.columns :c]]
               ;; Following links contains contains diagram of `information_schema`:
               ;; https://docs.databricks.com/en/sql/language-manual/sql-ref-information-schema.html
               :left-join [[{:select   [[:tc.table_catalog :table_catalog]
                                        [:tc.table_schema :table_schema]
                                        [:tc.table_name :table_name]
                                        [:ccu.column_name :column_name]
                                        [:tc.constraint_type :constraint_type]]
                             :from     [[:system.information_schema.table_constraints :tc]]
                             :join     [[:system.information_schema.constraint_column_usage :ccu]
                                        [:and
                                         [:= :tc.constraint_catalog :ccu.constraint_catalog]
                                         [:= :tc.constraint_schema :ccu.constraint_schema]
                                         [:= :tc.constraint_name :ccu.constraint_name]]]
                             :where [:= :tc.constraint_type [:inline "PRIMARY KEY"]]
                             ;; In case on pk constraint is used by multiple columns this query would return duplicate
                             ;; rows. Group by ensures all rows are distinct. This may not be necessary, but rather
                             ;; safe than sorry.
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
                            [:= :c.column_name :cs.column_name]]]
               :where [:and
                       [:= :c.table_catalog [:inline catalog]]
                       ;; Ignore `timestamp_ntz` type columns. Columns of this type are not recognizable from
                       ;; `timestamp` columns when fetching the data. This exception should be removed when the problem
                       ;; is resolved by Databricks in underlying jdbc driver.
                       [:not= :c.full_data_type [:inline "timestamp_ntz"]]
                       [:not [:in :c.table_schema ["information_schema"]]]
                       (when schema-names [:in :c.table_schema schema-names])
                       (when table-names [:in :c.table_name table-names])]
               :order-by [:table-schema :table-name :database-position]}
              :dialect (sql.qp/quote-style driver)))

(defmethod driver/describe-fields :sql-jdbc
  [driver database & {:as args}]
  (let [catalog (get-in database [:details :catalog])]
    (sql-jdbc.sync/describe-fields driver database (assoc args :catalog catalog))))

(defmethod sql-jdbc.sync/describe-fks-sql :databricks
  [driver & {:keys [schema-names table-names catalog]}]
  (assert (string? (not-empty catalog)) "`catalog` is required for sync.")
  (sql/format {:select (vec
                        {:fk_kcu.table_schema  "fk-table-schema"
                         :fk_kcu.table_name    "fk-table-name"
                         :fk_kcu.column_name   "fk-column-name"
                         :pk_kcu.table_schema  "pk-table-schema"
                         :pk_kcu.table_name    "pk-table-name"
                         :pk_kcu.column_name   "pk-column-name"})
               :from [[:system.information_schema.key_column_usage :fk_kcu]]
               :join [[:system.information_schema.referential_constraints :rc]
                      [:and
                       [:= :fk_kcu.constraint_catalog :rc.constraint_catalog]
                       [:= :fk_kcu.constraint_schema :rc.constraint_schema]
                       [:= :fk_kcu.constraint_name :rc.constraint_name]]
                      [:system.information_schema.key_column_usage :pk_kcu]
                      [[:and
                        [:= :pk_kcu.constraint_catalog :rc.unique_constraint_catalog]
                        [:= :pk_kcu.constraint_schema :rc.unique_constraint_schema]
                        [:= :pk_kcu.constraint_name :rc.unique_constraint_name]]]]
               :where [:and
                       [:= :fk_kcu.table_catalog [:inline catalog]]
                       [:not [:in :fk_kcu.table_schema ["information_schema"]]]
                       (when table-names [:in :fk_kcu.table_name table-names])
                       (when schema-names [:in :fk_kcu.table_schema schema-names])]
               :order-by [:fk-table-schema :fk-table-name]}
              :dialect (sql.qp/quote-style driver)))

(defmethod driver/describe-fks :sql-jdbc
  [driver database & {:as args}]
  (let [catalog (get-in database [:details :catalog])]
    (sql-jdbc.sync/describe-fks driver database (assoc args :catalog catalog))))

(defmethod sql-jdbc.execute/set-timezone-sql :databricks
  [_driver]
  "SET TIME ZONE %s;")

(defmethod driver/db-default-timezone :databricks
  [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver database nil
   (fn [^Connection conn]
     (with-open [stmt (.prepareStatement conn "select current_timezone()")
                 rset (.executeQuery stmt)]
       (when (.next rset)
         (.getString rset 1))))))

(defn- preprocess-additional-options
  [additional-options]
  (when (string? (not-empty additional-options))
    (str/replace-first additional-options #"^(?!;)" ";")))

(defmethod sql-jdbc.conn/connection-details->spec :databricks
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
                           (preprocess-additional-options additional-options))
    :transportMode  "http"
    :ssl            1
    :AuthMech       3
    :HttpPath       http-path
    :uid            "token"
    :pwd            token
    :UserAgentEntry (format "Metabase/%s" (:tag config/mb-version-info))
    :UseNativeQuery 1}
   ;; Following is used just for tests. See the [[metabase.driver.sql-jdbc.connection-test/perturb-db-details]]
   ;; and test that is using the function.
   (when log-level
     {:LogLevel log-level})))

(defmethod sql.qp/quote-style :databricks
  [_driver]
  :mysql)

(defmethod sql.qp/date [:databricks :day-of-week] [driver _ expr]
  (sql.qp/adjust-day-of-week driver [:dayofweek (h2x/->timestamp expr)]))

(defmethod driver/db-start-of-week :databricks
  [_]
  :sunday)

(defmethod sql.qp/date [:databricks :week]
  [driver _unit expr]
  (let [week-extract-fn (fn [expr]
                          (-> [:date_sub
                               (h2x/+ (h2x/->timestamp expr)
                                      [::driver.hive-like/interval 1 :day])
                               [:dayofweek (h2x/->timestamp expr)]]
                              (h2x/with-database-type-info "timestamp")))]
    (sql.qp/adjust-start-of-week driver week-extract-fn expr)))

(defmethod sql-jdbc.execute/do-with-connection-with-options :databricks
  [driver db-or-id-or-spec options f]
  (sql-jdbc.execute/do-with-resolved-connection
   driver
   db-or-id-or-spec
   options
   (fn [^Connection conn]
     (let [read-only? (.isReadOnly conn)]
       (try
         (.setReadOnly conn false)
         ;; Method is re-implemented because `legacy_time_parser_policy` has to be set to pass the test suite.
         ;; https://docs.databricks.com/en/sql/language-manual/parameters/legacy_time_parser_policy.html
         (with-open [^Statement stmt (.createStatement conn)]
           (.execute stmt "set legacy_time_parser_policy = legacy"))
         (finally
           (.setReadOnly conn read-only?))))
     (sql-jdbc.execute/set-default-connection-options! driver db-or-id-or-spec conn options)
     (f conn))))

(defmethod sql.qp/datetime-diff [:databricks :second]
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
(defmethod sql-jdbc.execute/read-column-thunk [:databricks java.sql.Types/TIMESTAMP]
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

(defmethod sql-jdbc.execute/set-parameter [:databricks OffsetDateTime]
  [driver prepared-statement index object]
  (set-parameter-to-local-date-time driver prepared-statement index object))

(defmethod sql-jdbc.execute/set-parameter [:databricks ZonedDateTime]
  [driver prepared-statement index object]
  (set-parameter-to-local-date-time driver prepared-statement index object))

;;
;; `set-parameter` is implmented also for LocalTime and OffsetTime, even though Databricks does not support time types.
;; It enables creation of `attempted-murders` dataset, hence making the driver compatible with more of existing tests.
;;

(defmethod sql-jdbc.execute/set-parameter [:databricks LocalTime]
  [driver prepared-statement index object]
  (set-parameter-to-local-date-time driver prepared-statement index
                                    (t/local-date-time (t/local-date 1970 1 1) object)))

(defmethod sql-jdbc.execute/set-parameter [:databricks OffsetTime]
  [driver prepared-statement index object]
  (set-parameter-to-local-date-time driver prepared-statement index
                                    (t/local-date-time (t/local-date 1970 1 1) object)))
