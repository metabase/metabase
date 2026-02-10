(ns metabase.driver.clickhouse-introspection
  (:refer-clojure :exclude [empty? get-in])
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
   [metabase.util :as u]
   [metabase.util.performance :refer [empty? get-in]])
  (:import
   (java.sql Connection DatabaseMetaData)))

(set! *warn-on-reflection* true)

(def ^:private database-type->base-type
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [[#"array"       :type/Array]
    [#"bool"        :type/Boolean]
    [#"date"        :type/Date]
    [#"date32"      :type/Date]
    [#"decimal"     :type/Decimal]
    [#"enum8"       :type/Text]
    [#"enum16"      :type/Text]
    [#"fixedstring" :type/TextLike]
    [#"float32"     :type/Float]
    [#"float64"     :type/Float]
    [#"int8"        :type/Integer]
    [#"int16"       :type/Integer]
    [#"int32"       :type/Integer]
    [#"int64"       :type/BigInteger]
    [#"ipv4"        :type/IPAddress]
    [#"ipv6"        :type/IPAddress]
    [#"map"         :type/Dictionary]
    [#"string"      :type/Text]
    [#"tuple"       :type/*]
    [#"uint8"       :type/Integer]
    [#"uint16"      :type/Integer]
    [#"uint32"      :type/Integer]
    [#"uint64"      :type/BigInteger]
    [#"uuid"        :type/UUID]]))

(defn- normalize-db-type
  [db-type]
  (cond
    ;; LowCardinality
    (str/starts-with? db-type "lowcardinality")
    (normalize-db-type (subs db-type 15 (dec (count db-type))))
    ;; Nullable
    (str/starts-with? db-type "nullable")
    (normalize-db-type (subs db-type 9 (dec (count db-type))))
    ;; for test purposes only: GMT0 is a legacy timezone;
    ;; it maps to LocalDateTime instead of OffsetDateTime
    ;; (= db-type "datetime64(3, 'gmt0')")
    ;; :type/DateTime
    ;; DateTime64
    (str/starts-with? db-type "datetime64")
    (if (> (count db-type) 13) :type/DateTimeWithLocalTZ :type/DateTime)
    ;; DateTime
    (str/starts-with? db-type "datetime")
    (if (> (count db-type) 8) :type/DateTimeWithLocalTZ :type/DateTime)
    ;; Enum*
    (str/starts-with? db-type "enum")
    :type/Text
    ;; Map
    (str/starts-with? db-type "map")
    :type/Dictionary
    ;; Tuple
    (str/starts-with? db-type "tuple")
    :type/*
    ;; SimpleAggregateFunction
    (str/starts-with? db-type "simpleaggregatefunction")
    (normalize-db-type (subs db-type (+ (str/index-of db-type ",") 2) (dec (count db-type))))
    ;; _
    :else (or (database-type->base-type (keyword db-type)) :type/*)))

;; Enum8(UInt8) -> :type/Text, DateTime64(Europe/Amsterdam) -> :type/DateTime,
;; Nullable(DateTime) -> :type/DateTime, SimpleAggregateFunction(sum, Int64) -> :type/BigInteger, etc
(defmethod sql-jdbc.sync/database-type->base-type :clickhouse
  [_ database-type]
  (let [db-type (if (keyword? database-type)
                  (subs (str database-type) 1)
                  database-type)]
    (normalize-db-type (u/lower-case-en db-type))))

(defmethod sql-jdbc.sync/excluded-schemas :clickhouse [_]
  #{"system" "information_schema" "INFORMATION_SCHEMA"})

(def ^:private allowed-table-types
  (into-array String
              ["TABLE" "VIEW" "FOREIGN TABLE" "REMOTE TABLE" "DICTIONARY"
               "MATERIALIZED VIEW" "MEMORY TABLE" "LOG TABLE"]))

(defn- tables-set
  [tables]
  (set
   (for [table tables]
     (let [remarks (:remarks table)]
       {:name (:table_name table)
        :schema (:table_schem table)
        :description (when-not (str/blank? remarks) remarks)}))))

(defn- get-tables-from-metadata
  [^DatabaseMetaData metadata schema-pattern]
  (.getTables metadata
              nil            ; catalog - unused in the source code there
              schema-pattern
              "%"            ; tablePattern "%" = match all tables
              allowed-table-types))

(defn- not-inner-mv-table?
  [table]
  (not (str/starts-with? (:table_name table) ".inner")))

(defn- get-all-tables-in-all-dbs
  [driver db]
  (let [db-filters-patterns (set (map (comp #(ddl.i/format-name driver %) str/trim)
                                      (remove empty? (str/split (or (get-in db [:details :db-filters-patterns]) "") #","))))
        db-filters-type     (get-in db [:details :db-filters-type])]
    (sql-jdbc.execute/do-with-connection-with-options
     driver db nil
     (fn [^Connection conn]
       (->> (get-tables-from-metadata (.getMetaData conn) "%")
            jdbc/metadata-result
            vec
            (filter not-inner-mv-table?)
            (filter (fn [table]
                      (cond
                        (= db-filters-type "inclusion")
                        (contains? db-filters-patterns (:table_schem table))

                        (= db-filters-type "exclusion")
                        (and (not (contains? db-filters-patterns (:table_schem table)))
                             (not (contains? (sql-jdbc.sync/excluded-schemas driver) (:table_schem table))))

                        :else
                        (not (contains? (sql-jdbc.sync/excluded-schemas driver) (:table_schem table))))))
            tables-set)))))

;; Strangely enough, the tests only work with :db keyword,
;; but the actual sync from the UI uses :dbname
(defn- get-db-name
  [db]
  (or (get-in db [:details :dbname])
      (get-in db [:details :db])))

(defn- get-tables-in-db
  [driver db]
  (->> (let [db-name (ddl.i/format-name driver (or (get-db-name db) "default"))]
         (sql-jdbc.execute/do-with-connection-with-options
          driver db nil
          (fn [^Connection conn]
            (-> (.getMetaData conn)
                (get-tables-from-metadata db-name)
                jdbc/metadata-result))))
       (filter not-inner-mv-table?)
       (tables-set)
       (set)))

(defmethod driver/describe-database* :clickhouse
  [driver {{:keys [enable-multiple-db]}
           :details :as db}]
  {:tables
   (if (boolean enable-multiple-db)
     (get-all-tables-in-all-dbs driver db)
     (get-tables-in-db driver db))})

(defn- ^:private is-db-required?
  [field]
  (not (str/starts-with? (get field :database-type) "Nullable")))

(defmethod driver/describe-table :clickhouse
  [_driver database table]
  (let [table-metadata (sql-jdbc.sync/describe-table :clickhouse database table)
        filtered-fields (for [field (:fields table-metadata)
                              :let [updated-field (update field :database-required
                                                          (fn [_] (is-db-required? field)))]
                              ;; Skip all AggregateFunction (but keeping SimpleAggregateFunction) columns
                              ;; JDBC does not support that and it crashes the data browser
                              :when (not (re-matches #"^AggregateFunction\(.+$"
                                                     (get field :database-type)))]
                          updated-field)]
    (merge table-metadata {:fields (set filtered-fields)})))

(defmethod sql-jdbc.describe-table/get-table-pks :clickhouse
  [_driver ^java.sql.Connection conn db-name-or-nil table]
  ;; JDBC v2 sets the PKs now, so that :metadata/key-constraints feature should be enabled;
  ;; however, enabling :metadata/key-constraints will also enable left-join tests which are currently failing
  (if (not driver-api/is-test?)
    (sql-jdbc.describe-table/get-table-pks :sql-jdbc conn db-name-or-nil table)
    []))
