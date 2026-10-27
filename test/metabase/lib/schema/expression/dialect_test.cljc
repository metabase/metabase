(ns metabase.lib.schema.expression.dialect-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.schema.expression :as expression]
   [metabase.util.malli.registry :as mr]))

(def ^:private uuid "00000000-0000-0000-0000-000000000000")

(deftest ^:parallel dialect-fn-test
  (let [call [:dialect-fn {:lib/uuid uuid :base-type :type/DateTime} "toStartOfWeek"
              [:field {:lib/uuid uuid :base-type :type/DateTime} "created_at"]]]
    (testing "a call to a database's own function returns the type it says it does"
      (is (mr/validate :mbql.clause/dialect-fn call))
      (is (= :type/DateTime (expression/type-of call))))
    (testing "it must say what type it returns, and name a function"
      (is (not (mr/validate :mbql.clause/dialect-fn (update call 1 dissoc :base-type))))
      (is (not (mr/validate :mbql.clause/dialect-fn (assoc call 2 "drop table")))))))

(deftest ^:parallel dialect-aggregation-test
  (testing "an aggregate call is an aggregation"
    (is (mr/validate :metabase.lib.schema.aggregation/aggregation
                     [:dialect-aggregation {:lib/uuid uuid :base-type :type/Integer} "uniqExact"
                      [:field {:lib/uuid uuid :base-type :type/Text} "distinct_id"]]))
    (is (not (mr/validate :metabase.lib.schema.aggregation/aggregation
                          [:dialect-fn {:lib/uuid uuid :base-type :type/Integer} "length"
                           [:field {:lib/uuid uuid :base-type :type/Text} "distinct_id"]])))))
