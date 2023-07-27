(ns metabase.lib.equality-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [clojure.test.check.generators :as gen]
   [malli.generator :as mg]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

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

(deftest ^:parallel find-closest-matches-for-refs-test
  (are [needles haystack expected] (= expected
                                      (lib.equality/find-closest-matches-for-refs needles haystack))
    ;; strict matching
    [[:field {} 3]
     [:field {} 1]]
    [[:field {} 1]
     [:field {} 2]
     [:field {} 3]]
    {[:field {} 3] 0
     [:field {} 1] 1}

    [[:field {:base-type :type/Integer} 1]]
    [[:field {:base-type :type/Number} 1]
     [:field {:base-type :type/Integer} 1]]
    {[:field {:base-type :type/Integer} 1] 0}

    [[:field {:join-alias "J"} 1]]
    [[:field {:join-alias "I"} 1]
     [:field {:join-alias "J"} 1]]
    {[:field {:join-alias "J"} 1] 0}

    ;; if no strict match, should ignore type info and return first match
    ;; note that the key of the returned map is the *original* haystack value
    [[:field {:base-type :type/Float} 1]]
    [[:field {:base-type :type/Number} 1]
     [:field {:base-type :type/Integer} 1]]
    {[:field {:base-type :type/Number} 1] 0}

    ;; if no exact match, ignore :join-alias
    [[:field {} 1]]
    [[:field {:join-alias "J"} 1]
     [:field {:join-alias "J"} 2]]
    {[:field {:join-alias "J"} 1] 0}

    ;; ignore binning altogether if we need to.
    [:field {:base-type :type/Float
             :binning   {:strategy :bin-width, :bin-width 20}
             :lib/uuid  "ead5b63d-a326-4fab-bacb-69e1b08f807d"}
     "People__LONGITUDE"]
    [[:field {:lib/uuid       "6fc44b58-694d-4b43-82cd-9e52c633a38c"
              :base-type      :type/Float
              :effective-type :type/Float}
      "People__LONGITUDE"]]
    {[:field {:lib/uuid       "6fc44b58-694d-4b43-82cd-9e52c633a38c"
             :base-type      :type/Float
             :effective-type :type/Float}
     "People__LONGITUDE"] 0}

    ;; failed to match - ran out of transformations
    [[:field {} 1]]
    [[:field {:join-alias "J"} 2]
     [:field {:join-alias "J"} 3]]
    {}))

(deftest ^:parallel find-closest-matching-ref-test
  (are [needle haystack expected] (= expected
                                     (lib.equality/find-closest-matching-ref needle haystack))
    ;; strict matching
    [:field {} 3]
    [[:field {} 1]
     [:field {} 2]
     [:field {} 3]]
    [:field {} 3]

    [:field {:base-type :type/Integer} 1]
    [[:field {:base-type :type/Number} 1]
     [:field {:base-type :type/Integer} 1]]
    [:field {:base-type :type/Integer} 1]

    [:field {:join-alias "J"} 1]
    [[:field {:join-alias "I"} 1]
     [:field {:join-alias "J"} 1]]
    [:field {:join-alias "J"} 1]

    ;; if no strict match, should ignore type info and return first match
    ;; note that the key of the returned map is the *original* haystack value
    [:field {:base-type :type/Float} 1]
    [[:field {:base-type :type/Number} 1]
     [:field {:base-type :type/Integer} 1]]
    [:field {:base-type :type/Number} 1]

    ;; if no exact match, ignore :join-alias
    [:field {} 1]
    [[:field {:join-alias "J"} 1]
     [:field {:join-alias "J"} 2]]
    [:field {:join-alias "J"} 1]

    ;; failed to match - ran out of transformations
    [:field {} 1]
    [[:field {:join-alias "J"} 2]
     [:field {:join-alias "J"} 3]]
    nil))

(deftest ^:parallel find-closest-matches-for-refs-4-arity-test
  (is (= {[:field {} "CATEGORY"] 0
          [:field {} "ID"]       1}
         (lib.equality/find-closest-matches-for-refs
          (lib/query meta/metadata-provider (meta/table-metadata :products))
          -1
          [[:field {} (meta/id :products :category)]
           [:field {} "ID"]
           [:field {} "NAME"]]
          [[:field {} "ID"]
           [:field {} "CATEGORY"]]))))

(deftest ^:parallel find-closest-matching-ref-4-arity-test
  (is (= [:field {} "CATEGORY"]
         (lib.equality/find-closest-matching-ref
          (lib/query meta/metadata-provider (meta/table-metadata :products))
          -1
          [:field {} (meta/id :products :category)]
          [[:field {} "ID"]
           [:field {} "CATEGORY"]])))
  (is (= nil
         (lib.equality/find-closest-matching-ref
          (lib/query meta/metadata-provider (meta/table-metadata :products))
          -1
           [:field {} (meta/id :products :title)]
           [[:field {} "ID"]
            [:field {} "CATEGORY"]])))
  (is (= [:field {} "ID"]
         (lib.equality/find-closest-matching-ref
          (lib/query meta/metadata-provider (meta/table-metadata :products))
          -1
          [:field {} "ID"]
          [[:field {} "ID"]
           [:field {} "CATEGORY"]]))))

(deftest ^:parallel find-closest-matching-ref-ignore-temporal-unit-test
  (testing "Should find a matching ref ignoring :temporal-unit if needed (#32920)"
    (let [query    (lib/query meta/metadata-provider (meta/table-metadata :orders))
          needle   (-> (meta/field-metadata :orders :created-at)
                       (lib/with-temporal-bucket :month)
                       lib/ref)
          haystack (mapv lib/ref (lib.metadata.calculation/returned-columns query))]
      (is (=? [:field
               {:lib/uuid       string?
                :base-type      :type/DateTimeWithLocalTZ
                :effective-type :type/DateTimeWithLocalTZ}
               (meta/id :orders :created-at)]
              (lib.equality/find-closest-matching-ref needle haystack))))))

(deftest ^:parallel mark-selected-columns-ignore-temporal-unit-test
  (testing "Mark columns selected even if they have a :temporal-unit (#32920)"
    (let [query    (lib/query meta/metadata-provider (meta/table-metadata :orders))
          cols     (lib.metadata.calculation/returned-columns query)
          selected [(-> (meta/field-metadata :orders :created-at)
                        (lib/with-temporal-bucket :month)
                        lib/ref)]]
      (is (= [{:name "ID",         :selected? false}
              {:name "USER_ID",    :selected? false}
              {:name "PRODUCT_ID", :selected? false}
              {:name "SUBTOTAL",   :selected? false}
              {:name "TAX",        :selected? false}
              {:name "TOTAL",      :selected? false}
              {:name "DISCOUNT",   :selected? false}
              {:name "CREATED_AT", :selected? true}
              {:name "QUANTITY",   :selected? false}]
             (mapv #(select-keys % [:name :selected?])
                   (lib.equality/mark-selected-columns cols selected)))))))

(deftest ^:parallel closest-matching-metadata-test
  (testing "closest-matching-metadata should find metadatas based on matching ID (#31482) (#33453)"
    (let [query (lib/append-stage lib.tu/query-with-join)
          cols  (lib/returned-columns query)
          refs  (map lib.ref/ref cols)
          a-ref [:field {:lib/uuid (str (random-uuid))} (meta/id :categories :name)]]
      (is (=? [[:field {} "ID"]          ; 0
               [:field {} "NAME"]        ; 1
               [:field {} "CATEGORY_ID"] ; 2
               [:field {} "LATITUDE"]    ; 3
               [:field {} "LONGITUDE"]   ; 4
               [:field {} "PRICE"]       ; 5
               [:field {} "Cat__ID"]     ; 6
               [:field {} "Cat__NAME"]]  ; 7
              refs))
      (testing "find-closest-matching-ref actually finds the wrong ref here! This is venues.name, not categories.name!!!"
        (is (=? [:field {} "NAME"]
                (lib.equality/find-closest-matching-ref query -1 a-ref refs))))
      (testing "... closest-matching-metadata finds the correct metadata, categories.name!!!"
        (is (= 7
               (lib.equality/index-of-closest-matching-metadata a-ref cols)))))))

(deftest ^:parallel closest-matching-metadata-aggregation-test
  (let [query (-> lib.tu/venues-query
                  (lib/aggregate (lib/count)))
        [ag]  (lib/aggregations query)]
    (is (=? {:display-name "Count", :lib/source :source/aggregations}
            (lib.equality/closest-matching-metadata
             [:aggregation {:lib/uuid (str (random-uuid))} (lib.options/uuid ag)]
             (lib/returned-columns query))))))

(deftest ^:parallel closest-matching-metadata-expression-test
  (is (=? {:name "expr", :lib/source :source/expressions}
          (lib.equality/closest-matching-metadata
           [:expression {:lib/uuid (str (random-uuid))} "expr"]
           (lib/visible-columns lib.tu/query-with-expression)))))

(deftest ^:parallel find-column-for-legacy-ref-field-test
  (are [legacy-ref] (=? {:name "NAME", :id (meta/id :venues :name)}
                        (lib/find-column-for-legacy-ref
                         lib.tu/venues-query
                         legacy-ref
                         (lib/visible-columns lib.tu/venues-query)))
    [:field (meta/id :venues :name) nil]
    [:field (meta/id :venues :name) {}]
    ;; should work with refs that need normalization
    ["field" (meta/id :venues :name) nil]
    ["field" (meta/id :venues :name)]
    #?@(:cljs
        [#js ["field" (meta/id :venues :name) nil]
         #js ["field" (meta/id :venues :name) #js {}]])))

(deftest ^:parallel find-column-for-legacy-ref-expression-test
  (are [legacy-ref] (=? {:name "expr", :lib/source :source/expressions}
                        (lib/find-column-for-legacy-ref
                         lib.tu/query-with-expression
                         legacy-ref
                         (lib/visible-columns lib.tu/query-with-expression)))
    [:expression "expr"]
    ["expression" "expr"]
    ["expression" "expr" nil]
    ["expression" "expr" {}]
    #?@(:cljs
        [#js ["expression" "expr"]
         #js ["expression" "expr" #js {}]])))

(deftest ^:parallel find-column-for-legacy-ref-aggregation-test
  (let [query (-> lib.tu/venues-query
                  (lib/aggregate (lib/count)))]
    (are [legacy-ref] (=? {:name           "count"
                           :effective-type :type/Integer
                           :lib/source     :source/aggregations}
                          (lib/find-column-for-legacy-ref
                           query
                           legacy-ref
                           (lib/returned-columns query)))
      [:aggregation 0]
      ["aggregation" 0]
      ["aggregation" 0 nil]
      ["aggregation" 0 {}]
      #?@(:cljs
          [#js ["aggregation" 0]
           #js ["aggregation" 0 #js {}]]))))
