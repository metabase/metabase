(ns metabase.lib.schema.expression.arithmetic-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
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

(deftest ^:parallel type-of-arithmetic-expression-test
  (are [x y expected] (= expected
                         (expression/type-of [:*
                                              {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                                              x
                                              y]))
    1   1   :type/Integer
    1.1 1.1 :type/Float
    1   1.1 :type/Number

    ;; type-of for a numeric arithmetic expression with a ref without type info should return type/Number (#29946)
    [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1]
    1
    :type/Number))

(deftest ^:parallel type-of-temporal-arithmetic-expression-test
  (are [x y expected] (= expected
                         (expression/type-of [:+
                                              {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                                              x
                                              y]))
    [:field {:lib/uuid "00000000-0000-0000-0000-000000000001", :base-type :type/Date} 1]
    [:interval {:lib/uuid "00000000-0000-0000-0000-000000000002"} 1 :year]
    :type/Date

    ;; order of args should not matter.
    [:interval {:lib/uuid "00000000-0000-0000-0000-000000000002"} 1 :year]
    [:field {:lib/uuid "00000000-0000-0000-0000-000000000001", :base-type :type/Date} 1]
    :type/Date

    ;; assume :type/Temporal for a ref that does not have type info.
    [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1]
    [:interval {:lib/uuid "00000000-0000-0000-0000-000000000002"} 1 :year]
    :type/Temporal

    [:interval {:lib/uuid "00000000-0000-0000-0000-000000000002"} 1 :year]
    [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1]
    :type/Temporal))

(deftest ^:parallel temporal-arithmetic-schema-test
  (testing "Should allow multiple intervals; interval should be allowed as first arg"
    (is (not (me/humanize
              (mc/explain
               :mbql.clause/+
               [:+
                {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                [:interval {:lib/uuid "00000000-0000-0000-0000-000000000001"} 3 :day]
                [:field {:temporal-unit :default, :lib/uuid "00000000-0000-0000-0000-000000000002"} 1]
                [:interval {:lib/uuid "00000000-0000-0000-0000-000000000003"} 3 :day]])))))
  (testing "Should error if there are no non-interval clauses"
    (is (= ["Invalid :+ clause: Clause must have exactly one non-interval expression"]
           (me/humanize
            (mc/explain
             :mbql.clause/+
             [:+
              {:lib/uuid "00000000-0000-0000-0000-000000000000"}
              [:interval {:lib/uuid "00000000-0000-0000-0000-000000000001"} 3 :day]
              [:interval {:lib/uuid "00000000-0000-0000-0000-000000000002"} 3 :day]])))))
  (testing "Should error if there is more than one non-interval clause"
    (is (= ["Invalid :+ clause: Clause must have exactly one non-interval expression"]
           (me/humanize
            (mc/explain
             :mbql.clause/+
             [:+
              {:lib/uuid "00000000-0000-0000-0000-000000000000"}
              [:field {:temporal-unit :default, :lib/uuid "00000000-0000-0000-0000-000000000001"} 1]
              [:interval {:lib/uuid "00000000-0000-0000-0000-000000000002"} 3 :day]
              [:field {:temporal-unit :default, :lib/uuid "00000000-0000-0000-0000-000000000003"} 2]])))))
  (testing "Should error if :interval has a unit that doesn't make sense"
    (is (= ["Invalid :+ clause: Cannot add a :minute interval to a :type/Date expression"]
           (me/humanize
            (mc/explain
             :mbql.clause/+
             [:+
              {:lib/uuid "00000000-0000-0000-0000-000000000000"}
              [:interval {:lib/uuid "00000000-0000-0000-0000-000000000002"} 3 :minute]
              [:field {:base-type :type/Date, :lib/uuid "00000000-0000-0000-0000-000000000001"} 1]]))))))
