(ns metabase.driver.mysql-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver :as driver]
            [metabase.driver.mysql :as mysql]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor :as qp]
            ;; used for one SSL with PEM connectivity test
            [metabase.query-processor-test.string-extracts-test :as string-extracts-test]
            [metabase.sync :as sync]
            [metabase.sync.analyze.fingerprint :as fingerprint]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.util.test :as tt]))

(deftest all-zero-dates-test
  (mt/test-driver :mysql
    (testing (str "MySQL allows 0000-00-00 dates, but JDBC does not; make sure that MySQL is converting them to NULL "
                  "when returning them like we asked")
      (let [spec (sql-jdbc.conn/connection-details->spec :mysql (tx/dbdef->connection-details :mysql :server nil))]
        (try
          ;; Create the DB
          (doseq [sql ["DROP DATABASE IF EXISTS all_zero_dates;"
                       "CREATE DATABASE all_zero_dates;"]]
            (jdbc/execute! spec [sql]))
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
            (tt/with-temp Database [database {:engine "mysql", :details details}]
              (sync/sync-database! database)
              (mt/with-db database
                ;; run the query
                (is (= [[1 nil]]
                       (mt/rows
                         (mt/run-mbql-query exciting-moments-in-history))))))))))))

;; Test how TINYINT(1) columns are interpreted. By default, they should be interpreted as integers, but with the
;; correct additional options, we should be able to change that -- see
;; https://github.com/metabase/metabase/issues/3506
(tx/defdataset ^:private tiny-int-ones
  [["number-of-cans"
     [{:field-name "thing",          :base-type :type/Text}
      {:field-name "number-of-cans", :base-type {:native "tinyint(1)"}, :effective-type :type/Integer}]
     [["Six Pack"              6]
      ["Toucan"                2]
      ["Empty Vending Machine" 0]]]])

(defn- db->fields [db]
  (let [table-ids (db/select-ids 'Table :db_id (u/the-id db))]
    (set (map (partial into {}) (db/select [Field :name :base_type :semantic_type] :table_id [:in table-ids])))))

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
        (tt/with-temp Database [db {:engine  "mysql"
                                    :details (assoc (:details (mt/db))
                                                    :additional-options "tinyInt1isBit=false")}]
          (sync/sync-database! db)
          (is (= #{{:name "number-of-cans", :base_type :type/Integer, :semantic_type :type/Quantity}
                   {:name "id", :base_type :type/Integer, :semantic_type :type/PK}
                   {:name "thing", :base_type :type/Text, :semantic_type :type/Category}}
                 (db->fields db))))))))

(tx/defdataset ^:private year-db
  [["years"
    [{:field-name "year_column", :base-type {:native "YEAR"}, :effective-type :type/Date}]
    [[2001] [2002] [1999]]]])

