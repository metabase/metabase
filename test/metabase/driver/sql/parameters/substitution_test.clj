(ns metabase.driver.sql.parameters.substitution-test
  "Most of the code in `metabase.driver.sql.parameters.substitution` is actually tested by
  `metabase.driver.sql.parameters.substitute-test`."
  (:require [clojure.test :refer :all]
            [metabase.driver.common.parameters :as params]
            [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
            [metabase.models :refer [Field]]
            [metabase.test :as mt]))

(deftest honeysql->replacement-snippet-info-test
  (testing "make sure we handle quotes inside names correctly!"
    (is (= {:replacement-snippet     "\"test-data\".\"PUBLIC\".\"checkins\".\"date\""
            :prepared-statement-args nil}
           (#'sql.params.substitution/honeysql->replacement-snippet-info :h2 :test-data.PUBLIC.checkins.date)))))

(deftest field-filter->replacement-snippet-info-test
  (testing "Ensure native snippet expansion uses proper names for fields (#15460)"
    (mt/with-everything-store
      (is (= {:replacement-snippet     "\"PUBLIC\".\"VENUES\".\"NAME\" = ?"
              :prepared-statement-args ["Doohickey"]}
             (#'sql.params.substitution/field-filter->replacement-snippet-info
              :h2
              {:field (Field (mt/id :venues :name))
               :value {:type  :string/=
                       :value ["Doohickey"]}}))))))

(deftest card-with-params->replacement-snippet-test
  (testing "Make sure Card params are preserved when expanding a Card reference (#12236)"
    (is (= {:replacement-snippet     "(SELECT * FROM table WHERE x LIKE ?)"
            :prepared-statement-args ["G%"]}
           (sql.params.substitution/->replacement-snippet-info
            :h2
            (params/map->ReferencedCardQuery
             {:card-id 1
              :query   "SELECT * FROM table WHERE x LIKE ?"
              :params  ["G%"]}))))))
