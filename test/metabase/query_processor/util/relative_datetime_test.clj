(ns metabase.query-processor.util.relative-datetime-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.query-processor.util.relative-datetime :as qp.relative-datetime]
   [metabase.test :as mt]
   [metabase.test.util.timezone :as test.tz]))

(defn- run-native-query [sql & params]
  (-> (mt/native-query {:query sql
                        :params params})
      qp/process-query))

(defn- getdate-vs-ss-ts-test-thunk-generator
  [unit value]
  (fn []
    ;; `with-redefs` forces use of `gettime()` in :relative-datetime transformation even for units gte or eq to :day.
    ;; This was standard before PR #38604, now server side timestamps are used for that. This test confirms that
    ;; server side generated timestamp (ie. new code path) results are equal to old code path results, that were not
    ;; cacheable.
    (let [honey {:select [[(with-redefs [qp.relative-datetime/use-server-side-relative-datetime? (constantly false)]
                             (sql.qp/->honeysql driver/*driver* [:relative-datetime value unit]))]
                          [(sql.qp/->honeysql driver/*driver* [:relative-datetime value unit])]]}
          sql (sql/format honey)
          result (apply run-native-query sql)
          [db-generated ss-generated] (-> result mt/rows first)]
      (is (= db-generated ss-generated)))))

(deftest server-side-relative-datetime-test
  (mt/test-drivers
   #{:redshift :snowflake}
   (testing "Values of getdate() and server side generated timestamp are equal"
     (mt/with-metadata-provider (mt/id)
       (let [test-thunk (getdate-vs-ss-ts-test-thunk-generator :week -1)]
         (doseq [tz-setter [qp.test-util/do-with-report-timezone-id!
                            test.tz/do-with-system-timezone-id!
                            qp.test-util/do-with-database-timezone-id
                            qp.test-util/do-with-results-timezone-id]
                 timezone ["America/Los_Angeles"
                           "Europe/Prague"
                           "UTC"]]
           (testing (str tz-setter " " timezone)
             (tz-setter timezone test-thunk))))))))

(deftest server-side-relative-datetime-multiple-tz-settings-test
  (mt/test-drivers
   #{:redshift :snowflake}
   (mt/with-metadata-provider (mt/id)
     (testing "Value of server side generated timestamp matches the one from getdate() with multiple timezone settings"
       (mt/with-results-timezone-id "UTC"
         (mt/with-database-timezone-id "America/Los_Angeles"
           (mt/with-report-timezone-id! "America/Los_Angeles"
             (mt/with-system-timezone-id! "Europe/Prague"
               (let [test-thunk (getdate-vs-ss-ts-test-thunk-generator :week -1)]
                 (test-thunk))))))))))

(deftest server-side-relative-datetime-various-units-test
  (mt/test-drivers
   #{:redshift :snowflake}
   (mt/with-metadata-provider (mt/id)
     (testing "Value of server side generated timestamp matches the one from getdate() with multiple timezone settings"
       (doseq [unit [:day :week :month :quarter :year]
               value [-30 0 7]
               :let [test-thunk (getdate-vs-ss-ts-test-thunk-generator unit value)]]
         (test-thunk))))))

(deftest server-side-relative-datetime-truncation-test
  (mt/test-drivers
   #{:redshift :snowflake}
   (testing "Datetime _truncation_ works correctly over different timezones"
     ;; Sunday is the first week day. System is in UTC and has 2014 Aug 10 Sunday 12:30:01 AM. Report is required
     ;; for New York, where there's still Saturday. So the time span that we'd like to see the results for
     ;; is 2014 Jul 27 12:00 AM <= x < 2014 Aug 03 12:00 AM. If we were using local date as a base
     ;; (in driver.snowflake/server-side-relative-datetime-honeysql-form), that would be correctly adjusted by the jdbc driver
     ;; to match timezone of the session. However that adjustment would come _after the truncation and addition_
     ;; that :relative-datetime does, hence would produce incorrect results. This test verifies the situation
     ;; is correctly handled.
     (mt/with-report-timezone-id! "America/New_York"
       (mt/with-system-timezone-id! "UTC"
         (mt/with-clock (t/zoned-date-time (t/local-date-time 2014 8 10 0 30 1 0) "UTC")
           (is (= [[13 "Dwight Gresham" "2014-08-01T10:30:00-04:00"]
                   [15 "Rüstem Hebel" "2014-08-01T12:45:00-04:00"]
                   [7 "Conchúr Tihomir" "2014-08-02T09:30:00-04:00"]
                   [6 "Shad Ferdynand" "2014-08-02T12:30:00-04:00"]]
                  (->> (mt/run-mbql-query
                        users
                        {:fields [$id $name $last_login]
                         :filter [:and
                                  [:>= $last_login [:relative-datetime -1 :week]]
                                  [:< $last_login [:relative-datetime 0 :week]]]
                         :order-by [[:asc $last_login]]})
                       (mt/formatted-rows [int str str]))))))))))
