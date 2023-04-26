(ns metabase.lib.schema.expression.arithmetic-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.schema]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.test-metadata :as meta]))

(comment metabase.lib.schema/keep-me)

(deftest ^:parallel times-test
  (let [venues-price [:field {:lib/uuid (str (random-uuid)), :base-type :type/Integer} (meta/id :venues :price)]]
    (testing "A `:field` clause with an integer base type in its options should be considered to be an integer expression"
      (is (mc/validate
           ::expression/integer
           venues-price)))
    (testing "integer literals are integer expressions"
      (is (mc/validate
           ::expression/integer
           2)))
    (testing "Multiplication with all integer args should be considered to be an integer expression"
      (let [expr [:* {:lib/uuid (str (random-uuid))} venues-price 2]]
        (is (= :type/Integer
               (expression/type-of expr)))
        (is (mc/validate :mbql.clause/* expr))
        (is (mc/validate ::expression/integer expr))))
    (testing "Multiplication with one or more non-integer args should NOT be considered to be an integer expression."
      (let [expr [:* {:lib/uuid (str (random-uuid))} venues-price 2.1]]
        (is (= :type/Number
               (expression/type-of expr)))
        (is (mc/validate :mbql.clause/* expr))
        (is (not (mc/validate ::expression/integer expr)))
        (is (mc/validate ::expression/number expr))))))

(deftest ^:parallel power-type-of-test
  (testing "Make sure we can calculate type of a `:power` clause (#29944)"
    (testing ":field has type info"
      (testing ":type/Integer if both expr and exponent are integers"
        (is (= :type/Integer
               (expression/type-of
                [:power
                 {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                 [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Integer} 1]
                 2]))))
      (testing ":type/Float if expr is non-integer"
        (is (= :type/Float
               (expression/type-of
                [:power
                 {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                 [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Float} 1]
                 2]))))
      (testing ":type/Float if exponent is non-integer"
        (is (= :type/Float
               (expression/type-of
                [:power
                 {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                 [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Integer} 1]
                 2.1])))))
    (testing ":field missing type info"
      (is (= :type/Float
             (expression/type-of
              [:power
               {:lib/uuid "00000000-0000-0000-0000-000000000000"}
               [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
               2]))))))
