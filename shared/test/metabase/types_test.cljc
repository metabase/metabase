(ns metabase.types-test
  #?@(:clj
      [(:require
        [clojure.test :as t]
        [metabase.types :as types]
        [metabase.types.coercion-hierarchies :as coercion-hierarchies])]
      :cljs
      [(:require
        [cljs.test :as t :include-macros true]
        [metabase.types :as types]
        [metabase.types.coercion-hierarchies :as coercion-hierarchies])]))

(comment types/keep-me)

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
             (types/coercion-possibilities :type/Number))))
  (t/testing "Non-inheritable coercions"
    ;; type/* has a coercion :Coercion/YYYYMMDDHHMMSSBytes->Temporal
    (t/is (= {:type/* #{:Coercion/YYYYMMDDHHMMSSBytes->Temporal}}
             (types/coercion-possibilities :type/*)))
    ;; a random type descendant of type/* should not have this coercion
    (t/is (= nil (types/coercion-possibilities :type/DruidHyperUnique)))))

(defn- keywords-in-namespace [keyword-namespace]
  (->> #?(:clj (var-get #'clojure.core/global-hierarchy)
          :cljs @(#'clojure.core/get-global-hierarchy))
       :parents
       keys
       (filter #(= (namespace %) (name keyword-namespace)))))

(defn- test-derived-from [a-type {:keys [required disallowed]}]
  (t/testing a-type
    (t/testing (str "should derive from one of" required)
      (t/is (some
             (partial isa? a-type)
             required)))
    (doseq [t disallowed]
      (t/testing (str "should NOT derive from " t)
        (t/is (not (isa? a-type t)))))))

(defn- test-keywords-in-namespace-derived-from [keyword-namespace options]
  (doseq [t (keywords-in-namespace keyword-namespace)]
    (test-derived-from t options)))

(t/deftest data-types-test
  (test-keywords-in-namespace-derived-from
   "type"
   {:required   [:type/* :Semantic/* :Relation/*]
    :disallowed [#_:Semantic/* :Coercion/* #_:Relation/* :entity/*]}))

(t/deftest semantic-types-test
  (test-keywords-in-namespace-derived-from
   "Semantic"
   {:required   [:Semantic/*]
    :disallowed [:Coercion/* :Relation/* :entity/*]}))

(t/deftest relation-types-test
  (test-keywords-in-namespace-derived-from
   "Relation"
   {:required   [:Relation/*]
    :disallowed [:type/* :Semantic/* :Coercion/* :entity/*]}))

(t/deftest coercion-strategies-test
  (test-keywords-in-namespace-derived-from
   "Coercion"
   {:required   [:Coercion/*]
    :disallowed [:type/* :Semantic/* :Relation/* :entity/*]}))

(t/deftest entity-types-test
  (test-keywords-in-namespace-derived-from
   "entity"
   {:required   [:entity/*]
    :disallowed [:type/* :Semantic/* :Relation/* :Coercion/*]}))
