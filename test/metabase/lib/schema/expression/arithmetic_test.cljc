(ns metabase.lib.schema.expression.arithmetic-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.expression.arithmetic]
   [metabase.lib.test-metadata :as meta]))

(comment metabase.lib.schema.expression.arithmetic/keep-me)

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

(deftest ^:parallel type-of-power-test
  (testing "#29944"
    (is (= :type/Integer
           (expression/type-of
            [:power
             {:lib/uuid "08cecb54-005a-4687-9884-c212b1511287"}
             [:field {:lib/uuid "d0813609-a69a-440e-8459-3c28b56498ae", :base-type :type/Integer} 133243]
             2])))))
