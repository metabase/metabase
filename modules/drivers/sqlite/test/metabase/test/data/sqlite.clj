(ns metabase.test.data.sqlite
  (:require
   [clojure.java.io :as io]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :sqlite)

(defmethod driver/database-supports? [:sqlite :test/timestamptz-type]
  [_driver _feature _database]
  false)

;; TODO: It seems that foreign keys sync does not work on sqlite. The [[metabase.driver-test/describe-table-fks-test]]
;;       is failing. Resolve that and re-enable feature!
;;       Tracked by: https://github.com/metabase/metabase/issues/45788
(defmethod driver/database-supports? [:sqlite :metadata/key-constraints] [_driver _feature _db] (not config/is-test?))

(defn- db-file-name [dbdef]
  (str (tx/escaped-database-name dbdef) ".sqlite"))

(defmethod tx/dbdef->connection-details :sqlite
  [_driver _context dbdef]
  {:db (db-file-name dbdef)})

(doseq [[base-type sql-type] {:type/BigInteger "BIGINT"
                              :type/Boolean    "BOOLEAN"
                              :type/Date       "DATE"
                              :type/DateTime   "DATETIME"
                              :type/Decimal    "DECIMAL"
                              :type/Float      "DOUBLE"
                              :type/Integer    "INTEGER"
                              :type/Text       "TEXT"
                              :type/Time       "TIME"}]
  (defmethod sql.tx/field-base-type->sql-type [:sqlite base-type] [_ _] sql-type))

(defmethod sql.tx/pk-sql-type :sqlite [_] "INTEGER")

(defmethod tx/aggregate-column-info :sqlite
  ([driver ag-type]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Integer})))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Integer}))))

(defmethod execute/execute-sql! :sqlite [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/drop-db-if-exists-sql :sqlite [& _] nil)
(defmethod sql.tx/create-db-sql         :sqlite [& _] nil)
(defmethod sql.tx/add-fk-sql            :sqlite [& _] nil) ; TODO - fix me

(defmethod tx/destroy-db! :sqlite
  [_driver dbdef]
  (let [file (io/file (db-file-name dbdef))]
    (when (.exists file)
      (.delete file))))

(defmethod tx/dataset-already-loaded? :sqlite
  [driver dbdef]
  ;; check and make sure the first table in the dbdef has been created.
  (let [{:keys [table-name], :as _tabledef} (first (:table-definitions dbdef))]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     (sql-jdbc.conn/connection-details->spec driver (tx/dbdef->connection-details driver :db dbdef))
     {:write? false}
     (fn [^java.sql.Connection conn]
       (with-open [rset (.getTables (.getMetaData conn)
                                    #_catalog        nil
                                    #_schema-pattern nil
                                    #_table-pattern  table-name
                                    #_types          (into-array String ["TABLE"]))]
         ;; if the ResultSet returns anything we know the table is already loaded.
         (.next rset))))))
