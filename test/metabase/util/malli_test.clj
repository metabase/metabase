(ns ^:mb/once metabase.util.malli-test
  (:require
   [clojure.string :as str]
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
    (is (= [{:x ["missing required key, received: nil"]
             :y ["missing required key, received: nil"]}]
           (:humanized
            (try (bar {})
                 (catch Exception e (ex-data e)))))
        "when we pass bar an invalid shape um/defn throws")
    (ns-unmap *ns* 'bar))

  (testing "invalid output"
    (mu/defn baz :- [:map [:x int?] [:y int?]] [] {:x "3"})
    (is (= {:x ["should be an int, received: \"3\""]
            :y ["missing required key, received: nil"]}
           (:humanized
            (try (baz)
                 (catch Exception e (ex-data e)))))
        "when baz returns an invalid form um/defn throws")
    (is (= "Inputs: []\n  Return: [:map [:x int?] [:y int?]]" (:doc (meta #'baz))))
    (ns-unmap *ns* 'baz)))

(deftest mu-defn-docstrings
  (testing "docstrings are preserved"
    (mu/defn ^:private boo :- :int "something very important to remember goes here" [_x])
    (is (str/ends-with? (:doc (meta #'boo)) "something very important to remember goes here"))
    (ns-unmap *ns* 'boo))

  (testing "no schemas given should work"
    (mu/defn qux [])
    (is (= "Inputs: []\n  Return: :any"
           (:doc (meta #'qux))))
    (ns-unmap *ns* 'qux)
    (mu/defn qux "Original docstring." [])
    (is (= (str/join "\n"
                     [  "Inputs: []"
                      "  Return: :any"
                      "          "
                      ""
                      "  Original docstring."])
           (:doc (meta #'qux))))
    (ns-unmap *ns* 'qux))

  (testing "no return schemas given should work"
    (mu/defn qux [x :- :int] x)
    (is (= "Inputs: [x :- :int]\n  Return: :any"
           (:doc (meta #'qux))))
    (ns-unmap *ns* 'qux)
    (mu/defn qux "Original docstring." [x :- :int] x)
    (is (= (str/join "\n"
                     [  "Inputs: [x :- :int]"
                      "  Return: :any"
                      "          "
                      ""
                      "  Original docstring."])
           (:doc (meta #'qux))))
    (ns-unmap *ns* 'qux))

  (testing "no input schemas given should work"
    (mu/defn qux :- :int [])
    (is (= "Inputs: []\n  Return: :int"
           (:doc (meta #'qux))))
    (ns-unmap *ns* 'qux)
    (mu/defn qux :- :int
      "Original docstring."
      [x :- :int] x)
    (is (= (str/join "\n"
                     [  "Inputs: [x :- :int]"
                      "  Return: :int"
                      "          "
                      ""
                      "  Original docstring."])
           (:doc (meta #'qux))))
    (ns-unmap *ns* 'qux))



  (testing "multi-arity, and varargs doc strings should work"
    (mu/defn ^:private foo :- [:multi {:dispatch :type}
                               [:sized [:map [:type [:= :sized]]
                                        [:size int?]]]
                               [:human [:map
                                        [:type [:= :human]]
                                        [:name string?]
                                        [:address [:map [:street string?]]]]]]
      ([] {:type :sized :size 3})
      ([a :- :int] {:type :sized :size a})
      ([a :- :int b :- :int] {:type :sized :size (+ a b)})
      ([a b & c :- [:* :int]] {:type :human
                               :name "Jim"
                               :address {:street (str  (+ a b (apply + c)) " ln")}}))
    (is (= (str/join "\n"
                     ;;v---doc inserts 2 spaces here, it's not misaligned!
                     [  "Inputs: ([]"
                      "           [a :- :int]"
                      "           [a :- :int b :- :int]"
                      "           [a b & c :- [:* :int]])"
                      "  Return: [:multi"
                      "           {:dispatch :type}"
                      "           [:sized [:map [:type [:= :sized]] [:size int?]]]"
                      "           [:human [:map [:type [:= :human]] [:name string?] [:address [:map [:street string?]]]]]]"])
           (:doc (meta #'foo))))
    (is (true? (:private (meta #'foo)))))
  (ns-unmap *ns* 'foo))

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

(deftest ->malli-io-link-test
  (is (= nil
         (#'mu/->malli-io-link nil nil)))
  (is (= nil
         (#'mu/->malli-io-link nil :string)))
  (is (= "https://malli.io?schema=%3Astring%0A&value=nil%0A"
         (#'mu/->malli-io-link :string nil))))
