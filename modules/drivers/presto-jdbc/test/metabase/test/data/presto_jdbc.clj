(ns metabase.test.data.presto-jdbc
  "Presto JDBC driver test extensions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util.log :as log])
  (:import
   (java.sql Connection PreparedStatement)))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :presto-jdbc)

(defmethod tx/sorts-nil-first? :presto-jdbc [_ _] false)

;; during unit tests don't treat presto as having FK support
(defmethod driver/database-supports? [:presto-jdbc :foreign-keys] [_driver _feature _db] (not config/is-test?))

(defmethod tx/aggregate-column-info :presto-jdbc
  ([driver ag-type]
   ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (= ag-type :sum)
      {:base_type :type/BigInteger}))))

(prefer-method tx/aggregate-column-info :presto-jdbc ::tx/test-extensions)

;; in the past, we had to manually update our Docker image and add a new catalog for every new dataset definition we
;; added. That's insane. Just use the `test-data` catalog and put everything in that, and use
;; `db-qualified-table-name` like everyone else.
(def ^:private test-catalog-name "test_data")


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

(defn dbdef->connection-details [_database-name]
  (let [base-details
        {:host                               (tx/db-test-env-var-or-throw :presto-jdbc :host "localhost")
         :port                               (tx/db-test-env-var :presto-jdbc :port "8080")
         :user                               (tx/db-test-env-var-or-throw :presto-jdbc :user "metabase")
         :additional-options                 (tx/db-test-env-var :presto-jdbc :additional-options nil)
         :ssl                                (tx/db-test-env-var :presto-jdbc :ssl "false")
         :ssl-keystore-path                  (tx/db-test-env-var :presto-jdbc :ssl-keystore-path nil)
         :ssl-keystore-password-value        (tx/db-test-env-var :presto-jdbc :ssl-keystore-password nil)
         :ssl-truststore-path                (tx/db-test-env-var :presto-jdbc :ssl-truststore-path nil)
         :ssl-truststore-password-value      (tx/db-test-env-var :presto-jdbc :ssl-truststore-password nil)
         :kerberos                           (tx/db-test-env-var :presto-jdbc :kerberos "false")
         :kerberos-principal                 (tx/db-test-env-var :presto-jdbc :kerberos-principal nil)
         :kerberos-remote-service-name       (tx/db-test-env-var :presto-jdbc :kerberos-remote-service-name nil)
         :kerberos-use-canonical-hostname    (tx/db-test-env-var :presto-jdbc :kerberos-use-canonical-hostname nil)
         :kerberos-credential-cache-path     (tx/db-test-env-var :presto-jdbc :kerberos-credential-cache-path nil)
         :kerberos-keytab-path               (tx/db-test-env-var :presto-jdbc :kerberos-keytab-path nil)
         :kerberos-config-path               (tx/db-test-env-var :presto-jdbc :kerberos-config-path nil)
         :kerberos-service-principal-pattern (tx/db-test-env-var :presto-jdbc :kerberos-service-principal-pattern nil)
         :catalog                            test-catalog-name
         :schema                             (tx/db-test-env-var :presto-jdbc :schema nil)}]
    (assoc base-details
           :ssl-use-keystore (every? some? (map base-details [:ssl-keystore-path :ssl-keystore-password-value]))
           :ssl-use-truststore (every? some? (map base-details [:ssl-truststore-path :ssl-truststore-password-value])))))

(defmethod tx/dbdef->connection-details :presto-jdbc
  [_ _ {:keys [database-name]}]
  (dbdef->connection-details database-name))

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

(defmethod load-data/do-insert! :presto-jdbc
  [driver spec table-identifier row-or-rows]
  (let [statements (ddl/insert-rows-ddl-statements driver table-identifier row-or-rows)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     spec
     {:write? true, :presto-jdbc/force-fresh? true}
     (fn [^Connection conn]
       (doseq [[^String sql & params] statements]
         (try
           (with-open [^PreparedStatement stmt (.prepareStatement conn sql)]
             (sql-jdbc.execute/set-parameters! driver stmt params)
             (let [[_tag _identifier-type components] table-identifier
                   table-name                         (last components)
                   rows-affected                      (.executeUpdate stmt)]
               (log/infof "[%s] Inserted %d rows into %s." driver rows-affected table-name)))
           (catch Throwable e
             (throw (ex-info (format "[%s] Error executing SQL: %s" driver (ex-message e))
                             {:driver driver, :sql sql, :params params}
                             e)))))))))

(defmethod sql.tx/drop-db-if-exists-sql :presto-jdbc [_ _] nil)
(defmethod sql.tx/create-db-sql         :presto-jdbc [_ _] nil)

(defmethod sql.tx/qualified-name-components :presto-jdbc
  ;; use the default schema from the in-memory connector
  ([_ _db-name]                      [test-catalog-name "default"])
  ([_ db-name table-name]            [test-catalog-name "default" (tx/db-qualified-table-name db-name table-name)])
  ([_ db-name table-name field-name] [test-catalog-name "default" (tx/db-qualified-table-name db-name table-name) field-name]))

(defmethod sql.tx/pk-sql-type :presto-jdbc
  [_]
  "INTEGER")

(defmethod sql.tx/create-table-sql :presto-jdbc
  [driver dbdef tabledef]
  ;; Presto doesn't support NOT NULL columns
  (let [tabledef (update tabledef :field-definitions (fn [field-defs]
                                                       (for [field-def field-defs]
                                                         (dissoc field-def :not-null?))))
        ;; strip out the PRIMARY KEY stuff from the CREATE TABLE statement
        sql      ((get-method sql.tx/create-table-sql :sql/test-extensions) driver dbdef tabledef)]
    (str/replace sql #", PRIMARY KEY \([^)]+\)" "")))

(deftest ^:parallel create-table-sql-test
  (testing "Make sure logic to strip out NOT NULL and PRIMARY KEY stuff works as expected"
    (let [db-def    (update (tx/get-dataset-definition defs/test-data)
                            :table-definitions (partial #'ddl/add-pks-if-needed :presto-jdbc))
          table-def (-> db-def :table-definitions second)]
      (is (= "CREATE TABLE \"test_data\".\"default\".\"test_data_categories\" (\"id\" INTEGER, \"name\" VARCHAR) ;"
             (sql.tx/create-table-sql :presto-jdbc db-def table-def))))))

(defmethod ddl.i/format-name :presto-jdbc
  [_driver table-or-field-name]
  (str/replace table-or-field-name #"-" "_"))

;; Presto doesn't support FKs, at least not adding them via DDL
(defmethod sql.tx/add-fk-sql :presto-jdbc
  [_driver _dbdef _tabledef _fielddef]
  nil)
