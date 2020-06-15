(ns metabase.driver.sql.parameters.substitution-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.sql.parameters.substitution :as substitution]))

(deftest honeysql->replacement-snippet-info-test
  (driver/with-driver :h2
    (testing "make sure we handle quotes inside names correctly!"
      (is (= {:replacement-snippet     "\"test-data\".\"PUBLIC\".\"checkins\".\"date\""
              :prepared-statement-args nil}
             (#'substitution/honeysql->replacement-snippet-info :test-data.PUBLIC.checkins.date))))))
