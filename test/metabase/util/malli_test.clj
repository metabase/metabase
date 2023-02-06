(ns ^:mb/once metabase.util.malli-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.test :as mt]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.describe :as umd]))

(deftest mu-defn-test
  (testing "invalid input"
    (mu/defn bar [x :- [:map [:x int?] [:y int?]]] (str x))
    (is (= [{:x ["missing required key"]
             :y ["missing required key"]}]
           (:humanized
            (try (bar {})
                 (catch Exception e (ex-data e)))))
        "when we pass bar an invalid shape um/defn throws")
    (ns-unmap *ns* 'bar))

  (testing "invalid output"
    (mu/defn baz :- [:map [:x int?] [:y int?]] [] {:x "3"})
    (is (= {:x ["should be an int"]
            :y ["missing required key"]}
           (:humanized
            (try (baz)
                 (catch Exception e (ex-data e)))))
        "when baz returns an invalid form um/defn throws")
    (ns-unmap *ns* 'baz)))

(deftest with-api-error-message
  (let [less-than-four-fxn (fn [x] (< x 4))]
    (testing "outer schema"
      (let [special-lt-4-schema (mu/with-api-error-message
                                  [:fn less-than-four-fxn]
                                  (deferred-tru "Special Number that has to be less than four error")
                                  (deferred-tru "Special Number that has to be less than four description"))]

        (is (= [(deferred-tru "Special Number that has to be less than four description")]
               (me/humanize (mc/explain special-lt-4-schema 8))))

        (testing "describe should be user-localized"
          (is (= "Special Number that has to be less than four error"
                 (umd/describe special-lt-4-schema)))

          (mt/with-mock-i18n-bundles {"es" {:messages {"Special Number that has to be less than four error"
                                                       "Número especial que tiene que ser menos de cuatro errores"}}}
            (mt/with-user-locale "es"
              (is (= "Número especial que tiene que ser menos de cuatro errores"
                     (umd/describe special-lt-4-schema))))))))

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
