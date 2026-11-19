(ns ^:mb/driver-tests metabase-enterprise.data-testing.motherduck-timestamptz-diag-test
  "Diagnostic only, not for merging. Each test runs one SQL statement on MotherDuck through the data-testing
  executor, the path `now-test` fails on, and prints `MD-DIAG <label> => <result>` so a CI log shows every result,
  passing or not."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.data-testing.executor :as data-testing.executor]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- error-chain
  "The class and message of `e` and of each of its causes."
  [^Throwable e]
  (->> (iterate ex-cause e)
       (take-while some?)
       (map #(str (.getName (class %)) ": " (ex-message %)))
       (interpose " | caused by ")
       (apply str)))

(defn- attempt!
  "Call `f` with a fresh test connection. Returns `:ok`, or the error chain when it throws. Prints the result."
  [label f]
  (let [result (try
                 (driver/do-with-test-connection :motherduck (lib.metadata/database (mt/metadata-provider)) f)
                 :ok
                 (catch Exception e
                   (error-chain e)))]
    (println "MD-DIAG" label "=>" (pr-str result))
    result))

(defn- select!
  "Run `sql` as a query."
  [label sql]
  (attempt! (str label " / SELECT")
            (fn [conn]
              (println "MD-DIAG" label "rows:"
                       (pr-str (:rows (data-testing.executor/run-query :motherduck conn [sql []] 10)))))))

(defn- create-table!
  "Create a temp table from `sql` the way a data test creates its inputs, then drop it."
  [label sql]
  (attempt! (str label " / CREATE TABLE AS")
            (fn [conn]
              (let [table (driver/temp-table-name :motherduck)]
                (try
                  (data-testing.executor/create-temp-table! :motherduck conn table {:query sql :params []})
                  (println "MD-DIAG" label "columns:"
                           (pr-str (data-testing.executor/table-columns :motherduck conn table)))
                  (finally
                    (data-testing.executor/drop-temp-table! :motherduck conn table)))))))

(defn- select-and-create!
  "Assert that `sql` runs both as a query and as the source of a temp table."
  [label sql]
  (println "MD-DIAG" label "sql:" sql)
  (testing (str label "\n" sql)
    (is (= :ok (select! label sql)) "SELECT")
    (is (= :ok (create-table! label sql)) "CREATE TABLE AS")))

(deftest h1-space-before-offset-test
  (mt/test-driver :motherduck
    (select-and-create! "H1 space before offset"
                        "SELECT 1 AS id, timestamp with time zone '2020-06-07 12:00:00.000 +00:00' AS created_at")))

(deftest h1-control-no-space-before-offset-test
  (mt/test-driver :motherduck
    (select-and-create! "H1 control, no space"
                        "SELECT 1 AS id, timestamp with time zone '2020-06-07 12:00:00.000+00:00' AS created_at")))

(deftest cast-to-timestamptz-test
  (mt/test-driver :motherduck
    (select-and-create! "CAST to TIMESTAMPTZ"
                        "SELECT 1 AS id, CAST('2020-06-07 12:00:00+00' AS TIMESTAMPTZ) AS created_at")))

(deftest control-plain-timestamp-test
  (mt/test-driver :motherduck
    (select-and-create! "control, plain timestamp"
                        "SELECT 1 AS id, timestamp '2020-06-07 12:00:00.000' AS created_at")))

(deftest now-test-input-as-written-test
  (mt/test-driver :motherduck
    (let [literal #(sql.qp/inline-value :motherduck (t/offset-date-time %))]
      (select-and-create! "now-test input, as rendered"
                          (str "SELECT 1 AS id, " (literal "2020-06-07T12:00:00Z") " AS created_at"
                               " UNION ALL SELECT 2 AS id, " (literal "2020-04-18T12:00:00Z") " AS created_at")))))

(deftest session-settings-test
  (mt/test-driver :motherduck
    (is (= :ok (select! "session settings"
                        "SELECT current_setting('TimeZone') AS tz, now() AS now, version() AS version")))))
