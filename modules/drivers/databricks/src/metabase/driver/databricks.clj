(ns metabase.driver.databricks
  (:refer-clojure :exclude [not-empty get-in])
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.hive-like :as driver.hive-like]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sync :as driver.s]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [not-empty get-in]]
   [ring.util.codec :as codec])
  (:import
   [java.sql
    Connection
    PreparedStatement
    ResultSet
    ResultSetMetaData
    Statement
    Types]
   [java.time
    LocalDate
    LocalDateTime
    LocalTime
    OffsetDateTime
    OffsetTime
    ZonedDateTime]))

(set! *warn-on-reflection* true)

(driver/register! :databricks, :parent :hive-like)

(doseq [[feature supported?] {:basic-aggregations              true
                              :binning                         true
                              :describe-fields                 true
                              :describe-fks                    true
                              :expression-aggregations         true
                              :expression-literals             true
                              :expressions                     true
                              :native-parameters               true
                              :nested-queries                  true
                              :multi-level-schema              true
                              :set-timezone                    true
                              :standard-deviation-aggregations true
                              :test/jvm-timezone-setting       false
                              :database-routing                true}]
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

(defmethod driver/adjust-schema-qualification :databricks
  [_driver database schema]
  (let [multi-level? (get-in database [:details :multi-level-schema])
        catalog (get-in database [:details :catalog])
        prefix (str catalog ".")]
    (cond
      (and multi-level? (not (str/includes? schema ".")))
      (str prefix schema)

      (and (not multi-level?) (str/starts-with? schema prefix))
      (subs schema (count prefix))

      :else
      schema)))

(defn- split-catalog+schema
  [schema]
  (str/split schema #"\."))

(defmethod sql.qp/->honeysql [:databricks ::h2x/identifier]
  [_driver [tag identifier-type components :as _identifier]]
  (let [components (if (or (and (= identifier-type :table)
                                (>= (count components) 2))
                           (and (= identifier-type :field)
                                (>= (count components) 3)))
                     ;; period is an illegal character for identifiers in databricks so if it's present we can split and
                     ;; quote safely. docs.databricks.com/aws/en/sql/language-manual/sql-ref-names
                     (let [first-split (split-catalog+schema (first components))]
                       (into first-split (rest components)))
                     components)]
    (sql.qp/->honeysql :hive-like [tag identifier-type components])))

(defn- get-tables-sql
  [driver {:keys [catalog multi-level-schema]}]
  (assert (string? (not-empty catalog)))
  (sql/format {:select [[:t.table_name :name]
                        (if multi-level-schema
                          [[:concat :t.table_catalog [:inline "."] :t.table_schema] :schema]
                          [:t.table_schema :schema])
                        [:t.comment :description]]
               :from [[:system.information_schema.tables :t]]
               :where [:and
                       (when-not multi-level-schema [:= :t.table_catalog catalog])
                       [:<> :t.table_schema [:inline "information_schema"]]
                       [:not [:startswith :t.table_catalog [:inline "__databricks"]]]]}
              :dialect (sql.qp/quote-style driver)))

(defmethod driver/describe-database* :databricks
  [driver database]
  (try
    {:tables
     (let [[inclusion-patterns
            exclusion-patterns] (driver.s/db-details->schema-filter-patterns database)
           included? (fn [schema]
                       (sql-jdbc.describe-database/include-schema-logging-exclusion inclusion-patterns exclusion-patterns schema))]
       (into
        #{}
        (filter (comp included? :schema))
        (sql-jdbc.execute/reducible-query database (get-tables-sql driver (:details database)))))}
    (catch Throwable e
      (throw (ex-info (format "Error in %s describe-database: %s" driver (ex-message e))
                      {}
                      e)))))

(defn- schema-names-filter [schema-names multi-level-schema catalog-column schema-column]
  (when schema-names
    (if multi-level-schema
      [:in [:composite catalog-column schema-column]
       (map (comp (fn [catalog+schema]
                    (into [:composite] catalog+schema))
                  split-catalog+schema)
            schema-names)]
      [:in schema-column schema-names])))

(defmethod sql-jdbc.sync/describe-fields-sql :databricks
  [driver & {:keys [schema-names table-names] {:keys [catalog multi-level-schema]} :details}]
  (assert (string? (not-empty catalog)) "`catalog` is required for sync.")
  (sql/format {:select [[:c.column_name :name]
                        [:c.full_data_type :database-type]
                        [:c.ordinal_position :database-position]
                        (if multi-level-schema
                          [[:concat :c.table_catalog [:inline "."] :c.table_schema] :table-schema]
                          [:c.table_schema :table-schema])
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
                       (when-not multi-level-schema [:= :c.table_catalog catalog])
                       [:not [:startswith :c.table_catalog [:inline "__databricks"]]]
                       [:not [:in :c.table_schema [[:inline "information_schema"]]]]
                       (schema-names-filter schema-names multi-level-schema :c.table_catalog :c.table_schema)
                       (when table-names [:in :c.table_name table-names])]
               :order-by [:table-schema :table-name :database-position]}
              :dialect (sql.qp/quote-style driver)))

(defmethod sql-jdbc.sync/describe-fks-sql :databricks
  [driver & {:keys [schema-names table-names] {:keys [catalog multi-level-schema]} :details}]
  (assert (string? (not-empty catalog)) "`catalog` is required for sync.")
  (sql/format {:select
               [(if multi-level-schema
                  [[:concat :fk_kcu.table_catalog [:inline "."] :fk_kcu.table_schema] "fk-table-schema"]
                  [:fk_kcu.table_schema "fk-table-schema"])
                [:fk_kcu.table_name "fk-table-name"]
                [:fk_kcu.column_name "fk-column-name"]
                (if multi-level-schema
                  [[:concat :pk_kcu.table_catalog [:inline "."] :pk_kcu.table_schema] "pk-table-schema"]
                  [:pk_kcu.table_schema "pk-table-schema"])
                [:pk_kcu.table_name "pk-table-name"]
                [:pk_kcu.column_name "pk-column-name"]]
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
                       (when-not multi-level-schema [:= :fk_kcu.table_catalog [:inline catalog]])
                       [:not [:startswith :fk_kcu.table_catalog [:inline "__databricks"]]]
                       [:not [:in :fk_kcu.table_schema ["information_schema"]]]
                       (schema-names-filter schema-names multi-level-schema :fk_kcu.table_catalog :fk_kcu.table_schema)
                       (when table-names [:in :fk_kcu.table_name table-names])]
               :order-by [:fk-table-schema :fk-table-name]}
              :dialect (sql.qp/quote-style driver)))

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
  [_driver {:keys [catalog host http-path use-m2m token client-id oauth-secret log-level additional-options] :as _details}]
  (assert (string? (not-empty catalog)) "Catalog is mandatory.")
  (let [base-spec
        {:classname      "com.databricks.client.jdbc.Driver"
         :subprotocol    "databricks"
         ;; Reading through the changelog revealed `EnableArrow=0` solves multiple problems. Including the exception logged
         ;; during first `can-connect?` call. Ref:
         ;; https://databricks-bi-artifacts.s3.us-east-2.amazonaws.com/simbaspark-drivers/jdbc/2.6.40/docs/release-notes.txt
         :subname        (str "//" host ":443/;EnableArrow=0"
                              ";ConnCatalog=" (codec/url-encode catalog)
                              (preprocess-additional-options additional-options))
         :transportMode  "http"
         :ssl            1
         :HttpPath       http-path
         :UserAgentEntry (format "Metabase/%s" (:tag driver-api/mb-version-info))
         :UseNativeQuery 1}]
    (merge base-spec
           (when log-level
             {:LogLevel log-level})
           (if use-m2m
             ;; M2M OAuth
             {:AuthMech 11
              :Auth_Flow 1
              :OAuth2ClientId client-id
              :OAuth2Secret oauth-secret}
             ;; PAT authentication
             {:AuthMech 3
              :uid "token"
              :pwd token}))))

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
        (assert (some? (driver-api/results-timezone-id)))
        (when-let [t (.getTimestamp rs i)]
          (t/with-offset-same-instant
            (t/offset-date-time
             (t/zoned-date-time (t/local-date-time t)
                                (t/zone-id (driver-api/results-timezone-id))))
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
    (let [tz-str      (try (driver-api/results-timezone-id)
                           (catch Throwable _
                             (log/trace "Failed to get `results-timezone-id`. Using system timezone.")
                             (driver-api/system-timezone-id)))
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
;; `set-parameter` is implemented also for LocalTime and OffsetTime, even though Databricks does not support time types.
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

(defmethod sql-jdbc.execute/set-parameter [:databricks (Class/forName "[B")]
  [_driver ^PreparedStatement _prepared-statement ^Integer _index _object]
  (throw (ex-info "Databricks driver cannot ingest byte array." {}))
  ;; I really did try all of these options. Databricks team says we need to use the OSS version. See
  ;; https://metaboat.slack.com/archives/C07L35T7UFQ/p1750703587969479

  ;; .setBytes() with raw byte array
  ;; Fails with
  ;; HIVE_PARAMETER_QUERY_DATA_TYPE_ERR_NON_SUPPORT_DATA_TYPE
  #_(.setBytes prepared-statement index object)

  ;; byte array as object
  ;; Ingests toString of reference and tests fail with
  ;; [CANNOT_PARSE_TIMESTAMP] Unparseable date: "[B@3b56756d".
  #_(.setObject prepared-statement index object)

  ;; byte array as object with jdbc type BINARY
  ;; Ingests toString of reference and tests fail with
  ;; [CANNOT_PARSE_TIMESTAMP] Unparseable date: "[B@3b56756d".
  #_(.setObject prepared-statement index object Types/BINARY)

  ;; byte array as object with jdbc type BINARY
  ;; Fails with
  ;; HIVE_PARAMETER_QUERY_DATA_TYPE_ERR_NON_SUPPORT_DATA_TYPE
  #_(.setObject prepared-statement index object Types/VARBINARY)

  ;; Array of Bytes with jdbc type ARRAY
  ;; Fails with
  ;; [Databricks][JDBC](11500) Given type does not match given object: [Ljava.lang.Byte;@1e1ac2b6.
  #_(.setObject prepared-statement index (into-array Byte (map #(Byte/valueOf %) object)) Types/ARRAY)

  ;; Array of Bytes with jdbc type BINARY
  ;; Fails with
  ;; [Databricks][JDBC](11500) Given type does not match given object: [Ljava.lang.Byte;@1e1ac2b6.
  #_(.setObject prepared-statement index (into-array Byte (map #(Byte/valueOf %) object)) Types/BINARY)

  ;; Array of Bytes with jdbc type BINARY
  ;; Fails with
  ;; [Databricks][JDBC](11500) Given type does not match given object: [Ljava.lang.Byte;@1e1ac2b6.
  #_(.setObject prepared-statement index (into-array Byte (map #(Byte/valueOf %) object)) Types/VARBINARY)

  ;; Array of Bytes with no jdbc type
  ;; Fails with
  ;; HIVE_PARAMETER_QUERY_DATA_TYPE_ERR_NON_SUPPORT_DATA_TYPE
  #_(.setObject prepared-statement index (into-array Byte (map #(Byte/valueOf %) object)))

  ;; .setArray with array of Bytes with jdbc type "BINARY"
  ;; Fails with
  ;; [Databricks][JDSI](20300) Data type not supported: BINARY ({1})
  #_(let [connection (.getConnection prepared-statement)]
      (.setArray prepared-statement index
                 (.createArrayOf connection "BINARY"
                                 (into-array Byte (map #(Byte/valueOf %) object)))))

  ;; .setArray with array of Bytes with jdbc type "VARBINARY"
  ;; Fails with
  ;; Array is not valid
  #_(let [connection (.getConnection prepared-statement)]
      (.setArray prepared-statement index
                 (.createArrayOf connection "VARBINARY"
                                 (into-array Byte (map #(Byte/valueOf %) object)))))

  ;; .setArray with array of Bytes with jdbc type "ARRAY"
  ;; Fails with
  ;; [Databricks][JDSI](20300) Data type not supported: ARRAY ({1})
  #_(let [connection (.getConnection prepared-statement)]
      (.setArray prepared-statement index
                 (.createArrayOf connection "ARRAY"
                                 (into-array Byte (map #(Byte/valueOf %) object)))))

  ;; .setArray with array of Bytes with jdbc type "ARRAY<BINARY>"
  ;; Ingest "succeeds" but there are no rows in the table
  #_(let [connection (.getConnection prepared-statement)]
      (.setArray prepared-statement index
                 (.createArrayOf connection "ARRAY<BINARY>"
                                 (into-array Byte (map #(Byte/valueOf %) object)))))

  ;; Hex string
  ;; Fails with:
  ;; [Databricks][JDBC](11500) Given type does not match given object: 3230313930343231313634333030.
  #_(.setObject prepared-statement index (codecs/bytes->hex object) Types/BINARY)

  ;; base64 string
  ;; Fails with:
  ;; [Databricks][JDBC](11500) Given type does not match given object: MjAxOTA0MjExNjQzMDA=.
  #_(.setObject prepared-statement index (codecs/bytes->b64-str object) Types/BINARY))

(defmethod sql.qp/->integer :databricks
  [driver value]
  (sql.qp/->integer-with-round driver value))

(defmethod sql.qp/->honeysql [:databricks ::sql.qp/cast-to-text]
  [driver [_ expr]]
  (sql.qp/->honeysql driver [::sql.qp/cast expr "string"]))

(defmethod sql-jdbc/impl-table-known-to-not-exist? :databricks
  [_ e]
  (= (sql-jdbc/get-sql-state e) "42P01"))

(defmethod sql-jdbc.execute/read-column-thunk [:databricks Types/ARRAY]
  [_driver ^java.sql.ResultSet rs _rsmeta ^Integer i]
  ;; This differs from the sql-jdbc implementation due to a change in
  ;; Databricks' JDBC driver from 2.7.3 to 3.0.1. It returns the type
  ;; of an array column as Types/ARRAY now, but the object is a
  ;; java.lang.String, so we can't call .getArray on it and instead
  ;; should return it as is.
  (fn [] (.getObject rs i)))
