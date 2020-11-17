(ns metabase.driver.sql.parameters.substitution-test
  "Most of the code in `metabase.driver.sql.parameters.substitution` is actually tested by
  `metabase.driver.sql.parameters.substitute-test`."
  (:require [clojure.test :refer :all]
            [metabase.driver.sql.parameters.substitution :as substitution]))

(deftest honeysql->replacement-snippet-info-test
  (testing "make sure we handle quotes inside names correctly!"
    (is (= {:replacement-snippet     "\"test-data\".\"PUBLIC\".\"checkins\".\"date\""
            :prepared-statement-args nil}
           (#'substitution/honeysql->replacement-snippet-info :h2 :test-data.PUBLIC.checkins.date)))))
