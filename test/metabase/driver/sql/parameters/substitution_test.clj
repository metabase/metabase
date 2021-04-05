(ns metabase.driver.sql.parameters.substitution-test
  "Most of the code in `metabase.driver.sql.parameters.substitution` is actually tested by
  `metabase.driver.sql.parameters.substitute-test`."
  (:require [clojure.test :refer :all]
            [metabase.driver.sql.parameters.substitution :as substitution]
            [metabase.models :refer [Field]]
            [metabase.test :as mt]))

(deftest honeysql->replacement-snippet-info-test
  (testing "make sure we handle quotes inside names correctly!"
    (is (= {:replacement-snippet     "\"test-data\".\"PUBLIC\".\"checkins\".\"date\""
            :prepared-statement-args nil}
           (#'substitution/honeysql->replacement-snippet-info :h2 :test-data.PUBLIC.checkins.date)))))

(deftest field-filter->replacement-snippet-info-test
  (testing "Ensure native snippet expansion uses proper names for fields (#15460)"
    (is (= {:replacement-snippet "\"PUBLIC\".\"VENUES\".\"NAME\" = ?"
            :prepared-statement-args ["Doohickey"]}
           (#'substitution/field-filter->replacement-snippet-info
            :h2
            {:field (Field (mt/id :venues :name))
             :value {:type  :string/=
                     :value ["Doohickey"]}})))))
