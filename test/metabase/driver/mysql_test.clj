(ns metabase.driver.mysql-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [clojure.java.jdbc :as jdbc]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [sync :as sync]
             [test :as mt]
             [util :as u]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]]
            [metabase.test.data.interface :as tx]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(deftest all-zero-dates-test
  (mt/test-driver :mysql
    (testing (str "MySQL allows 0000-00-00 dates, but JDBC does not; make sure that MySQL is converting them to NULL "
                  "when returning them like we asked"))
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
                       (mt/run-mbql-query exciting-moments-in-history)))))))))))


;; Test how TINYINT(1) columns are interpreted. By default, they should be interpreted as integers, but with the
;; correct additional options, we should be able to change that -- see
;; https://github.com/metabase/metabase/issues/3506
(tx/defdataset ^:private tiny-int-ones
  [["number-of-cans"
     [{:field-name "thing",          :base-type :type/Text}
      {:field-name "number-of-cans", :base-type {:native "tinyint(1)"}}]
     [["Six Pack"              6]
      ["Toucan"                2]
      ["Empty Vending Machine" 0]]]])

(defn- db->fields [db]
  (let [table-ids (db/select-ids 'Table :db_id (u/get-id db))]
    (set (map (partial into {}) (db/select [Field :name :base_type :special_type] :table_id [:in table-ids])))))

(deftest tiny-int-1-test
  (mt/test-driver :mysql
    (mt/dataset tiny-int-ones
      (testing "By default TINYINT(1) should be a boolean"
        (is (= #{{:name "number-of-cans", :base_type :type/Boolean, :special_type :type/Category}
                 {:name "id", :base_type :type/Integer, :special_type :type/PK}
                 {:name "thing", :base_type :type/Text, :special_type :type/Category}}
               (db->fields (mt/db)))))

      (testing "if someone says specifies `tinyInt1isBit=false`, it should come back as a number instead"
        (tt/with-temp Database [db {:engine  "mysql"
                                    :details (assoc (:details (mt/db))
                                                    :additional-options "tinyInt1isBit=false")}]
          (sync/sync-database! db)
          (is (= #{{:name "number-of-cans", :base_type :type/Integer, :special_type :type/Quantity}
                   {:name "id", :base_type :type/Integer, :special_type :type/PK}
                   {:name "thing", :base_type :type/Text, :special_type :type/Category}}
                 (db->fields db))))))))

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
                                   :template-tags {:date {:name "date" :display_name "Date" :type "date" }}}
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
    (= (assoc sample-jdbc-spec :useSSL true)
       (sql-jdbc.conn/connection-details->spec :mysql (assoc sample-connection-details :ssl true))))

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
