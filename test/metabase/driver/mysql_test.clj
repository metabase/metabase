(ns ^:mb/once metabase.driver.mysql-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase.actions.error :as actions.error]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.mysql :as mysql]
   [metabase.driver.mysql.actions :as mysql.actions]
   [metabase.driver.mysql.ddl :as mysql.ddl]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.actions-test :as sql-jdbc.actions-test]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models.action :as action]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.query-processor-test.string-extracts-test
    :as string-extracts-test]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sync :as sync]
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk]
                      ;; 1. If sync fails when loading a test dataset, don't swallow the error; throw an Exception so we
                      ;;    can debug it. This is much less confusing when trying to fix broken tests.
                      ;;
                      ;; 2. Make sure we're in Honey SQL 2 mode for all the little SQL snippets we're compiling in these
                      ;;    tests.
                      (binding [sync-util/*log-exceptions-and-continue?* false]
                        (thunk))))

(defn drop-if-exists-and-create-db!
  "Drop a MySQL database named `db-name` if it already exists; then create a new empty one with that name."
  [db-name]
  (let [spec (sql-jdbc.conn/connection-details->spec :mysql (tx/dbdef->connection-details :mysql :server nil))]
    (doseq [sql [(format "DROP DATABASE IF EXISTS %s;" db-name)
                 (format "CREATE DATABASE %s;" db-name)]]
      (jdbc/execute! spec [sql]))))

(deftest all-zero-dates-test
  (mt/test-driver :mysql
    (testing (str "MySQL allows 0000-00-00 dates, but JDBC does not; make sure that MySQL is converting them to NULL "
                  "when returning them like we asked")
      (drop-if-exists-and-create-db! "all_zero_dates")
      ;; Create Table & add data
      (let [details (tx/dbdef->connection-details :mysql :db {:database-name "all_zero_dates"})
            spec    (-> (sql-jdbc.conn/connection-details->spec :mysql details)
                        ;; allow inserting dates where value is '0000-00-00' -- this is disallowed by default on newer
                        ;; versions of MySQL, but we still want to test that we can handle it correctly for older ones
                        (assoc :sessionVariables "sql_mode='ALLOW_INVALID_DATES'"))]
        (doseq [sql ["CREATE TABLE `exciting-moments-in-history` (`id` integer, `moment` timestamp);"
                     "INSERT INTO `exciting-moments-in-history` (`id`, `moment`) VALUES (1, '0000-00-00');"]]
          (jdbc/execute! spec [sql]))
        ;; create & sync MB DB
        (t2.with-temp/with-temp [Database database {:engine "mysql", :details details}]
          (sync/sync-database! database)
          (mt/with-db database
            ;; run the query
            (is (= [[1 nil]]
                   (mt/rows
                    (mt/run-mbql-query exciting-moments-in-history))))))))))

(deftest date-test
  ;; make sure stuff at least compiles. Even if the result probably isn't as concise as it could be.
  ;; See [[metabase.query-processor-test.date-time-zone-functions-test/extract-week-tests]] for something that tests
  ;; that this actually returns correct results.
  (testing :week-of-year-instance
    (doseq [[start-of-week expected] {:sunday
                                      [["CAST("
                                        "  1 + CEIL("
                                        "    ("
                                        "      DAYOFYEAR(weeks.d) - (8 - DAYOFWEEK(MAKEDATE(YEAR(weeks.d), 1)))"
                                        "    ) / 7.0"
                                        "  ) AS signed"
                                        ")"]]

                                      :tuesday
                                      [["CAST("
                                        "  1 + CEIL("
                                        "    ("
                                        "      ("
                                        "        DAYOFYEAR(weeks.d) - ("
                                        "          8 - COALESCE("
                                        "            NULLIF((DAYOFWEEK(MAKEDATE(YEAR(weeks.d), 1)) + 5) % 7, 0),"
                                        "            7"
                                        "          )"
                                        "        )"
                                        "      ) / 7.0"
                                        "    )"
                                        "  ) AS signed"
                                        ")"]]}]
      (mt/with-temporary-setting-values [start-of-week start-of-week]
        (let [honey-sql (sql.qp/date :mysql
                                     :week-of-year-instance
                                     (h2x/with-database-type-info (h2x/identifier :field "weeks" "d") "date"))]
          (testing (format "\nHoney SQL =\n%s" (u/pprint-to-str honey-sql))
            (is (= expected
                   (some-> (sql/format-expr honey-sql)
                           vec
                           (update 0 #(str/split-lines (driver/prettify-native-form :mysql %))))))))))))

;; Test how TINYINT(1) columns are interpreted. By default, they should be interpreted as integers, but with the
;; correct additional options, we should be able to change that -- see
;; https://github.com/metabase/metabase/issues/3506
(tx/defdataset tiny-int-ones
  [["number-of-cans"
    [{:field-name "thing",          :base-type :type/Text}
     {:field-name "number-of-cans", :base-type {:native "tinyint(1)"}, :effective-type :type/Integer}]
    [["Six Pack"              6]
     ["Toucan"                2]
     ["Empty Vending Machine" 0]]]])

(defn db->fields
  "Given a DB return its fields as a set."
  [db]
  (let [table-ids (t2/select-pks-set Table :db_id (u/the-id db))]
    (set (map (partial into {}) (t2/select [Field :name :base_type :semantic_type] :table_id [:in table-ids])))))

(deftest tiny-int-1-test
  (mt/test-driver :mysql
    (mt/dataset tiny-int-ones
      ;; trigger a full sync on this database so fields are categorized correctly
      (sync/sync-database! (mt/db))
      (testing "By default TINYINT(1) should be a boolean"
        (is (= #{{:name "number-of-cans", :base_type :type/Boolean, :semantic_type :type/Category}
                 {:name "id", :base_type :type/Integer, :semantic_type :type/PK}
                 {:name "thing", :base_type :type/Text, :semantic_type :type/Category}}
               (db->fields (mt/db)))))

      (testing "if someone says specifies `tinyInt1isBit=false`, it should come back as a number instead"
        (t2.with-temp/with-temp [Database db {:engine  "mysql"
                                              :details (assoc (:details (mt/db))
                                                              :additional-options "tinyInt1isBit=false")}]
          (sync/sync-database! db)
          (is (= #{{:name "number-of-cans", :base_type :type/Integer, :semantic_type :type/Quantity}
                   {:name "id", :base_type :type/Integer, :semantic_type :type/PK}
                   {:name "thing", :base_type :type/Text, :semantic_type :type/Category}}
                 (db->fields db))))))))

(tx/defdataset year-db
  [["years"
    [{:field-name "year_column", :base-type {:native "YEAR"}, :effective-type :type/Date}]
    [[2001] [2002] [1999]]]])

(deftest year-test
  (mt/test-driver :mysql
    (mt/dataset year-db
      (testing "By default YEAR"
        (is (= #{{:name "year_column", :base_type :type/Integer, :semantic_type nil}
                 {:name "id", :base_type :type/Integer, :semantic_type :type/PK}}
               (db->fields (mt/db)))))
      (let [table  (t2/select-one Table :db_id (u/id (mt/db)))
            fields (t2/select Field :table_id (u/id table) :name "year_column")]
        (testing "Can select from this table"
          (is (= [[2001] [2002] [1999]]
                 (metadata-queries/table-rows-sample table fields (constantly conj)))))
        (testing "We can fingerprint this table"
          (is (= 1
                 (:updated-fingerprints (#'sync.fingerprint/fingerprint-table! table fields)))))))))

(deftest db-default-timezone-test
  (mt/test-driver :mysql
    (let [timezone (fn [result-row]
                     (let [db (mt/db)]
                       (with-redefs [jdbc/query (let [orig jdbc/query]
                                                  (fn [spec sql-args & options]
                                                    (if (and (string? sql-args)
                                                             (str/includes? sql-args "GLOBAL.time_zone"))
                                                      [result-row]
                                                      (apply orig spec sql-args options))))]
                         (driver/db-default-timezone driver/*driver* db))))]
      (testing "Should use global timezone by default"
        (is (= "US/Pacific"
               (timezone {:global_tz "US/Pacific", :system_tz "UTC"}))))
      (testing "If global timezone is 'SYSTEM', should use system timezone"
        (is (= "UTC"
               (timezone {:global_tz "SYSTEM", :system_tz "UTC"}))))
      (testing "Should fall back to returning `offset` if global/system aren't present"
        (is (= "+00:00"
               (timezone {:offset "00:00"}))))
      (testing "If global timezone is invalid, should fall back to offset"
        (is (= "-08:00"
               (timezone {:global_tz "PDT", :system_tz "PDT", :offset "-08:00"}))))
      (testing "Should add a `+` if needed to offset"
        (is (= "+00:00"
               (timezone {:global_tz "PDT", :system_tz "UTC", :offset "00:00"})))))

    (testing "real timezone query doesn't fail"
      (is (nil? (try
                  (driver/db-default-timezone driver/*driver* (mt/db))
                  nil
                  (catch Throwable e
                    e)))))))

(deftest timezone-date-formatting-test
  (mt/test-driver :mysql
    ;; Most of our tests either deal in UTC (offset 00:00) or America/Los_Angeles timezones (-07:00/-08:00). When dealing
    ;; with dates, we will often truncate the timestamp to a date. When we only test with negative timezone offsets, in
    ;; combination with this truncation, means we could have a bug and it's hidden by this negative-only offset. As an
    ;; example, if we have a datetime like 2018-08-17 00:00:00-08:00, converting to UTC this becomes 2018-08-17
    ;; 08:00:00+00:00, which when truncated is still 2018-08-17. That same scenario in Hong Kong is 2018-08-17
    ;; 00:00:00+08:00, which then becomes 2018-08-16 16:00:00+00:00 when converted to UTC, which will truncate to
    ;; 2018-08-16, instead of 2018-08-17
    (mt/with-system-timezone-id! "Asia/Hong_Kong"
      (letfn [(run-query-with-report-timezone [report-timezone]
                (mt/with-temporary-setting-values [report-timezone report-timezone]
                  (mt/first-row
                    (qp/process-query
                     {:database   (mt/id)
                      :type       :native
                      :settings   {:report-timezone "UTC"}
                      :native     {:query         "SELECT cast({{date}} as date)"
                                   :template-tags {:date {:name "date" :display_name "Date" :type "date"}}}
                      :parameters [{:type "date/single" :target ["variable" ["template-tag" "date"]] :value "2018-04-18"}]}))))]
        (testing "date formatting when system-timezone == report-timezone"
          (is (= ["2018-04-18T00:00:00+08:00"]
                 (run-query-with-report-timezone "Asia/Hong_Kong"))))

        ;; [August, 2018]
        ;; This tests a similar scenario, but one in which the JVM timezone is in Hong Kong, but the report timezone
        ;; is in Los Angeles. The Joda Time date parsing functions for the most part default to UTC. Our tests all run
        ;; with a UTC JVM timezone. This test catches a bug where we are incorrectly assuming a date is in UTC when
        ;; the JVM timezone is different.
        ;;
        ;; The original bug can be found here: https://github.com/metabase/metabase/issues/8262. The MySQL driver code
        ;; was parsing the date using Joda Time's date parser, which is in UTC. The MySQL driver code was assuming
        ;; that date was in the system timezone rather than UTC which caused an incorrect conversion and with the
        ;; trucation, let to it being off by a day.
        ;;
        ;; [April, 2024]
        ;; We no longer use Joda Time at all (this logic has been pulled out to qp.timezone, and uses java-time), but
        ;; are keeping the test in place since it's still a legitimate case.
        (testing "date formatting when system-timezone != report-timezone"
          (is (= ["2018-04-18T00:00:00-07:00"]
                 (run-query-with-report-timezone "America/Los_Angeles"))))))))

(def ^:private sample-connection-details
  {:db "my_db", :host "localhost", :port "3306", :user "cam", :password "bad-password"})

(deftest ^:parallel connection-spec-test
  (testing "Do `:ssl` connection details give us the connection spec we'd expect?"
    (is (=? {:useSSL true, :serverSslCert "sslCert"}
            (sql-jdbc.conn/connection-details->spec :mysql (assoc sample-connection-details :ssl      true
                                                                  :ssl-cert "sslCert"))))))

(deftest ^:parallel connection-spec-test-2
  (testing "what about non-SSL connections?"
    (is (=? {:useSSL false}
            (sql-jdbc.conn/connection-details->spec :mysql sample-connection-details)))))

(deftest ^:parallel connection-spec-test-3
  (testing "Connections that are `:ssl false` but with `useSSL` in the additional options should be treated as SSL (see #9629)"
    (is (=? {:useSSL true, :subname "//localhost:3306/my_db?useSSL=true&trustServerCertificate=true"}
            (sql-jdbc.conn/connection-details->spec :mysql
                                                    (assoc sample-connection-details
                                                           :ssl false
                                                           :additional-options "useSSL=true&trustServerCertificate=true"))))))

(deftest ^:parallel connection-spec-test-4
  (testing "A program_name specified in additional-options is not overwritten by us"
    (let [conn-attrs "connectionAttributes=program_name:my_custom_value"]
      (is (=? {:subname (str "//localhost:3306/my_db?" conn-attrs)
               :useSSL false
               ;; because program_name was in additional-options, we shouldn't use emit :connectionAttributes
               :connectionAttributes (symbol "nil #_\"key is not present.\"")}
              (sql-jdbc.conn/connection-details->spec
               :mysql
               (assoc sample-connection-details :additional-options conn-attrs)))))))

(deftest read-timediffs-test
  (mt/test-driver :mysql
    (testing "Make sure negative result of *diff() functions don't cause Exceptions (#10983)"
      (binding [sync-util/*log-exceptions-and-continue?* true]
        (doseq [{:keys [interval expected message]}
                [{:interval "-1 HOUR"
                  :expected "-01:00:00"
                  :message  "Negative durations should come back as Strings"}
                 {:interval "25 HOUR"
                  :expected "25:00:00"
                  :message  "Durations outside the valid range of `LocalTime` should come back as Strings"}
                 {:interval "1 HOUR"
                  :expected #t "01:00:00"
                  :message  "A `timediff()` result within the valid range should still come back as a `LocalTime`"}]]
          (testing (str "\n" interval "\n" message)
            (is (= [expected]
                   (mt/first-row
                    (qp/process-query
                     (assoc (mt/native-query
                              {:query (format "SELECT timediff(current_timestamp + INTERVAL %s, current_timestamp)" interval)})
                            ;; disable the middleware that normally converts `LocalTime` to `Strings` so we can verify
                            ;; our driver is actually doing the right thing
                            :middleware {:format-rows? false})))))))))))

(defn- table-fingerprint
  [{:keys [fields name]}]
  {:name   name
   :fields (map #(select-keys % [:name :base_type]) fields)})

(deftest system-versioned-tables-test
  (mt/test-driver :mysql
    (testing "system versioned tables appear during a sync"
      (drop-if-exists-and-create-db! "versioned_tables")
      ;; Create Table & add data
      (let [details (tx/dbdef->connection-details :mysql :db {:database-name "versioned_tables"})
            spec    (sql-jdbc.conn/connection-details->spec :mysql details)
            compat  (try
                     (doseq [sql ["CREATE TABLE IF NOT EXISTS src1 (id INTEGER, t TEXT);"
                                  "CREATE TABLE IF NOT EXISTS src2 (id INTEGER, t TEXT);"
                                  "ALTER TABLE src2 ADD SYSTEM VERSIONING;"
                                  "INSERT INTO src1 VALUES (1, '2020-03-01 12:20:35');"
                                  "INSERT INTO src2 VALUES (1, '2020-03-01 12:20:35');"]]
                       (jdbc/execute! spec [sql]))
                     true
                     (catch java.sql.SQLSyntaxErrorException se
                       ;; if an error is received with SYSTEM VERSIONING mentioned, the version
                       ;; of mysql or mariadb being tested against does not support system versioning,
                       ;; so do not continue
                       (if (re-matches #".*VERSIONING'.*" (.getMessage se))
                         false
                         (throw se))))]
        (when compat
          (t2.with-temp/with-temp [Database database {:engine "mysql", :details details}]
            (sync/sync-database! database)
            (is (= [{:name   "src1"
                     :fields [{:name      "id"
                               :base_type :type/Integer}
                              {:name      "t"
                               :base_type :type/Text}]}
                    {:name   "src2"
                     :fields [{:name      "id"
                               :base_type :type/Integer}
                              {:name      "t"
                               :base_type :type/Text}]}]
                   (->> (t2/hydrate (t2/select Table :db_id (:id database) {:order-by [:name]}) :fields)
                        (map table-fingerprint))))))))))

(defn- create-enums-table! [db]
  (let [spec (sql-jdbc.conn/connection-details->spec :mysql (:details db))]
    (doseq [sql ["CREATE TABLE birds (name VARCHAR(50) PRIMARY KEY, bird_type ENUM('toucan', 'pigeon', 'turkey'));"
                 "INSERT INTO birds (name, bird_type) VALUES ('Rasta', 'toucan');"]]
      (jdbc/execute! spec sql))))

(deftest enums-test
  (mt/test-driver :mysql
    (mt/with-empty-db
      (create-enums-table! (mt/db))
      (sync/sync-database! (mt/db))
      (testing "ENUM columns are synced with the correct base and semantic types"
        (is (=? {:base_type     :type/MySQLEnum
                 :semantic_type :type/Category}
                (t2/select-one :model/Field :name "bird_type"))))
      (testing "string functions work on ENUM fields"
        (let [query (mt/mbql-query birds
                      {:expressions {"typ" [:replace $bird_type "ou" "hree"]}})]
          (mt/with-native-query-testing-context query
            (is (= [["Rasta" "toucan" "threecan"]]
                   (mt/rows (qp/process-query query))))))))))

(deftest enums-actions-test
  (mt/test-driver :mysql
    (testing "actions with enums"
      (mt/with-empty-db
        (create-enums-table! (mt/db))
        (sync/sync-database! (mt/db))
        (mt/with-actions-enabled
          (mt/with-actions [model {:type          :model
                                   :dataset_query (mt/mbql-query birds)}
                            {action-id :action-id} {:type :implicit
                                                    :kind "row/create"}]
            (testing "Enum fields are a valid implicit parameter target"
              (let [columns        (->> model :result_metadata (map :name) set)
                    action-targets (->> (action/select-action :id action-id)
                                        :parameters
                                        (map :id)
                                        set)]
                (is (= columns action-targets))))
            (testing "Can create new records with an enum value"
              (is (= {:created-row {:name "Lucky", :bird_type "pigeon"}}
                     (mt/user-http-request :crowberto
                                           :post 200
                                           (format "action/%s/execute" action-id)
                                           {:parameters {"name" "Lucky", "bird_type" "pigeon"}}))))))))))

(deftest group-on-time-column-test
  (mt/test-driver :mysql
    (testing "can group on TIME columns (#12846)"
      (mt/with-temporary-setting-values [report-timezone "UTC"]
        (mt/dataset attempted-murders
          (testing "by minute"
            (let [query (mt/mbql-query attempts
                          {:breakout [!minute.time]
                           :order-by [[:asc !minute.time]]
                           :limit    3})]
              (mt/with-native-query-testing-context query
                (is (= [["00:14:00Z"]
                        ["00:23:00Z"]
                        ["00:35:00Z"]]
                       (mt/rows (qp/process-query query)))))))
          (testing "by hour"
            (let [query (mt/mbql-query attempts
                          {:breakout [!hour.time]
                           :order-by [[:desc !hour.time]]
                           :limit    3})]
              (mt/with-native-query-testing-context query
                (is (= [["23:00:00Z"]
                        ["20:00:00Z"]
                        ["19:00:00Z"]]
                       (mt/rows (qp/process-query query))))))))))))

(defn- pretty-sql [s]
  (str/replace s #"`" ""))

(deftest ^:parallel do-not-cast-to-date-if-column-is-already-a-date-test
  (testing "Don't wrap Field in date() if it's already a DATE (#11502)"
    (mt/test-driver :mysql
      (mt/dataset attempted-murders
        (let [query (mt/mbql-query attempts
                      {:aggregation [[:count]]
                       :breakout    [!day.date]})]
          (is (= (str "SELECT attempts.date AS date, COUNT(*) AS count "
                      "FROM attempts "
                      "GROUP BY attempts.date "
                      "ORDER BY attempts.date ASC")
                 (some-> (qp.compile/compile query) :query pretty-sql))))))

    (testing "trunc-with-format should not cast a field if it is already a DATETIME"
      (is (= ["SELECT STR_TO_DATE(DATE_FORMAT(CAST(`field` AS datetime), '%Y'), '%Y')"]
             (sql.qp/format-honeysql :mysql {:select [[(#'mysql/trunc-with-format "%Y" :field)]]})))
      (is (= ["SELECT STR_TO_DATE(DATE_FORMAT(`field`, '%Y'), '%Y')"]
             (sql.qp/format-honeysql :mysql {:select [[(#'mysql/trunc-with-format
                                                        "%Y"
                                                        (h2x/with-database-type-info :field "datetime"))]]}))))))

(deftest mysql-connect-with-ssl-and-pem-cert-test
  (mt/test-driver :mysql
    (if (System/getenv "MB_MYSQL_SSL_TEST_SSL_CERT")
      (testing "MySQL with SSL connectivity using PEM certificate"
        (mt/with-env-keys-renamed-by #(str/replace-first % "mb-mysql-ssl-test" "mb-mysql-test")
          (string-extracts-test/test-breakout)))
      (log/info (u/format-color 'yellow
                                "Skipping %s because %s env var is not set"
                                "mysql-connect-with-ssl-and-pem-cert-test"
                                "MB_MYSQL_SSL_TEST_SSL_CERT")))))

(deftest ^:parallel json-query-test
  (let [boop-identifier (h2x/identifier :field "boop" "bleh -> meh")]
    (testing "Transforming MBQL query with JSON in it to mysql query works"
      (let [boop-field {:nfc-path [:bleh :meh] :database-type "bigint"}]
        (is (= ["CONVERT(JSON_EXTRACT(`boop`.`bleh`, ?), UNSIGNED)" "$.\"meh\""]
               (sql.qp/format-honeysql :mysql (sql.qp/json-query :mysql boop-identifier boop-field))))))
    (testing "What if types are weird and we have lists"
      (let [weird-field {:nfc-path [:bleh "meh" :foobar 1234] :database-type "bigint"}]
        (is (= ["CONVERT(JSON_EXTRACT(`boop`.`bleh`, ?), UNSIGNED)" "$.\"meh\".\"foobar\".\"1234\""]
               (sql.qp/format-honeysql :mysql (sql.qp/json-query :mysql boop-identifier weird-field))))))
    (testing "Doesn't complain when field is boolean"
      (let [boolean-boop-field {:database-type "boolean" :nfc-path [:bleh "boop" :foobar 1234]}]
        (is (= ["JSON_EXTRACT(`boop`.`bleh`, ?)" "$.\"boop\".\"foobar\".\"1234\""]
               (sql.qp/format-honeysql :mysql (sql.qp/json-query :mysql boop-identifier boolean-boop-field))))))))

;; MariaDB doesn't have support for explicit JSON columns, it does it in a more SQL Server-ish way
;; where LONGTEXT columns are the actual JSON columns and there's JSON functions that just work on them,
;; construed as text.
;; You could even have mixed JSON / non JSON columns...
;; Therefore, we can't just automatically get JSON columns in MariaDB. Therefore, no JSON support.
;; Therefore, no JSON tests.
(deftest sync-json-with-composite-pks-test
  (testing "Make sure sync a table with json columns that have composite pks works"
    (mt/test-driver :mysql
      (when-not (mysql/mariadb? (mt/db))
        (drop-if-exists-and-create-db! "composite_pks_test")
        (with-redefs [metadata-queries/nested-field-sample-limit 4]
          (let [details (mt/dbdef->connection-details driver/*driver* :db {:database-name "composite_pks_test"})
                spec    (sql-jdbc.conn/connection-details->spec driver/*driver* details)]
            (doseq [statement (concat ["CREATE TABLE `json_table` (`first_id` INT, `second_id` INT, `json_val` JSON, PRIMARY KEY(`first_id`, `second_id`));"]
                                      (for [[first-id second-id json] [[1 1 "{\"int_turn_string\":1}"]
                                                                       [2 2 "{\"int_turn_string\":2}"]
                                                                       [3 3 "{\"int_turn_string\":3}"]
                                                                       [4 4 "{\"int_turn_string\":4}"]
                                                                       [4 5 "{\"int_turn_string\":\"x\"}"]
                                                                       [4 6 "{\"int_turn_string\":5}"]]]
                                        (format "INSERT INTO `json_table` (first_id, second_id, json_val) VALUES (%d, %d, '%s');" first-id second-id json)))]
              (jdbc/execute! spec [statement]))
            (t2.with-temp/with-temp
              [:model/Database database {:name "composite_pks_test" :engine driver/*driver* :details details}]
              (mt/with-db database
                (sync-tables/sync-tables-and-database! database)
                (is (= #{{:name              "json_val → int_turn_string",
                          :database-type     "text"
                          :base-type         :type/Text
                          :database-position 0
                          :json-unfolding    false
                          :visibility-type   :normal
                          :nfc-path          [:json_val "int_turn_string"]}}
                       (sql-jdbc.sync/describe-nested-field-columns
                        driver/*driver*
                        database
                        (t2/select-one Table :db_id (mt/id) :name "json_table"))))))))))))

(deftest json-alias-test
  (mt/test-driver :mysql
    (when (not (mysql/mariadb? (mt/db)))
      (testing "json breakouts and order bys have alias coercion"
        (mt/dataset json
          (let [table  (t2/select-one Table :db_id (u/id (mt/db)) :name "json")]
            (sync/sync-table! table)
            (let [field (t2/select-one Field :table_id (u/id table) :name "json_bit → 1234")
                  compile-res (qp.compile/compile
                               {:database (u/the-id (mt/db))
                                :type     :query
                                :query    {:source-table (u/the-id table)
                                           :aggregation  [[:count]]
                                           :breakout     [[:field (u/the-id field) nil]]}})]
              (is (= ["SELECT"
                      "  CONVERT(JSON_EXTRACT(`json`.`json_bit`, ?), UNSIGNED) AS `json_bit → 1234`,"
                      "  COUNT(*) AS `count`"
                      "FROM"
                      "  `json`"
                      "GROUP BY"
                      "  CONVERT(JSON_EXTRACT(`json`.`json_bit`, ?), UNSIGNED)"
                      "ORDER BY"
                      "  CONVERT(JSON_EXTRACT(`json`.`json_bit`, ?), UNSIGNED) ASC"]
                     (str/split-lines (driver/prettify-native-form :mysql (:query compile-res)))))
              (is (= '("$.\"1234\"" "$.\"1234\"" "$.\"1234\"") (:params compile-res))))))))))

(deftest complicated-json-identifier-test
  (mt/test-driver :mysql
    (when (not (mysql/mariadb? (mt/db)))
      (testing "Deal with complicated identifier (#22967, but for mysql)"
        (mt/dataset json
          (let [database (mt/db)
                table    (t2/select-one Table :db_id (u/id database) :name "json")]
            (sync/sync-table! table)
            (let [field    (t2/select-one Field :table_id (u/id table) :name "json_bit → 1234")]
              (mt/with-metadata-provider (mt/id)
                (let [field-clause [:field (u/the-id field) {:binning
                                                             {:strategy :num-bins,
                                                              :num-bins 100,
                                                              :min-value 0.75,
                                                              :max-value 54.0,
                                                              :bin-width 0.75}}]]
                  (is (= ["((FLOOR(((CONVERT(JSON_EXTRACT(`json`.`json_bit`, ?), UNSIGNED) - 0.75) / 0.75)) * 0.75) + 0.75)"
                          "$.\"1234\""]
                         (sql.qp/format-honeysql :mysql (sql.qp/->honeysql :mysql field-clause)))))))))))))

(deftest ddl-execute-with-timeout-test
  (mt/test-driver :mysql
    (mt/dataset json
      (let [db-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
        (testing "When the query takes longer that the timeout, it is killed."
          (is (thrown-with-msg?
                Exception
                #"Killed MySQL process id [\d,]+ due to timeout."
                (#'mysql.ddl/execute-with-timeout! :mysql db-spec db-spec 10 ["select sleep(5)"]))))
        (testing "When the query takes less time than the timeout, it is successful."
          (is (some? (#'mysql.ddl/execute-with-timeout! :mysql db-spec db-spec 5000 ["select sleep(0.1) as val"]))))))))

(deftest syncable-schemas-test
  (mt/test-driver :mysql
    (testing "`syncable-schemas` should return an empty set because mysql doesn't support schemas"
      (mt/with-empty-db
        (is (= #{}
               (driver/syncable-schemas driver/*driver* (mt/db))))))))

;;; ------------------------------------------------ Actions related ------------------------------------------------

;; API tests are in [[metabase.api.action-test]]
(deftest actions-maybe-parse-sql-error-test
  (testing "violate not null constraint"
    (is (= {:type :metabase.actions.error/violate-not-null-constraint
            :message "F1 must have values."
            :errors {"f1" "You must provide a value."}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :mysql actions.error/violate-not-null-constraint nil nil
            "Column 'f1' cannot be null"))))

  (testing "violate unique constraint"
    (with-redefs [mysql.actions/constraint->column-names (constantly ["PRIMARY"])]
      (is (= {:type :metabase.actions.error/violate-unique-constraint,
              :message "Primary already exists.",
              :errors {"PRIMARY" "This Primary value already exists."}}
             (sql-jdbc.actions/maybe-parse-sql-error
              :mysql actions.error/violate-unique-constraint nil nil
              "(conn=10) Duplicate entry 'ID' for key 'string_pk.PRIMARY'")))))

  (testing "incorrect type"
    (is (= {:type :metabase.actions.error/incorrect-value-type,
            :message "Some of your values aren’t of the correct type for the database."
            :errors {"id" "This value should be of type Integer."}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :mysql actions.error/incorrect-value-type nil nil
            "(conn=183) Incorrect integer value: 'STRING' for column `table`.`id` at row 1"))))

  (testing "violate fk constraints"
    (is (= {:type :metabase.actions.error/violate-foreign-key-constraint
            :message "Unable to create a new record."
            :errors {"group-id" "This Group-id does not exist."}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :mysql actions.error/violate-foreign-key-constraint nil :row/create
            "(conn=45) Cannot add or update a child row: a foreign key constraint fails (`action-error-handling`.`user`, CONSTRAINT `user_group-id_group_-159406530` FOREIGN KEY (`group-id`) REFERENCES `group` (`id`))")))

    (is (= {:type :metabase.actions.error/violate-foreign-key-constraint,
            :message "Unable to update the record.",
            :errors {"group" "This Group does not exist."}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :mysql actions.error/violate-foreign-key-constraint nil :row/update
            "(conn=21) Cannot delete or update a parent row: a foreign key constraint fails (`action-error-handling`.`user`, CONSTRAINT `user_group-id_group_-159406530` FOREIGN KEY (`group-id`) REFERENCES `group` (`id`))")))

    (is (= {:type :metabase.actions.error/violate-foreign-key-constraint
            :message "Other tables rely on this row so it cannot be deleted."
            :errors {}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :mysql actions.error/violate-foreign-key-constraint nil :row/delete
            "(conn=21) Cannot delete or update a parent row: a foreign key constraint fails (`action-error-handling`.`user`, CONSTRAINT `user_group-id_group_-159406530` FOREIGN KEY (`group-id`) REFERENCES `group` (`id`))")))))

;; this contains specical test cases for mysql
;; for generic tests, check [[metabase.driver.sql-jdbc.actions-test/action-error-handling-test]]
(deftest action-error-handling-test
  (mt/test-driver :mysql
    (testing "violate not-null constraints with multiple columns"
      (drop-if-exists-and-create-db! "not_null_constraint_on_multiple_cols")
      (let [details (mt/dbdef->connection-details driver/*driver* :db {:database-name "not_null_constraint_on_multiple_cols"})]
        (doseq [stmt ["CREATE TABLE IF NOT EXISTS mytable (
                      id INT PRIMARY KEY,
                      column1 VARCHAR(50),
                      column2 VARCHAR(50),
                      UNIQUE KEY unique_constraint (column1, column2)
                      );"
                      "INSERT INTO mytable (id, column1, column2)
                      VALUES  (1, 'A', 'A'), (2, 'B', 'B');"]]
          (jdbc/execute! (sql-jdbc.conn/connection-details->spec driver/*driver* details) [stmt]))
        (t2.with-temp/with-temp [:model/Database database {:engine driver/*driver* :details details}]
          (mt/with-db database
            (sync/sync-database! database)
            (mt/with-actions-enabled
              (testing "when creating"
                (is (= {:type        :metabase.actions.error/violate-unique-constraint
                        :message     "Column1 and Column2 already exist."
                        :errors      {"column1" "This Column1 value already exists." "column2" "This Column2 value already exists."}
                        :status-code 400}
                       (sql-jdbc.actions-test/perform-action-ex-data
                        :row/create (mt/$ids {:create-row {"id"      3
                                                           "column1" "A"
                                                           "column2" "A"}
                                              :database   (:id database)
                                              :query      {:source-table $$mytable}
                                              :type       :query})))))
              (testing "when updating"
                (is (= {:errors      {"column1" "This Column1 value already exists."
                                      "column2" "This Column2 value already exists."}
                        :message     "Column1 and Column2 already exist."
                        :status-code 400
                        :type        actions.error/violate-unique-constraint}
                       (sql-jdbc.actions-test/perform-action-ex-data
                        :row/update (mt/$ids {:update-row {"column1" "A"
                                                           "column2" "A"}
                                              :database   (:id database)
                                              :query      {:source-table $$mytable
                                                           :filter       [:= $mytable.id 2]}
                                              :type       :query}))))))))))))

(deftest ^:parallel parse-grant-test
  (testing "`parse-grant` should work correctly"
    (is (= {:type            :privileges
            :privilege-types #{:select :insert :update :delete}
            :level           :database
            :object          "`test-data`.*"}
           (#'mysql/parse-grant "GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, SELECT (id) ON `test-data`.* TO 'metabase'@'localhost' WITH GRANT OPTION")))
    (is (= {:type            :privileges
            :privilege-types #{:select :insert :update :delete}
            :level           :database
            :object          "`test-data`.*"}
           (#'mysql/parse-grant "GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, SELECT (id) ON `test-data`.* TO 'metabase'@'localhost' WITH GRANT OPTION")))
    (is (= {:type            :privileges
            :privilege-types #{:select}
            :level           :database
            :object          "`test-data`.*"}
           (#'mysql/parse-grant "GRANT SELECT, DELETE (id) ON `test-data`.* TO 'metabase'@'localhost' WITH GRANT OPTION")))
    (is (= {:type            :privileges
            :privilege-types #{:select :insert :update :delete}
            :level           :table
            :object          "`test-data`.`foo`"}
           (#'mysql/parse-grant "GRANT ALL PRIVILEGES ON `test-data`.`foo` TO 'metabase'@'localhost'")))
    (is (= {:type  :roles
            :roles #{"`example_role`@`%`" "`example_role_2`@`%`"}}
           (#'mysql/parse-grant "GRANT `example_role`@`%`,`example_role_2`@`%` TO 'metabase'@'localhost'")))
    (is (nil? (#'mysql/parse-grant "GRANT PROXY ON 'metabase'@'localhost' TO 'metabase'@'localhost' WITH GRANT OPTION")))))

(deftest ^:parallel table-name->privileges-test
  (testing "table-names->privileges should work correctly"
    (is (= {"foo" #{:select}, "bar" #{:select}}
           (#'mysql/table-names->privileges [{:type            :privileges
                                              :privilege-types #{:select}
                                              :level           :database
                                              :object          "`test-data`.*"}]
                                            "test-data"
                                            ["foo" "bar"])))
    (is (= {"foo" #{:select}, "bar" #{:select}}
           (#'mysql/table-names->privileges [{:type            :privileges
                                              :privilege-types #{:select}
                                              :level           :global
                                              :object          "*.*"}]
                                            "test-data"
                                            ["foo" "bar"])))
    (is (= {"foo" #{:select :insert :update :delete}}
           (#'mysql/table-names->privileges [{:type            :privileges
                                              :privilege-types #{:select :insert :update :delete}
                                              :level           :table
                                              :object          "`test-data`.`foo`"}]
                                            "test-data"
                                            ["foo" "bar"])))))

(deftest table-privileges-test
  (mt/test-driver :mysql
    (when-not (mysql/mariadb? (mt/db))
      (testing "`table-privileges` should return the correct data for current_user and role privileges"
        (drop-if-exists-and-create-db! "table_privileges_test")
        (let [details          (tx/dbdef->connection-details :mysql :db {:database-name "table_privileges_test"})
              spec             (sql-jdbc.conn/connection-details->spec :mysql details)
              get-privileges   (fn []
                                 (let [new-connection-details (cond-> (assoc details
                                                                             :user "table_privileges_test_user",
                                                                             :password "password"
                                                                             :ssl true
                                                                             :additional-options "trustServerCertificate=true"))]
                                   (sql-jdbc.conn/with-connection-spec-for-testing-connection
                                     [spec [:mysql new-connection-details]]
                                     (with-redefs [sql-jdbc.conn/db->pooled-connection-spec (fn [_] spec)]
                                       (sql-jdbc.sync/current-user-table-privileges driver/*driver* spec {})))))]
          (try
            (doseq [stmt ["CREATE TABLE `bar` (id INTEGER);"
                          "CREATE TABLE `baz` (id INTEGER);"
                          "CREATE USER 'table_privileges_test_user' IDENTIFIED BY 'password';"
                          (str "GRANT SELECT ON table_privileges_test.`bar` TO 'table_privileges_test_user'")]]
              (jdbc/execute! spec stmt))
            (testing "should return privileges on the table"
              (is (= [{:role   nil
                       :schema nil
                       :table  "bar"
                       :select true
                       :update false
                       :insert false
                       :delete false}]
                     (get-privileges))))
            (testing "should return privileges on the database"
              (jdbc/execute! spec (str "GRANT UPDATE ON `table_privileges_test`.* TO 'table_privileges_test_user'"))
              (is (= [{:role nil, :schema nil, :table "bar", :select true, :update true, :insert false, :delete false}
                      {:role nil, :schema nil, :table "baz", :select false, :update true, :insert false, :delete false}]
                     (get-privileges))))
            (testing "should return privileges on roles that the user has been granted"
              (doseq [stmt ["CREATE ROLE 'table_privileges_test_role'"
                            (str "GRANT INSERT ON `bar` TO 'table_privileges_test_role'")
                            "GRANT 'table_privileges_test_role' TO 'table_privileges_test_user'"]]
                (jdbc/execute! spec stmt))
              (is (= [{:role nil, :schema nil, :table "bar", :select true, :update true, :insert true, :delete false}
                      {:role nil, :schema nil, :table "baz", :select false, :update true, :insert false, :delete false}]
                     (get-privileges))))
            (finally
              (jdbc/execute! spec "DROP USER IF EXISTS 'table_privileges_test_user';")
              (doseq [stmt ["DROP ROLE IF EXISTS 'table_privileges_test_role';"
                            "DROP ROLE IF EXISTS 'table_privileges_test_role_2';"
                            "DROP ROLE IF EXISTS 'table_privileges_test_role_3';"]]
                (jdbc/execute! spec stmt)))))))))
