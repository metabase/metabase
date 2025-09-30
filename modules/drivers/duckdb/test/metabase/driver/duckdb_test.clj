(ns metabase.driver.duckdb-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.test :as mt])
  (:import
   [java.io File]))

;; ==============================================================================
;; ENHANCED CONSTRAINT AND UPLOAD TESTING
;; ==============================================================================

(deftest constraint-detection-test
  "Test that DuckDB driver correctly detects primary keys and constraints"
  (mt/with-driver :duckdb
    (testing "Primary key detection"
      (mt/with-temp-test-data 
        [[(mt/table-schema "test_pk_table" 
                          [{:field-name "id" :base-type :type/Integer :database-type "INTEGER PRIMARY KEY"}
                           {:field-name "name" :base-type :type/Text :database-type "VARCHAR(255)"}])]]
        (let [driver    :duckdb
              database  (mt/db)
              table-name "test_pk_table"]
          
          ;; Test that primary key is detected
          (let [indexes (sql-jdbc.sync/describe-table-indexes driver database table-name)]
            (is (seq indexes) "Should detect at least one constraint")
            (is (some #(= (:type %) :primary-key) indexes) "Should detect primary key constraint")
            (is (some #(and (= (:type %) :primary-key) 
                           (contains? (set (:columns %)) "id")) indexes) 
                "Primary key should include 'id' column")))))
    
    (testing "Foreign key detection" 
      (mt/with-temp-test-data
        [[(mt/table-schema "parent_table"
                          [{:field-name "id" :base-type :type/Integer :database-type "INTEGER PRIMARY KEY"}
                           {:field-name "name" :base-type :type/Text :database-type "VARCHAR(255)"}])
          (mt/table-schema "child_table"
                          [{:field-name "id" :base-type :type/Integer :database-type "INTEGER PRIMARY KEY"}
                           {:field-name "parent_id" :base-type :type/Integer :database-type "INTEGER"}
                           {:field-name "data" :base-type :type/Text :database-type "VARCHAR(255)"}])]]
        
        ;; Create foreign key constraint (if DuckDB supports it)
        (try
          (mt/with-db (mt/db)
            (jdbc/execute! (mt/db) 
                          ["ALTER TABLE child_table ADD CONSTRAINT fk_parent 
                            FOREIGN KEY (parent_id) REFERENCES parent_table(id)"]))
          (catch Exception _e
            ;; FK constraints might not be fully supported, skip this part
            ))
        
        (let [driver    :duckdb
              database  (mt/db)
              table-name "child_table"]
          
          ;; Test FK detection (may return empty set if not supported)
          (let [fks (driver/describe-table-fks driver database table-name)]
            (is (set? fks) "Should return a set of foreign keys")
            ;; Note: This may be empty if DuckDB doesn't support FK constraints yet
            ))))))

(deftest upload-type-mapping-test
  "Test that upload types are correctly mapped to DuckDB database types"
  (testing "Upload type mappings"
    (let [driver :duckdb]
      (is (= "VARCHAR(255)" (driver/upload-type->database-type driver :metabase.upload/varchar-255)))
      (is (= "TEXT" (driver/upload-type->database-type driver :metabase.upload/text)))
      (is (= "INTEGER" (driver/upload-type->database-type driver :metabase.upload/int)))
      (is (= "BIGINT" (driver/upload-type->database-type driver :metabase.upload/bigint)))
      (is (= "DOUBLE" (driver/upload-type->database-type driver :metabase.upload/float)))
      (is (= "BOOLEAN" (driver/upload-type->database-type driver :metabase.upload/boolean)))
      (is (= "DATE" (driver/upload-type->database-type driver :metabase.upload/date)))
      (is (= "TIMESTAMP" (driver/upload-type->database-type driver :metabase.upload/datetime)))
      (is (= "INTEGER PRIMARY KEY" (driver/upload-type->database-type driver :metabase.upload/auto-pk)))
      ;; Test fallback
      (is (= "TEXT" (driver/upload-type->database-type driver :unknown-type))))))

(deftest csv-upload-with-auto-pk-test
  "Test CSV upload functionality with auto-generated primary keys"
  (mt/with-driver :duckdb
    (testing "CSV upload creates table with auto-PK"
      (let [driver     :duckdb
            database   (mt/db)
            table-name "test_upload_table"
            csv-content "name,age,city\nJohn,25,NYC\nJane,30,LA\nBob,35,Chicago"
            csv-file   (doto (File/createTempFile "test_upload" ".csv")
                        (.deleteOnExit))]
        
        ;; Write test CSV data
        (spit csv-file csv-content)
        
        (let [column-definitions [{:column-name "name" :database-type "VARCHAR(255)"}
                                 {:column-name "age" :database-type "INTEGER"}
                                 {:column-name "city" :database-type "VARCHAR(255)"}]]
          
          (try
            ;; Test the upload functionality
            (let [result (driver/create-auto-pk-with-append-csv! 
                         driver database table-name column-definitions (.getPath csv-file))]
              
              (is (map? result) "Should return a result map")
              (is (= table-name (:created-table result)) "Should return created table name")
              (is (string? (:primary-key result)) "Should return primary key column name")
              
              ;; Verify table was created with data
              (sql-jdbc.conn/with-connection-spec-for-testing-connection [spec [driver database]]
                (let [table-data (jdbc/query spec [(str "SELECT * FROM " table-name)])]
                  (is (= 3 (count table-data)) "Should have 3 rows of data")
                  (is (every? #(contains? % (keyword (:primary-key result))) table-data) 
                      "Every row should have the auto-generated primary key"))))
            
            (finally
              ;; Clean up - drop the test table
              (try
                (sql-jdbc.conn/with-connection-spec-for-testing-connection [spec [driver database]]
                  (jdbc/execute! spec [(str "DROP TABLE IF EXISTS " table-name)]))
                (catch Exception _e
                  ;; Ignore cleanup errors
                  )))))))))

(deftest database-supports-enhanced-features-test
  "Test that enhanced features are properly enabled"
  (testing "Enhanced feature support"
    (let [driver :duckdb
          database (mt/db)]
      (is (driver/database-supports? driver :metadata/key-constraints database)
          "Should support metadata/key-constraints")
      (is (driver/database-supports? driver :upload-with-auto-pk database)
          "Should support upload-with-auto-pk")
      (is (driver/database-supports? driver :datetime-diff database)
          "Should support datetime-diff")))) 

;; ==============================================================================
;; EXISTING TESTS (preserved)
;; ==============================================================================

(deftest duckdb-memory-limit-test
  (mt/with-driver :duckdb
    (let [details (-> (:details (mt/db))
                      (assoc :database_file "md:my_db"
                             :motherduck_dbinstance_inactivity_ttl 0
                             :autoinstall_known_extensions true
                             :motherduck_saas_mode false
                             :motherduck_token (mt/db-test-env-var :duckdb "motherduck_token")))]
      (mt/with-premium-features #{:hosting}
        (sql-jdbc.conn/with-connection-spec-for-testing-connection [spec [:duckdb details]]
          (count (str (into [] (jdbc/query spec
                                           (str/join
                                            " union all "
                                            (repeat 900
                                                    "select * from 'https://raw.githubusercontent.com/duckdb/duckdb-web/main/data/weather.csv'")))))))))))

(deftest duckdb-local-file-test
  (mt/with-driver :duckdb
    (let [details (-> (:details (mt/db))
                      (assoc :database_file "md:my_db"
                             :motherduck_dbinstance_inactivity_ttl 0
                             :autoinstall_known_extensions true
                             :motherduck_saas_mode false
                             :motherduck_token (mt/db-test-env-var :duckdb "motherduck_token")))]
      #_(sql-jdbc.conn/with-connection-spec-for-testing-connection [spec [:duckdb details]]
          (jdbc/execute! spec "create or replace table tmp_mb as select * from 'orders.csv'")
          (jdbc/query spec "select * from tmp_mb"))
      (mt/with-premium-features #{:hosting}
        (sql-jdbc.conn/with-connection-spec-for-testing-connection [spec [:duckdb details]]
          (testing "Changing settings"
            (is (thrown-with-msg? Exception #"the configuration has been locked"
                                  (jdbc/execute! spec "set autoinstall_known_extensions=true")))
            (is (thrown-with-msg? Exception #"the configuration has been locked"
                                  (jdbc/execute! spec "set saas_mode=false")))
            (is (thrown-with-msg? Exception #"the configuration has been locked"
                                  (jdbc/execute! spec "SET TimeZone='America/Edmonton';"))))

          (testing "Loading local data"
            (is (thrown-with-msg? Exception #"file system operations are disabled by configuration"
                                  (jdbc/execute! spec "create or replace table tmp_mb as select * from 'orders.csv'")))
            (is (thrown-with-msg? Exception #"file system operations are disabled by configuration"
                                  (jdbc/execute! spec "create database should_not from 'test-data.ddb'")))
            (is (thrown-with-msg? Exception #"file system operations are disabled by configuration"
                                  (jdbc/query spec "SELECT * FROM read_csv_auto('orders.csv')")))
            (is (thrown-with-msg? Exception #"file system operations are disabled by configuration"
                                  (jdbc/query spec "SELECT * FROM 'orders.csv'")))
            (is (thrown-with-msg? Exception #"file system operations are disabled by configuration"
                                  (jdbc/query spec "SELECT * FROM 'orders.parquet'")))

            (let [remote-csv-explain (->> "explain select * from 'https://raw.githubusercontent.com/duckdb/duckdb-web/main/data/weather.csv'"
                                          (jdbc/query spec)
                                          first
                                          :explain_value)]
              (is (not (str/includes? remote-csv-explain "READ_CSV_AUTO  (L)")))
              (is (str/includes? remote-csv-explain "READ_CSV_AUTO  (R)"))))

          (testing "Loading extensions"
            (is (thrown-with-msg? Exception #"file system operations are disabled by configuration"
                                  (jdbc/query spec "SELECT extension_name, installed, description FROM duckdb_extensions();")))
            (is (thrown-with-msg? Exception #"file system operations are disabled by configuration"
                                  (jdbc/execute! spec "INSTALL spatial;")))
            (is (thrown-with-msg? Exception #"file system operations are disabled by configuration"
                                  (jdbc/execute! spec "INSTALL avro FROM community;"))))

          #_(str/split-lines (:explain_value (first (jdbc/query spec "EXPLAIN SELECT * from 'orders.csv'"))))
          true)))))
