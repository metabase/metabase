(ns metabase.driver.duckdb-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]))

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
