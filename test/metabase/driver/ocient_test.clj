(ns metabase.driver.ocient-test
  (:require [clojure.test :refer :all]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.sync :as sync]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.test.data.sql-jdbc.execute :as execute]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db]))

(deftest additional-connection-string-options-test
  (mt/test-driver :ocient
                  (testing "Make sure you can add additional connection string options "
                    (is (= {:classname   "com.ocient.jdbc.JDBCDriver"
                            :subprotocol "ocient"
                            :sslmode     "disable"
                            :pooling     "OFF"
                            :force       "true"
                            :subname     "//sales-sql0:4050/metabase;loglevel=DEBUG;logfile=jdbc_trace.out"}
                           (sql-jdbc.conn/connection-details->spec :ocient {:host               "sales-sql0"
                                                                            :port               4050
                                                                            :db                 "metabase"
                                                                            :additional-options "loglevel=DEBUG;logfile=jdbc_trace.out"}))))))

(deftest insert-rows-ddl-test
  (mt/test-driver :ocient
                  (testing "Make sure we're generating correct DDL for Ocient to insert all rows at once."
                    (is (= [[(str "INSERT INTO \"metabase\".\"my_table\""
                                  " SELECT ?, 1 UNION ALL"
                                  " SELECT ?, 2 UNION ALL"
                                  " SELECT ?, 3")
                             "A"
                             "B"
                             "C"]]
                           (ddl/insert-rows-ddl-statements :ocient (hx/identifier :table "my_db" "my_table") [{:col1 "A", :col2 1}
                                                                                                              {:col1 "B", :col2 2}
                                                                                                              {:col1 "C", :col2 3}]))))))

