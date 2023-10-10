(ns ^:mb/once metabase.util.malli-test
  "Tests for [[metabase.util.malli/defn]] live in [[metabase.util.malli.defn-test]]."
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.test :as mt]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.describe :as umd]))

(deftest with-api-error-message
  (let [less-than-four-fxn (fn [x] (< x 4))]
    (testing "outer schema"
      (let [special-lt-4-schema (mu/with-api-error-message
                                  [:fn less-than-four-fxn]
                                  (deferred-tru "Special Number that has to be less than four description")
                                  (deferred-tru "Special Number that has to be less than four error"))]

        (is (= [(deferred-tru "Special Number that has to be less than four error")]
               (me/humanize (mc/explain special-lt-4-schema 8))))

        (is (= ["Special Number that has to be less than four error, received: 8"]
               (me/humanize (mc/explain special-lt-4-schema 8) {:wrap #'mu/humanize-include-value})))

        (testing "should be user-localized"
          (is (= "Special Number that has to be less than four description"
                 (umd/describe special-lt-4-schema)))

          (mt/with-mock-i18n-bundles {"es" {:messages {"Special Number that has to be less than four description"
                                                       "Número especial que tiene que ser menos de cuatro descripción"

                                                       "Special Number that has to be less than four error"
                                                       "Número especial que tiene que ser menos de cuatro errores"
                                                       "received" "recibió"}}}
            (mt/with-user-locale "es"
              (is (= "Número especial que tiene que ser menos de cuatro descripción"
                     (umd/describe special-lt-4-schema)))

              (is (= ["Número especial que tiene que ser menos de cuatro errores, recibió: 8"]
                   (me/humanize (mc/explain special-lt-4-schema 8) {:wrap #'mu/humanize-include-value}))))))))


    (testing "inner schema"
      (let [special-lt-4-schema [:map [:ltf-key (mu/with-api-error-message
                                                  [:fn less-than-four-fxn]
                                                  (deferred-tru "Special Number that has to be less than four"))]]]
        (is (= {:ltf-key ["missing required key"]}
               (me/humanize (mc/explain special-lt-4-schema {}))))

        (is (= {:ltf-key [(deferred-tru "Special Number that has to be less than four")]}
               (me/humanize (mc/explain special-lt-4-schema {:ltf-key 8}))))

        (is (= "map where {:ltf-key -> <Special Number that has to be less than four>}"
               (umd/describe special-lt-4-schema)))))))

(deftest validate-throw-test
  (testing "with a schema"
    (is (= {:a 1 :b "b"} (mu/validate-throw [:map [:a :int] [:b :string]] {:a 1 :b "b"})))
    (is (thrown-with-msg? Exception #"Value does not match schema" (mu/validate-throw [:map [:a :int] [:b :string]] "1"))))
  (let [map-validator (mc/validator [:map [:a :int] [:b :string]])]
    (testing "with a schema"
      (is (= {:a 1 :b "b"} (mu/validate-throw map-validator {:a 1 :b "b"}))
          (is (thrown-with-msg? Exception #"Value does not match schema" (mu/validate-throw map-validator "1")))))))
