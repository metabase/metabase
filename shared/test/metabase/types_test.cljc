(ns metabase.types-test
  #?@
   (:clj
    [(:require
      [clojure.test :as t]
      [metabase.types :as types]
      [metabase.types.coercion-hierarchies :as coercion-hierarchies])]
    :cljs
    [(:require
      [cljs.test :as t :include-macros true]
      [metabase.types :as types]
      [metabase.types.coercion-hierarchies :as coercion-hierarchies])]))

(derive ::Coerce-Int-To-Str :Coercion/*)
(coercion-hierarchies/define-types! ::Coerce-Int-To-Str :type/Integer :type/Text)

(t/deftest is-coercible?-test
  (t/is (= true
           (types/is-coercible? ::Coerce-Int-To-Str :type/Integer :type/Text)))
  (t/testing "should be able to coerce from a subtype of base type"
    (t/is (types/is-coercible? ::Coerce-Int-To-Str :type/BigInteger :type/Text)))
  (t/testing "should NOT be able to coerce from a parent type of base type"
    (t/is (not (types/is-coercible? ::Coerce-Int-To-Str :type/Number :type/Text))))
  (t/testing "should be able to coerce to a parent type of effective type"
    (t/is (types/is-coercible? ::Coerce-Int-To-Str :type/Integer :type/*)))
  (t/testing "should NOT be able to coerce to a subtype type of effective type"
    (t/is (not (types/is-coercible? ::Coerce-Int-To-Str :type/Integer :type/UUID))))
  (t/testing "should be able to mix & match a bit."
    (t/is (types/is-coercible? ::Coerce-Int-To-Str :type/BigInteger :type/*))))

(derive ::Coerce-BigInteger-To-Instant :Coercion/*)
(coercion-hierarchies/define-types! ::Coerce-BigInteger-To-Instant :type/BigInteger :type/Instant)

(t/deftest coercion-possibilities-test
  (t/is (= {:type/Text    #{::Coerce-Int-To-Str}
            :type/Instant #{:Coercion/UNIXMicroSeconds->DateTime
                            :Coercion/UNIXMilliSeconds->DateTime
                            :Coercion/UNIXSeconds->DateTime}}
           (types/coercion-possibilities :type/Integer)))
  (t/is (= {:type/Instant #{:Coercion/UNIXMicroSeconds->DateTime
                            :Coercion/UNIXMilliSeconds->DateTime
                            :Coercion/UNIXSeconds->DateTime}}
           (types/coercion-possibilities :type/Decimal)))

  (t/testing "Should work for for subtypes of a the coercion base type(s)"
    (t/is (= {:type/Text    #{::Coerce-Int-To-Str}
              :type/Instant #{:Coercion/UNIXMicroSeconds->DateTime
                              :Coercion/UNIXMilliSeconds->DateTime
                              :Coercion/UNIXSeconds->DateTime
                              ::Coerce-BigInteger-To-Instant}}
             (types/coercion-possibilities :type/BigInteger))))

  (t/testing "Should *not* work for ancestor types of the coercion base type(s)"
    (t/is (= nil
             (types/coercion-possibilities :type/Number)))))