(deftest year-test
  (mt/test-driver :mysql
    (mt/dataset year-db
      (testing "By default YEAR"
        (is (= #{{:name "year_column", :base_type :type/Date, :semantic_type nil}
                 {:name "id", :base_type :type/Integer, :semantic_type :type/PK}}
               (db->fields (mt/db)))))
      (let [table  (db/select-one Table :db_id (u/id (mt/db)))
            fields (db/select Field :table_id (u/id table) :name "year_column")]
        (testing "Can select from this table"
          (is (= [[#t "2001-01-01"] [#t "2002-01-01"] [#t "1999-01-01"]]
                 (metadata-queries/table-rows-sample table fields (constantly conj)))))
        (testing "We can fingerprint this table"
          (is (= 1
                 (:updated-fingerprints (#'fingerprint/fingerprint-table! table fields)))))))))

(deftest db-timezone-id-test
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


(def ^:private before-daylight-savings #t "2018-03-10T10:00:00Z")
(def ^:private after-daylight-savings  #t "2018-03-12T10:00:00Z")

(deftest timezone-date-formatting-test
  (mt/test-driver :mysql
    ;; Most of our tests either deal in UTC (offset 00:00) or America/Los_Angeles timezones (-07:00/-08:00). When dealing
    ;; with dates, we will often truncate the timestamp to a date. When we only test with negative timezone offsets, in
    ;; combination with this truncation, means we could have a bug and it's hidden by this negative-only offset. As an
    ;; example, if we have a datetime like 2018-08-17 00:00:00-08:00, converting to UTC this becomes 2018-08-17
    ;; 08:00:00+00:00, which when truncated is still 2018-08-17. That same scenario in Hong Kong is 2018-08-17
    ;; 00:00:00+08:00, which then becomes 2018-08-16 16:00:00+00:00 when converted to UTC, which will truncate to
    ;; 2018-08-16, instead of 2018-08-17
    (mt/with-system-timezone-id "Asia/Hong_Kong"
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

        ;; This tests a similar scenario, but one in which the JVM timezone is in Hong Kong, but the report timezone
        ;; is in Los Angeles. The Joda Time date parsing functions for the most part default to UTC. Our tests all run
        ;; with a UTC JVM timezone. This test catches a bug where we are incorrectly assuming a date is in UTC when
        ;; the JVM timezone is different.
        ;;
        ;; The original bug can be found here: https://github.com/metabase/metabase/issues/8262. The MySQL driver code
        ;; was parsing the date using JodateTime's date parser, which is in UTC. The MySQL driver code was assuming
        ;; that date was in the system timezone rather than UTC which caused an incorrect conversion and with the
        ;; trucation, let to it being off by a day
        (testing "date formatting when system-timezone != report-timezone"
          (is (= ["2018-04-18T00:00:00-07:00"]
                 (run-query-with-report-timezone "America/Los_Angeles"))))))))

(def ^:private sample-connection-details
  {:db "my_db", :host "localhost", :port "3306", :user "cam", :password "bad-password"})

(def ^:private sample-jdbc-spec
  {:password             "bad-password"
   :characterSetResults  "UTF8"
   :characterEncoding    "UTF8"
   :classname            "org.mariadb.jdbc.Driver"
   :subprotocol          "mysql"
   :zeroDateTimeBehavior "convertToNull"
   :user                 "cam"
   :subname              "//localhost:3306/my_db"
   :useCompression       true
   :useUnicode           true})

(deftest connection-spec-test
  (testing "Do `:ssl` connection details give us the connection spec we'd expect?"
    (is (= (assoc sample-jdbc-spec :useSSL true :serverSslCert "sslCert")
           (sql-jdbc.conn/connection-details->spec :mysql (assoc sample-connection-details :ssl      true
                                                                                           :ssl-cert "sslCert")))))

  (testing "what about non-SSL connections?"
    (is (= (assoc sample-jdbc-spec :useSSL false)
           (sql-jdbc.conn/connection-details->spec :mysql sample-connection-details))))

  (testing "Connections that are `:ssl false` but with `useSSL` in the additional options should be treated as SSL (see #9629)"
    (is (= (assoc sample-jdbc-spec :useSSL true, :subname "//localhost:3306/my_db?useSSL=true&trustServerCertificate=true")
           (sql-jdbc.conn/connection-details->spec :mysql
             (assoc sample-connection-details
                    :ssl false
                    :additional-options "useSSL=true&trustServerCertificate=true"))))))

(deftest read-timediffs-test
  (mt/test-driver :mysql
    (testing "Make sure negative result of *diff() functions don't cause Exceptions (#10983)"
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
                           :middleware {:format-rows? false}))))))))))

(defn- table-fingerprint
  [{:keys [fields name]}]
  {:name   name
   :fields (map #(select-keys % [:name :base_type]) fields)})

(deftest system-versioned-tables-test
  (mt/test-driver :mysql
    (testing "system versioned tables appear during a sync"
      (let [spec (sql-jdbc.conn/connection-details->spec :mysql (tx/dbdef->connection-details :mysql :server nil))]
       (try
         ;; Create the DB
         (doseq [sql ["DROP DATABASE IF EXISTS versioned_tables;"
                      "CREATE DATABASE versioned_tables;"]]
           (jdbc/execute! spec [sql]))
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
             (tt/with-temp Database [database {:engine "mysql", :details details}]
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
                      (->> (hydrate (db/select Table :db_id (:id database) {:order-by [:name]}) :fields)
                           (map table-fingerprint))))))))))))

(deftest group-on-time-column-test
  (mt/test-driver :mysql
    (testing "can group on TIME columns (#12846)"
      (mt/dataset attempted-murders
        (let [now-date-str (u.date/format (t/local-date (t/zone-id "UTC")))
              add-date-fn  (fn [t] [(str now-date-str "T" t)])]
          (testing "by minute"
            (is (= (map add-date-fn ["00:14:00Z" "00:23:00Z" "00:35:00Z"])
                   (mt/rows
                     (mt/run-mbql-query attempts
                       {:breakout [!minute.time]
                        :order-by [[:asc !minute.time]]
                        :limit    3})))))
          (testing "by hour"
            (is (= (map add-date-fn ["23:00:00Z" "20:00:00Z" "19:00:00Z"])
                   (mt/rows
                     (mt/run-mbql-query attempts
                       {:breakout [!hour.time]
                        :order-by [[:desc !hour.time]]
                        :limit    3}))))))))))

(defn- pretty-sql [s]
  (str/replace s #"`" ""))

(deftest do-not-cast-to-date-if-column-is-already-a-date-test
  (testing "Don't wrap Field in date() if it's already a DATE (#11502)"
    (mt/test-driver :mysql
      (mt/dataset attempted-murders
        (let [query (mt/mbql-query attempts
                      {:aggregation [[:count]]
                       :breakout    [!day.date]})]
          (is (= (str "SELECT attempts.date AS date, count(*) AS count "
                      "FROM attempts "
                      "GROUP BY attempts.date "
                      "ORDER BY attempts.date ASC")
                 (some-> (qp/query->native query) :query pretty-sql))))))

    (testing "trunc-with-format should not cast a field if it is already a DATETIME"
      (is (= ["SELECT str_to_date(date_format(CAST(field AS datetime), '%Y'), '%Y')"]
             (hsql/format {:select [(#'mysql/trunc-with-format "%Y" :field)]})))
      (is (= ["SELECT str_to_date(date_format(field, '%Y'), '%Y')"]
             (hsql/format {:select [(#'mysql/trunc-with-format
                                     "%Y"
                                     (hx/with-database-type-info :field "datetime"))]}))))))

(deftest mysql-connect-with-ssl-and-pem-cert-test
  (mt/test-driver :mysql
    (if (System/getenv "MB_MYSQL_SSL_TEST_SSL_CERT")
      (testing "MySQL with SSL connectivity using PEM certificate"
        (mt/with-env-keys-renamed-by #(str/replace-first % "mb-mysql-ssl-test" "mb-mysql-test")
          (string-extracts-test/test-breakout)))
      (println (u/format-color 'yellow
                               "Skipping %s because %s env var is not set"
                               "mysql-connect-with-ssl-and-pem-cert-test"
                               "MB_MYSQL_SSL_TEST_SSL_CERT")))))
