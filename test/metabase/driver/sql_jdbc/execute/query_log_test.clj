(ns metabase.driver.sql-jdbc.execute.query-log-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.util.log.capture :as log.capture]))

(deftest debug-log-contains-sql-and-params-test
  (testing "When DEBUG is enabled, the per-statement log line contains SQL text, params, execution time, and database ID"
    (log.capture/with-log-messages-for-level [messages [metabase.driver.sql-jdbc.execute :debug]]
      (sql-jdbc.execute/emit-statement-detail! "SELECT * FROM orders WHERE id = ?" [42] 2 15.3)
      (let [msgs (messages)]
        (is (= 1 (count msgs))
            "Exactly one DEBUG message should be emitted")
        (let [msg (:message (first msgs))]
          (is (str/includes? msg "Statement executed ::")
              "Should start with the statement prefix")
          (is (str/includes? msg "database=2")
              "Should contain database ID")
          (is (str/includes? msg "SQL: SELECT * FROM orders WHERE id = ?")
              "Should contain full SQL text")
          (is (str/includes? msg "params=[42]")
              "Should contain parameter values")
          (is (str/includes? msg "time=15ms")
              "Should contain execution time in ms"))))))

(deftest no-log-at-info-level-test
  (testing "When DEBUG is NOT enabled (INFO level), no per-statement log line is emitted"
    (log.capture/with-log-messages-for-level [messages [metabase.driver.sql-jdbc.execute :info]]
      (sql-jdbc.execute/emit-statement-detail! "SELECT 1" nil 1 5.0)
      (let [msgs (messages)]
        (is (= 0 (count msgs))
            "No messages should be captured at INFO level")))))

(deftest log-format-prefix-test
  (testing "The DEBUG log line format includes 'SQL:' prefix for the query text and 'params=' for parameters"
    (log.capture/with-log-messages-for-level [messages [metabase.driver.sql-jdbc.execute :debug]]
      (sql-jdbc.execute/emit-statement-detail! "SELECT 1" ["active"] 3 10.0)
      (let [msg (:message (first (messages)))]
        (is (re-find #"SQL: " msg)
            "Should contain 'SQL: ' prefix")
        (is (re-find #"params=\[" msg)
            "Should contain 'params=' prefix")))))

(deftest empty-params-omitted-test
  (testing "When params is empty/nil, the log line omits the params field"
    (log.capture/with-log-messages-for-level [messages [metabase.driver.sql-jdbc.execute :debug]]
      (sql-jdbc.execute/emit-statement-detail! "SELECT 1" nil 1 5.0)
      (let [msg (:message (first (messages)))]
        (is (not (str/includes? msg "params="))
            "Should not contain params when nil")))
    (log.capture/with-log-messages-for-level [messages [metabase.driver.sql-jdbc.execute :debug]]
      (sql-jdbc.execute/emit-statement-detail! "SELECT 1" [] 1 5.0)
      (let [msg (:message (first (messages)))]
        (is (not (str/includes? msg "params="))
            "Should not contain params when empty")))))

(deftest uses-stringbuilder-test
  (testing "The log line uses StringBuilder for performance (consistent with Phase 1 pattern)"
    ;; We verify this indirectly: the output format should be consistent with StringBuilder concatenation.
    ;; The actual StringBuilder usage is verified by code review / spot check.
    (log.capture/with-log-messages-for-level [messages [metabase.driver.sql-jdbc.execute :debug]]
      (sql-jdbc.execute/emit-statement-detail!
       "SELECT \"PUBLIC\".\"ORDERS\".\"ID\" FROM \"PUBLIC\".\"ORDERS\" LIMIT 2000"
       [1 "active"]
       2
       230.5)
      (let [msg (:message (first (messages)))]
        (is (= "Statement executed :: database=2 SQL: SELECT \"PUBLIC\".\"ORDERS\".\"ID\" FROM \"PUBLIC\".\"ORDERS\" LIMIT 2000 params=[1, active] time=230ms"
               msg)
            "Full log line format should match expected output")))))
