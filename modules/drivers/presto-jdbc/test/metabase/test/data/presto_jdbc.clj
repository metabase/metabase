(ns metabase.test.data.presto-jdbc
  "Presto JDBC driver test extensions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.presto-jdbc :as presto-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
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
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :presto-jdbc)

(defmethod tx/sorts-nil-first? :presto-jdbc [_ _] false)

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
(def ^:private ^String test-catalog-name "test_data")

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

(defn db-connection-details []
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
  [_driver _connection-type _dbdef]
  (db-connection-details))

(defmethod execute/execute-sql! :presto-jdbc
  [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod load-data/chunk-size :presto-jdbc
  [_driver _dbdef _tabledef]
  nil)

(defmethod load-data/row-xform :presto-jdbc
  [_driver _dbdef _tabledef]
  (load-data/add-ids-xform))

(defmethod ddl/insert-rows-dml-statements :presto-jdbc
  [driver table-identifier rows]
  (def %rows rows)
  (binding [driver/*compile-with-inline-parameters* true]
    ((get-method ddl/insert-rows-dml-statements :sql-jdbc/test-extensions) driver table-identifier rows)))

;;; it seems to be significantly faster to load rows in batches of 500 in parallel than to try to load all the rows in
;;; a few giant SQL statement. It seems like batch size = 5000 is a working limit here but
(defmethod load-data/do-insert! :presto-jdbc
  [driver ^Connection conn table-identifier rows]
  (dorun
   (pmap
    (fn [rows]
      (let [statements (ddl/insert-rows-dml-statements driver table-identifier rows)]
        (doseq [[^String sql & params] statements]
          (assert (empty? params))
          (try
            (with-open [stmt (.createStatement conn)]
              (let [[_tag _identifier-type components] table-identifier
                    table-name                         (last components)]
                (.execute stmt sql)
                (log/infof "[%s] Inserted %d rows into %s." driver (count rows) table-name)))
            (catch Throwable e
              (throw (ex-info (format "[%s] Error executing SQL: %s" driver (ex-message e))
                              {:driver driver, :sql sql}
                              e)))))))
    (partition-all 500 rows))))

(defmethod sql.tx/drop-db-if-exists-sql :presto-jdbc [_ _] nil)
(defmethod sql.tx/create-db-sql         :presto-jdbc [_ _] nil)

(def ^:private ^String test-schema "default")

(defmethod sql.tx/qualified-name-components :presto-jdbc
  ;; use the default schema from the in-memory connector
  ([_ _db-name]                      [test-catalog-name test-schema])
  ([_ db-name table-name]            [test-catalog-name test-schema (tx/db-qualified-table-name db-name table-name)])
  ([_ db-name table-name field-name] [test-catalog-name test-schema (tx/db-qualified-table-name db-name table-name) field-name]))

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

(defmethod tx/dataset-already-loaded? :presto-jdbc
  [driver dbdef]
  ;; check and make sure the first table in the dbdef has been created.
  (let [tabledef   (first (:table-definitions dbdef))
        ;; table-name should be something like test_data_venues
        table-name (tx/db-qualified-table-name (:database-name dbdef) (:table-name tabledef))
        _          (assert (some? tabledef))
        details    (tx/dbdef->connection-details driver :db dbdef)
        jdbc-spec  (sql-jdbc.conn/connection-details->spec driver details)]
    (try
      (sql-jdbc.execute/do-with-connection-with-options
       driver
       jdbc-spec
       {:write? false}
       (fn [^Connection conn]
         ;; look at all the tables in the test schema.
         (let [^String sql (#'presto-jdbc/describe-schema-sql driver test-catalog-name test-schema)]
           (with-open [stmt (.createStatement conn)
                       rset (.executeQuery stmt sql)]
             (loop []
               ;; if we see the table with the name we're looking for, we're done here; otherwise keep iterating thru
               ;; the existing tables.
               (cond
                 (not (.next rset))                       false
                 (= (.getString rset "table") table-name) true
                 :else                                    (recur)))))))
      (catch Throwable _e
        false))))
