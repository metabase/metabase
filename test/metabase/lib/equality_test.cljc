(ns metabase.lib.equality-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [clojure.test.check.generators :as gen]
   [malli.generator :as mg]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.test-metadata :as meta]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel untyped-map-test
  (testing "equal"
    (are [x y] (lib.equality/= x y)
      {}                      {}
      {:a 1}                  {:a 1}
      {:a 1}                  {:a 1, :b/c 2}
      {:a 1, :b/c 2}          {:a 1, :b/c 2}
      {:a 1, :b/c 2}          {:a 1, :b/c 3}
      {:a 1, :b {:c/d 3}}     {:a 1, :b {:c/d 4}}
      {:a 1, :b [{:c/d 3} 4]} {:a 1, :b [{:c/d 4} 4]}))
  (testing "not equal"
    (are [x y] (not (lib.equality/= x y))
      {}                            nil
      {:a 1}                        nil
      {:a 1}                        {}
      {:a 1}                        {:a 2}
      {:a 1}                        {:a 1, :b 1}
      {:a 1, :b/c 2}                {:a 2, :b/c 2}
      {:a 1, :b {:c/d 3, :e 5}}     {:a 1, :b {:c/d 4, :e 6}}
      {:a 1, :b [2 {:c/d 3, :e 5}]} {:a 1, :b [2 {:c/d 4, :e 6}]})))

(deftest ^:parallel typed-map-test
  (testing "equal"
    (are [x y] (lib.equality/= x y)
      {:lib/type :m}               {:lib/type :m}
      {:lib/type :m, :a 1}         {:lib/type :m, :a 1}
      {:lib/type :m, :a 1}         {:lib/type :m, :a 1, :b/c 2}
      {:lib/type :m, :a 1, :b/c 2} {:lib/type :m, :a 1, :b/c 2}
      {:lib/type :m, :a 1, :b/c 2} {:lib/type :m, :a 1, :b/c 3}))
  (testing "not equal"
    (are [x y] (not (lib.equality/= x y))
      {:lib/type :m}                nil
      {:lib/type :m}                {}
      {:lib/type :m, :a 1}          {:a 1}
      {:lib/type :m, :a 1}          {:a 1, :b/c 2}
      {:lib/type :m, :a 1, :b/c 2}  {:a 1, :b/c 2}
      {:lib/type :m, :a 1, :b/c 2}  {:a 1, :b/c 3}
      {:lib/type :m1, }             {:lib/type :m2, }
      {:lib/type :m1, :a 1}         {:lib/type :m2, :a 1}
      {:lib/type :m1, :a 1}         {:lib/type :m2, :a 1, :b/c 2}
      {:lib/type :m1, :a 1, :b/c 2} {:lib/type :m2, :a 1, :b/c 2}
      {:lib/type :m1, :a 1, :b/c 2} {:lib/type :m2, :a 1, :b/c 3}
      {:lib/type :m, :a 1}          {:lib/type :m}
      {:lib/type :m, :a 1}          {:lib/type :m, :a 2}
      {:lib/type :m, :a 1}          {:lib/type :m, :a 1, :b 1}
      {:lib/type :m, :a 1, :b/c 2}  {:lib/type :m, :a 2, :b/c 2})))

(deftest ^:parallel simple-sequence-test
  (testing "equal"
    (are [xs ys] (lib.equality/= xs ys)
      [1 2 3]                          [1 2 3]
      (list 1 2 3)                     (list 1 2 3)
      [1 2 3]                          (list 1 2 3)
      [1 {:a {:b/c 1}}]                [1 {:a {:b/c 2}}]
      [1 {:lib/type :m, :a 1, :b/c 2}] [1 {:lib/type :m, :a 1, :b/c 3}]))
  (testing "not equal"
    (are [xs ys] (not (lib.equality/= xs ys))
      [1 2 3]         [1 2]
      [1 2 3]         [1 2 3 4]
      [1 2 3]         [1 2 4]
      [1 2 3]         [1 4 3]
      [1 {:a {:b 1}}] [1 {:a {:b 2}}])))

(deftest ^:parallel mbql-clause-test
  (testing "equal"
    (are [xs ys] (lib.equality/= xs ys)
      [:tag 2 3]                          [:tag 2 3]
      [:tag {:a {:b/c 1}}]                [:tag {:a {:b/c 2}}]
      [:tag {:lib/type :m, :a 1, :b/c 2}] [:tag {:lib/type :m, :a 1, :b/c 3}]))
  (testing "not equal"
    (are [xs ys] (not (lib.equality/= xs ys))
      [:tag 2 3]         [:tag 2]
      [:tag 2 3]         [:tag 2 3 4]
      [:tag 2 3]         [:tag 2 4]
      [:tag 2 3]         [:tag 4 3]
      [:tag {:a {:b 1}}] [:tag {:a {:b 2}}])))

