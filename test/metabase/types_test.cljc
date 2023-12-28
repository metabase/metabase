(ns metabase.types-test
  (:require
   [clojure.test :refer [deftest is testing are]]
   [metabase.types :as types]
   [metabase.types.coercion-hierarchies :as coercion-hierarchies]))

(deftest ^:parallel assignable?-test
  (testing "assignability of numbers"
    (is (isa? :type/BigInteger :type/Integer))
    (is (types/assignable? :type/BigInteger :type/Integer))
    (is (types/assignable? :type/Integer :type/Decimal))
    (is (types/assignable? :type/BigInteger :type/Decimal)))
  (testing "assignability of texts"
    (is (isa? :type/Name :type/Text))
    (is (types/assignable? :type/Name :type/Text))))

(deftest ^:parallel most-specific-common-ancestor-test
  (are [x y expected] (= expected
                         (types/most-specific-common-ancestor x        y)
                         (types/most-specific-common-ancestor y        x)
                         (types/most-specific-common-ancestor x        expected)
                         (types/most-specific-common-ancestor y        expected)
                         (types/most-specific-common-ancestor expected x)
                         (types/most-specific-common-ancestor expected y))
    :type/Integer            :type/Integer                :type/Integer
    :type/Integer            :type/BigInteger             :type/Integer
    :type/Integer            :type/Float                  :type/Float
    :type/BigInteger         :type/Float                  :type/Float
    :type/Integer            :type/Decimal                :type/Decimal
    :type/BigInteger         :type/Decimal                :type/Decimal
    :type/Integer            :type/Text                   :type/*
    :type/DateTimeWithZoneID :type/DateTimeWithZoneOffset :type/DateTimeWithTZ
    :type/DateTimeWithZoneID :type/TimeWithZoneOffset     :type/Temporal
    nil                      :type/Integer                :type/*
    nil                      nil                          :type/*
    :type/*                  :type/*                      :type/*))

(derive ::Coerce-Int-To-Str :Coercion/*)
(coercion-hierarchies/define-types! ::Coerce-Int-To-Str :type/Integer :type/Text)

(deftest ^:parallel is-coercible?-test
  (is (= true
         (types/is-coercible? ::Coerce-Int-To-Str :type/Integer :type/Text)))
  (testing "should be able to coerce from a subtype of base type"
    (is (types/is-coercible? ::Coerce-Int-To-Str :type/BigInteger :type/Text)))
  (testing "should NOT be able to coerce from a parent type of base type"
    (is (not (types/is-coercible? ::Coerce-Int-To-Str :type/Number :type/Text))))
  (testing "should be able to coerce to a parent type of effective type"
    (is (types/is-coercible? ::Coerce-Int-To-Str :type/Integer :type/*)))
  (testing "should NOT be able to coerce to a subtype type of effective type"
    (is (not (types/is-coercible? ::Coerce-Int-To-Str :type/Integer :type/UUID))))
  (testing "should be able to mix & match a bit."
    (is (types/is-coercible? ::Coerce-Int-To-Str :type/BigInteger :type/*))))

(derive ::Coerce-BigInteger-To-Instant :Coercion/*)
(coercion-hierarchies/define-types! ::Coerce-BigInteger-To-Instant :type/BigInteger :type/Instant)

(deftest ^:parallel coercion-possibilities-test
  (is (= {:type/Text    #{::Coerce-Int-To-Str}
          :type/Instant #{:Coercion/UNIXNanoSeconds->DateTime
                          :Coercion/UNIXMicroSeconds->DateTime
                          :Coercion/UNIXMilliSeconds->DateTime
                          :Coercion/UNIXSeconds->DateTime}}
         (types/coercion-possibilities :type/Integer)))
  (is (= {:type/Instant #{:Coercion/UNIXNanoSeconds->DateTime
                          :Coercion/UNIXMicroSeconds->DateTime
                          :Coercion/UNIXMilliSeconds->DateTime
                          :Coercion/UNIXSeconds->DateTime}}
         (types/coercion-possibilities :type/Decimal)))

  (testing "Should work for for subtypes of a the coercion base type(s)"
    (is (= {:type/Text    #{::Coerce-Int-To-Str}
            :type/Instant #{:Coercion/UNIXNanoSeconds->DateTime
                            :Coercion/UNIXMicroSeconds->DateTime
                            :Coercion/UNIXMilliSeconds->DateTime
                            :Coercion/UNIXSeconds->DateTime
                            ::Coerce-BigInteger-To-Instant}}
           (types/coercion-possibilities :type/BigInteger))))

  (testing "Should *not* work for ancestor types of the coercion base type(s)"
    (is (= nil
           (types/coercion-possibilities :type/Number))))
  (testing "Non-inheritable coercions"
    ;; type/* has a coercion :Coercion/YYYYMMDDHHMMSSBytes->Temporal
    (is (= {:type/* #{:Coercion/YYYYMMDDHHMMSSBytes->Temporal}}
           (types/coercion-possibilities :type/*)))
    ;; a random type descendant of type/* should not have this coercion
    (is (= nil (types/coercion-possibilities :type/DruidHyperUnique)))))

(defn- keywords-in-namespace [keyword-namespace]
  (->> #?(:clj (var-get #'clojure.core/global-hierarchy)
          :cljs @(#'clojure.core/get-global-hierarchy))
       :parents
       keys
       (filter keyword?)
       (filter #(= (namespace %) (name keyword-namespace)))))

(defn- test-derived-from [a-type {:keys [required disallowed]}]
  (testing a-type
    (testing (str "should derive from one of" required)
      (is (some
             (partial isa? a-type)
             required)))
    (doseq [t disallowed]
      (testing (str "should NOT derive from " t)
        (is (not (isa? a-type t)))))))

(defn- test-keywords-in-namespace-derived-from [keyword-namespace options]
  (doseq [t (keywords-in-namespace keyword-namespace)]
    (test-derived-from t options)))

(deftest ^:parallel data-types-test
  (test-keywords-in-namespace-derived-from
   "type"
   {:required   [:type/* :Semantic/* :Relation/*]
    :disallowed [#_:Semantic/* :Coercion/* #_:Relation/* :entity/*]}))

(deftest ^:parallel semantic-types-test
  (test-keywords-in-namespace-derived-from
   "Semantic"
   {:required   [:Semantic/*]
    :disallowed [:Coercion/* :Relation/* :entity/*]}))

(deftest ^:parallel relation-types-test
  (test-keywords-in-namespace-derived-from
   "Relation"
   {:required   [:Relation/*]
    :disallowed [:type/* :Semantic/* :Coercion/* :entity/*]}))

(deftest ^:parallel coercion-strategies-test
  (test-keywords-in-namespace-derived-from
   "Coercion"
   {:required   [:Coercion/*]
    :disallowed [:type/* :Semantic/* :Relation/* :entity/*]}))

(deftest ^:parallel entity-types-test
  (test-keywords-in-namespace-derived-from
   "entity"
   {:required   [:entity/*]
    :disallowed [:type/* :Semantic/* :Relation/* :Coercion/*]}))