(deftest datatype-conversion-test
  (mt/test-driver :ocient
                  (testing "Make sure we convert all the Ocient DB types to Metabase base types correctly"
                    (let [dbname (apply str "tst" (repeatedly 20 #(rand-nth (map char (range (int \a) (inc (int \z)))))))
                          dbdef {:database-name dbname}
                          tablename "data_conversion_test"]

                      ;; Setup the DB
                      (execute/execute-sql! :ocient :server dbdef (format "DROP DATABASE IF EXISTS \"%s\"" dbname))
                      (execute/execute-sql! :ocient :server dbdef (format "CREATE DATABASE \"%s\"" dbname))
                      (execute/execute-sql! :ocient :db dbdef (format "CREATE TABLE \"metabase\".\"%s\"
                                                                      (id INT NOT NULL, field_array INT[] NULL, field_tuple TUPLE<<INT, BIGINT>> NULL, field_varbinary varbinary(10) NULL, field_binary binary(4) NULL, field_hash hash(3) NULL, field_byte BYTE NULL, field_point POINT NULL, field_stpoint ST_POINT NULL, field_linestring LINESTRING NULL, field_stlinestring ST_LINESTRING NULL, field_polygon POLYGON NULL, field_stpolygon ST_POLYGON NULL, field_bigint BIGINT NULL, field_smallint SMALLINT NULL, field_tinyint TINYINT NULL, field_int INT NULL, field_varchar VARCHAR(255) NULL, field_character CHARACTER(10) NULL, field_char CHAR(10) NULL, field_real REAL NULL, field_double DOUBLE NULL, field_double_precision DOUBLE PRECISION NULL, field_float FLOAT NULL, field_single_precision SINGLE PRECISION NULL, field_decimal DECIMAL(5,2) NULL, field_boolean BOOLEAN NULL, field_timestamp TIMESTAMP NULL, field_datetime DATETIME NULL, field_date DATE NULL, field_time TIME NULL, field_ipv4 IPV4 NULL, field_ip IP NULL, field_uuid UUID NULL,
                                                                      CLUSTERING INDEX idx01 (id))
                                                                      AS SELECT 0, int[](), tuple<<int,bigint>>(10, 9876543210), 'aabbccddeeff', '01234567', 'abcdef', 127, 'POINT(-87.6410 41.8841)', 'POINT(47.6410 11.8011)', 'LINESTRING(0 0,2 0)', 'LINESTRING(0 0,3 0)', 'POLYGON((0 0,2 0,5 5,0 2,0 0), (0 0,1 0,2 2,0 2,0 0))', 'POLYGON((0 0,1 0,5 5,0 1,0 0), (0 0,1 0,10 10,0 1,0 0))', 9876543210, 32767, 127, 123456789, 'porcupine', 'tree', 'apple', 2.718, 2.719, 2.720, 2.721, 2.722, 123.45, 'true', '2000:01:02T12:34:45', '2001:01:02T12:34:45', '2020-02-02', '12:34:56.012345678', '127.0.0.1', '0123:4567:89ab:cdef:0123:4567:89ab:cdef', '01234567-89ab-cdef-1357-0123456789ab' 
                                                                      LIMIT 0"
                                                                      tablename))

                      ;; Sync the DB and make sure columns converted to the correct base type
                      (let [details (tx/dbdef->connection-details :ocient :db {:database-name dbname})]
                        (mt/with-temp Database [database {:engine :ocient, :details (assoc details :dbname dbname)}]
                          (mt/with-db database
                            (sync/sync-database! (mt/db))
                          
                            (is (= [{:name "field_array",             :base_type :type/Array}
                                    {:name "field_bigint",            :base_type :type/BigInteger}
                                    {:name "field_binary",            :base_type :type/*}
                                    {:name "field_boolean",           :base_type :type/Boolean}
                                    {:name "field_byte",              :base_type :type/*}
                                    {:name "field_char",              :base_type :type/Text}
                                    {:name "field_character",         :base_type :type/Text}
                                    {:name "field_date",              :base_type :type/Date}
                                    {:name "field_datetime",          :base_type :type/DateTime}
                                    {:name "field_decimal",           :base_type :type/Decimal}
                                    {:name "field_double",            :base_type :type/Float}
                                    {:name "field_double_precision",  :base_type :type/Float}
                                    {:name "field_float",             :base_type :type/Float}
                                    {:name "field_hash",              :base_type :type/*}
                                    {:name "field_int",               :base_type :type/Integer}
                                    {:name "field_ip",                :base_type :type/IPAddress}
                                    {:name "field_ipv4",              :base_type :type/IPAddress}
                                    {:name "field_linestring",        :base_type :type/*}
                                    {:name "field_point",             :base_type :type/*}
                                    {:name "field_polygon",           :base_type :type/*}
                                    {:name "field_real",              :base_type :type/Float}
                                    {:name "field_single_precision",  :base_type :type/Float}
                                    {:name "field_smallint",          :base_type :type/Integer}
                                    {:name "field_stlinestring",      :base_type :type/*}
                                    {:name "field_stpoint",           :base_type :type/*}
                                    {:name "field_stpolygon",         :base_type :type/*}
                                    {:name "field_time",              :base_type :type/Time}
                                    {:name "field_timestamp",         :base_type :type/DateTime}
                                    {:name "field_tinyint",           :base_type :type/*}
                                    {:name "field_tuple",             :base_type :type/Array}
                                    {:name "field_uuid",              :base_type :type/UUID}
                                    {:name "field_varbinary",         :base_type :type/*}
                                    {:name "field_varchar",           :base_type :type/Text}
                                    {:name "id",                      :base_type :type/Integer}]
                                  (map
                                    (partial into {})
                                    (db/select [Field :name :base_type] :table_id (mt/id (keyword tablename)) {:order-by [:name]})))))))

                      ;; Clean up 
                      (execute/execute-sql! :ocient :db dbdef (format "DROP TABLE IF EXISTS \"metabase\".\"%s\"" tablename))
                      (execute/execute-sql! :ocient :server dbdef (format "DROP DATABASE IF EXISTS \"%s\"" dbname))))))
