(ns metabase.test.data.presto-jdbc
  "Presto JDBC driver test extensions."
  (:require [clojure.string :as str]
            [metabase.config :as config]
            [metabase.connection-pool :as connection-pool]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.sql :as sql.tx]
            [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
            [metabase.test.data.sql-jdbc.execute :as execute]
            [metabase.test.data.sql-jdbc.load-data :as load-data]
            [metabase.test.data.sql.ddl :as ddl])
  (:import [java.sql Connection DriverManager PreparedStatement]))

(sql-jdbc.tx/add-test-extensions! :presto-jdbc)

;; during unit tests don't treat presto as having FK support
(defmethod driver/supports? [:presto-jdbc :foreign-keys] [_ _] (not config/is-test?))

(doseq [[base-type db-type] {:type/BigInteger             "BIGINT"
                             :type/Boolean                "BOOLEAN"
                             :type/Date                   "DATE"
                             :type/DateTime               "TIMESTAMP"
                             :type/DateTimeWithTZ         "TIMESTAMP WITH TIME ZONE"
                             :type/DateTimeWithZoneID     "TIMESTAMP WITH TIME ZONE"
                             :type/DateTimeWithZoneOffset "TIMESTAMP WITH TIME ZONE"
                             :type/Decimal                "DECIMAL"
                             :type/Float                  "DOUBLE"
                             :type/Integer                "INTEGER"
                             :type/Text                   "VARCHAR"
                             :type/Time                   "TIME"
                             :type/TimeWithTZ             "TIME WITH TIME ZONE"}]
  (defmethod sql.tx/field-base-type->sql-type [:presto-jdbc base-type] [_ _] db-type))

(defn- dash->underscore [nm]
  (str/replace nm #"-" "_"))

(defmethod tx/dbdef->connection-details :presto-jdbc
  [_ _ {:keys [database-name]}]
  {:host               (tx/db-test-env-var-or-throw :presto-jdbc :host "localhost")
   :port               (tx/db-test-env-var :presto-jdbc :port "8080")
   :user               (tx/db-test-env-var-or-throw :presto-jdbc :user "metabase")
   :additional-options (tx/db-test-env-var :presto-jdbc :additional-options nil)
   :ssl                (tx/db-test-env-var :presto-jdbc :ssl "false")
   :catalog            (dash->underscore database-name)
   :schema             (tx/db-test-env-var :presto-jdbc :schema nil)})

(defmethod execute/execute-sql! :presto-jdbc
  [& args]
  (apply execute/sequentially-execute-sql! args))

(defn- load-data [dbdef tabledef]
  ;; the JDBC driver statements fail with a cryptic status 500 error if there are too many
  ;; parameters being set in a single statement; these numbers were arrived at empirically
  (let [chunk-size (case (:table-name tabledef)
                     "people" 30
                     "reviews" 40
                     "orders" 30
                     "venues" 50
                     "products" 50
                     "cities" 50
                     "sightings" 50
                     "incidents" 50
                     "checkins" 25
                     "airport" 50
                     100)
        load-fn    (load-data/make-load-data-fn load-data/load-data-add-ids
                     (partial load-data/load-data-chunked pmap chunk-size))]
    (load-fn :presto-jdbc dbdef tabledef)))

(defmethod load-data/load-data! :presto-jdbc
  [_ dbdef tabledef]
  (load-data dbdef tabledef))

(defn- jdbc-spec->connection
  "This is to work around some weird interplay between clojure.java.jdbc caching behavior of connections based on URL,
  combined with the fact that the Presto driver apparently closes the connection when it closes a prepare statement.
  Therefore, create a fresh connection from the DriverManager."
  ^Connection [jdbc-spec]
  (DriverManager/getConnection (format "jdbc:%s:%s" (:subprotocol jdbc-spec) (:subname jdbc-spec))
    (connection-pool/map->properties (select-keys jdbc-spec [:user :SSL]))))

(defmethod load-data/do-insert! :presto-jdbc
  [driver spec table-identifier row-or-rows]
  (let [statements (ddl/insert-rows-ddl-statements driver table-identifier row-or-rows)]
    (with-open [conn (jdbc-spec->connection spec)]
      (doseq [[^String sql & params] statements]
        (try
          (with-open [^PreparedStatement stmt (.prepareStatement conn sql)]
            (sql-jdbc.execute/set-parameters! driver stmt params)
            (let [tbl-nm        ((comp last :components) (into {} table-identifier))
                  rows-affected (.executeUpdate stmt)]
              (println (format "[%s] Inserted %d rows into %s." driver rows-affected tbl-nm))))
          (catch Throwable e
            (throw (ex-info (format "[%s] Error executing SQL: %s" driver (ex-message e))
                     {:driver driver, :sql sql, :params params}
                     e))))))))

(defmethod sql.tx/drop-db-if-exists-sql :presto-jdbc [_ _] nil)
(defmethod sql.tx/create-db-sql         :presto-jdbc [_ _] nil)

(defmethod sql.tx/qualified-name-components :presto-jdbc
  ;; use the default schema from the in-memory connector
  ([_ db-name]                       [(dash->underscore db-name) "default"])
  ([_ db-name table-name]            [(dash->underscore db-name) "default" (dash->underscore table-name)])
  ([_ db-name table-name field-name] [(dash->underscore db-name) "default" (dash->underscore table-name) field-name]))

(defmethod sql.tx/pk-sql-type :presto-jdbc
  [_]
  "INTEGER")

(defmethod sql.tx/create-table-sql :presto-jdbc
  [driver dbdef tabledef]
  ;; strip out the PRIMARY KEY stuff from the CREATE TABLE statement
  (let [sql ((get-method sql.tx/create-table-sql :sql/test-extensions) driver dbdef tabledef)]
    (str/replace sql #", PRIMARY KEY \([^)]+\)" "")))

(defmethod tx/format-name :presto-jdbc [_ table-or-field-name]
  (dash->underscore table-or-field-name))

;; Presto doesn't support FKs, at least not adding them via DDL
(defmethod sql.tx/add-fk-sql :presto-jdbc
  [_ _ _ _]
  nil)

;; FIXME Presto actually has very good timezone support
#_(defmethod tx/has-questionable-timezone-support? :presto-jdbc [_] true)