;;; The stuff below is for generative testing; the goal is to generate two big horrible maps and or other MBQL
;;; expressions where everything other than namespaced keywords are equal, and then compare them.

(def ^:private map-key-generator
  "Generate a map key. Initially generate a key; if the key is a qualified keyword, toss a coin and maybe randomly
  generate a DIFFERENT qualified keyword instead of the one we originally generated. Otherwise return the original
  key.

  The goal here is to generate pairs of maps from a mix of key-value pairs that satisfies one of these goals:

  1. keys are the same, and values are the same

  2. keys are the same qualified keyword, but values are different

  3. keys are different qualified keywords

  This is so we can test equality, e.g. `{:a 1, :b/c 2}` and `{:a 1, :b/c 3}` should be considered equal if we ignore
  the qualified keyword keys."
  (gen/one-of
   [(mg/generator simple-keyword?)
    (mg/generator string?)
    (gen/fmap rand-nth
              (mg/generator [:repeat {:min 2, :max 2} qualified-keyword?]))]))

(def map-pair-generator
  "Generate a key-value pair using the rules discussed above."
  (let [expr-generator (gen/recursive-gen
                        (fn [_gen] (mg/generator [:ref ::expr]))
                        (gen/return nil))]
    (gen/bind map-key-generator
              (fn [k]
                (let [expr-generator (if-not (qualified-keyword? k)
                                       expr-generator
                                       (gen/fmap rand-nth
                                                 (gen/tuple expr-generator
                                                            expr-generator)))]
                  (gen/fmap (fn [v]
                              [k v])
                            expr-generator))))))

(def ^:private map-pairs
  [:repeat
   {:max 2}
   [:tuple
    {:gen/gen map-pair-generator}
    :any
    :any]])

(mr/def ::map
  [:map
   {:gen/schema map-pairs
    :gen/fmap   (fn [kvs]
                  (into {} kvs))}])

(mr/def ::exprs
  [:cat
   {:gen/fmap (fn [exprs]
                ;; sequence of exprs can't start with a keyword, otherwise it would be an MBQL clause. Add an extra
                ;; value at the beginning if the generated value starts with a keyword.
                (let [exprs (if (keyword? (first exprs))
                              (cons {:a 1} exprs)
                              exprs)]
                  ;; randomly return either a vector or sequence.
                  (mg/generate [:or
                                [:= {} (apply list exprs)]
                                [:= {} (vec exprs)]])))}
   [:repeat
    {:max 5}
    [:ref ::expr]]])

(mr/def ::mbql-clause
  [:cat
   ;; coerce output to a vector.
   {:gen/fmap vec}
   simple-keyword?
   [:schema [:ref ::map]]
   [:repeat {:min 0, :max 3} [:ref ::expr]]])

(mr/def ::expr
  [:or
   :int
   :double
   :keyword
   :string
   :boolean
   [:= {} nil]
   [:ref ::map]
   [:ref ::exprs]
   [:ref ::mbql-clause]])

(deftest ^:parallel generative-equality-test
  (doseq [schema [::expr ::map]
          seed   (let [num-tests 50
                       start     (rand-int 1000000)]
                   (range start (+ start num-tests)))]
    (let [x (mg/generate schema {:seed seed})
          y (mg/generate schema {:seed seed})]
      (testing (str \newline (u/pprint-to-str (list `lib.equality/= (list 'quote x) (list 'quote y))))
        (is (lib.equality/= x y))))))

(deftest ^:parallel find-closest-matching-ref-test
  (are [a-ref refs expected] (= expected
                                (lib.equality/find-closest-matching-ref a-ref refs))
    ;; strict matching
    [:field {} 1]
    [[:field {} 1]
     [:field {} 2]
     [:field {} 3]]
    [:field {} 1]

    [:field {:base-type :type/Integer} 1]
    [[:field {:base-type :type/Number} 1]
     [:field {:base-type :type/Integer} 1]]
    [:field {:base-type :type/Integer} 1]

    [:field {:join-alias "J"} 1]
    [[:field {:join-alias "J"} 1]
     [:field {:join-alias "J"} 2]]
    [:field {:join-alias "J"} 1]

    ;; if no strict match, should ignore type info and return first match
    [:field {:base-type :type/Float} 1]
    [[:field {:base-type :type/Number} 1]
     [:field {:base-type :type/Integer} 1]]
    [:field {:base-type :type/Number} 1]

    ;; if no exact match, ignore :join-alias
    [:field {} 1]
    [[:field {:join-alias "J"} 1]
     [:field {:join-alias "J"} 2]]
    [:field {:join-alias "J"} 1]))

(deftest ^:parallel find-closest-matching-ref-3-arity-test
  (is (= [:field {} "CATEGORY"]
         (lib.equality/find-closest-matching-ref
          meta/metadata-provider
          [:field {} (meta/id :products :category)]
          [[:field {} "ID"]
           [:field {} "CATEGORY"]]))))
