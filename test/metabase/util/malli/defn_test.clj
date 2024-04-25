(ns ^:mb/once metabase.util.malli.defn-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.experimental :as mx]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]
   [metabase.util.malli.defn :as mu.defn]
   [metabase.util.malli.fn :as mu.fn]))

(deftest ^:parallel annotated-docstring-test
  (are [fn-tail expected] (= expected
                             (#'mu.defn/annotated-docstring (mc/parse mx/SchematizedParams fn-tail)))
    '(bar
      [x :- [:map [:x int?] [:y int?]]]
      (str x))
    (str "Inputs: [x :- [:map [:x int?] [:y int?]]]\n"
         "  Return: :any")


    '(bar
      :- :int
      ([x :- :int]
       (str x))
      ([x :- :int y :- :int]
       (str x)))
    (str "Inputs: ([x :- :int]\n"
         "           [x :- :int y :- :int])\n"
         "  Return: :int")))

(mu/defn bar [x :- [:map [:x int?] [:y int?]]] (str x))

(mu/defn baz :- [:map [:x int?] [:y int?]] [] {:x "3"})

(deftest ^:parallel mu-defn-test
  (testing "invalid input"
    (is (=? {:humanized {:x ["missing required key, got: nil"]
                         :y ["missing required key, got: nil"]}}
            (try (bar {})
                 (catch Exception e (ex-data e))))
        "when we pass bar an invalid shape um/defn throws"))

  (testing "invalid output"
    (is (=? {:humanized {:x ["should be an int, got: \"3\""]
                         :y ["missing required key, got: nil"]}}
            (try (baz)
                 (catch Exception e (def eed (ex-data e)) eed)))
        "when baz returns an invalid form um/defn throws")
    (is (= "Inputs: []\n  Return: [:map [:x int?] [:y int?]]"
           (:doc (meta #'baz))))))


(mu/defn ^:private boo :- :int "something very important to remember goes here" [_x])

(mu/defn qux-1 [])
(mu/defn qux-2 "Original docstring." [])
(mu/defn qux-3 [x :- :int] x)
(mu/defn qux-4 "Original docstring." [x :- :int] x)
(mu/defn qux-5 :- :int [])
(mu/defn qux-6 :- :int "Original docstring." [x :- :int] x)

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

(deftest ^:parallel mu-defn-docstrings
  (testing "docstrings are preserved"
    (is (str/ends-with? (:doc (meta #'boo)) "something very important to remember goes here")))

  (testing "no schemas given should work"
    (is (= "Inputs: []\n  Return: :any"
           (:doc (meta #'qux-1))))
    (is (= (str/join "\n"
                     [  "Inputs: []"
                      "  Return: :any"
                      "          "
                      ""
                      "  Original docstring."])
           (:doc (meta #'qux-2)))))

  (testing "no return schemas given should work"
    (is (= "Inputs: [x :- :int]\n  Return: :any"
           (:doc (meta #'qux-3))))
    (is (= (str/join "\n"
                     [  "Inputs: [x :- :int]"
                      "  Return: :any"
                      "          "
                      ""
                      "  Original docstring."])
           (:doc (meta #'qux-4)))))

  (testing "no input schemas given should work"
    (is (= "Inputs: []\n  Return: :int"
           (:doc (meta #'qux-5))))
    (is (= (str/join "\n"
                     [  "Inputs: [x :- :int]"
                      "  Return: :int"
                      "          "
                      ""
                      "  Original docstring."])
           (:doc (meta #'qux-6)))))

  (testing "multi-arity, and varargs doc strings should work"
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
    (is (true? (:private (meta #'foo))))))

(deftest ^:parallel attach-schema-to-metadata-test
  (are [varr expected] (= expected
                          (:schema (meta varr)))
    #'qux-6
    [:=> [:cat :int] :int]

    #'foo
    (let [out [:multi
               {:dispatch :type}
               [:sized [:map [:type [:= :sized]] [:size int?]]]
               [:human
                [:map
                 [:type [:= :human]]
                 [:name string?]
                 [:address [:map [:street string?]]]]]]]
      [:function
       [:=> :cat out]
       [:=> [:cat :int] out]
       [:=> [:cat :int :int] out]
       [:=> [:cat :any :any [:* :int]] out]])))

(mu/defn ^:private add-ints :- :int
  ^Integer [x :- :int y :- :int]
  (+ x y))

(deftest ^:parallel preserve-arglists-metadata-test
  (is (= 'java.lang.Integer
         (-> '{:arities [:single {:args    ^{:tag Integer} [x :- :int y :- :int]
                                  :prepost nil
                                  :body    [(+ x y)]}]}
             (#'mu.defn/deparameterized-arglists)
             first
             meta
             :tag)))
  (is (= 'java.lang.Integer
         (-> #'add-ints meta :arglists first meta :tag))))

(deftest ^:parallel defn-forms-are-not-emitted-for-skippable-ns-in-prod-test
  (testing "omission in macroexpansion"
    (testing "returns a simple fn*"
      (mt/with-dynamic-redefs [mu.fn/instrument-ns? (constantly false)]
        (let [expansion (macroexpand `(mu/defn ~'f :- :int [] "foo"))]
          (is (= '(def f
                    "Inputs: []\n  Return: :int" (clojure.core/fn [] "foo"))
                 expansion)))))
    (testing "returns an instrumented fn"
      (mt/with-dynamic-redefs [mu.fn/instrument-ns? (constantly true)]
        (let [expansion (macroexpand `(mu/defn ~'f :- :int [] "foo"))]
          (is (= '(def f
                    "Inputs: []\n  Return: :int"
                    (clojure.core/let
                        [&f (clojure.core/fn [] "foo")]
                      (clojure.core/fn
                        ([]
                         (try
                           (clojure.core/->> (&f) (metabase.util.malli.fn/validate-output {:fn-name 'f} :int))
                           (catch java.lang.Exception error (throw (metabase.util.malli.fn/fixup-stacktrace error))))))))
                 expansion)))))))
