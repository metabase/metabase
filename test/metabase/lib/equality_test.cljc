(ns metabase.lib.equality-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.pprint :as pprint]
   [clojure.test :refer [are deftest is testing]]
   [clojure.test.check.generators :as gen]
   [malli.generator :as mg]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

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
      {:lib/type :m1}             {:lib/type :m2}
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

(deftest ^:parallel =-ignores-uuids-test
  (testing "should be equal"
    (are [x y] (lib.equality/= x y)
      ;; should ignore different UUIDs
      [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
      [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1]

      ;; should recurse into subclauses correctly
      [:=
       {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1]
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000002"} 2]]
      [:=
       {:lib/uuid "00000000-0000-0000-0000-000000000003"}
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000004"} 1]
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000005"} 2]]))
  (testing "should not be equal"
    (are [x y] (not (lib.equality/= x y))
      ;; field IDs differ
      [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
      [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 2]

      ;; should not be equal because :base-types differ
      [:=
       {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000001", :base-type :type/Integer} 1]
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000002"} 2]]
      [:=
       {:lib/uuid "00000000-0000-0000-0000-000000000003"}
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000004", :base-type :type/Text} 1]
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000005"} 2]])))

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

(deftest ^:parallel ignore-temporal-unit-test
  (let [query    (lib/query meta/metadata-provider (meta/table-metadata :orders))
        column   (meta/field-metadata :orders :created-at)
        needle   (-> column
                     (lib/with-temporal-bucket :month)
                     lib/ref)
        haystack (lib.metadata.calculation/returned-columns query)]
    (testing "Should find a matching column ignoring :temporal-unit if needed (#32920)"
      (is (=? column
              (lib.equality/find-matching-column needle haystack))))
    (testing "Should find a matching ref ignoring :temporal-unit if needed (#32920)"
      (is (=? [:field
               {:lib/uuid       string?
                :base-type      :type/DateTimeWithLocalTZ
                :effective-type :type/DateTimeWithLocalTZ}
               (meta/id :orders :created-at)]
              (lib.equality/find-matching-ref column (map lib/ref haystack)))))))

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
                   (lib.equality/mark-selected-columns cols selected))
             (mapv #(select-keys % [:name :selected?])
                   (lib.equality/mark-selected-columns query -1 cols selected)))))))

(deftest ^:parallel find-matching-column-by-id-test
  (testing "find-matching-column should find columns based on matching ID (#31482) (#33453)"
    (let [query (lib.tu/query-with-join)
          cols  (lib/returned-columns query)
          refs  (map lib.ref/ref cols)
          a-ref [:field {:lib/uuid (str (random-uuid))
                         :base-type :type/Text
                         :join-alias "Cat"}
                 (meta/id :categories :name)]]
      (is (=? [[:field {} (meta/id :venues :id)]
               [:field {} (meta/id :venues :name)]
               [:field {} (meta/id :venues :category-id)]
               [:field {} (meta/id :venues :latitude)]
               [:field {} (meta/id :venues :longitude)]
               [:field {} (meta/id :venues :price)]
               [:field {} (meta/id :categories :id)]
               [:field {} (meta/id :categories :name)]]
              refs))
      (is (= (nth cols 7)
             (lib.equality/find-matching-column a-ref cols)
             (lib.equality/find-matching-column query -1 a-ref cols))))))

(deftest ^:parallel find-matching-column-from-column-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/breakout (meta/field-metadata :venues :id)))
        filterable-cols (lib/filterable-columns query)
        matched-from-col (lib.equality/find-matching-column query -1 (m/find-first :breakout-positions (lib/breakoutable-columns query)) filterable-cols)
        matched-from-ref (lib.equality/find-matching-column query -1 (first (lib/breakouts query)) filterable-cols)]
    (is (=?
         {:id (meta/id :venues :id)}
         matched-from-ref))
    (is (=?
         {:id (meta/id :venues :id)}
         matched-from-col))
    (is (= matched-from-ref
           matched-from-col))))

(deftest ^:parallel find-matching-column-by-name-test
  (testing "find-matching-column should find columns based on matching name"
    (let [query (lib/append-stage (lib.tu/query-with-join))
          cols  (lib/returned-columns query)
          refs  (map lib.ref/ref cols)]
      (is (=? [[:field {} "ID"]          ; 0
               [:field {} "NAME"]        ; 1
               [:field {} "CATEGORY_ID"] ; 2
               [:field {} "LATITUDE"]    ; 3
               [:field {} "LONGITUDE"]   ; 4
               [:field {} "PRICE"]       ; 5
               [:field {} "Cat__ID"]     ; 6
               [:field {} "Cat__NAME"]]  ; 7
              refs))
      (testing (str "\n" (with-out-str
                           (pprint/print-table
                            [:name :lib/original-join-alias :lib/original-name :lib/deduplicated-name :lib/source-column-alias :lib/desired-column-alias]
                            cols)))
        (are [a-ref expected-index] (= (nth cols expected-index)
                                       (lib.equality/find-matching-column a-ref cols)
                                       (lib.equality/find-matching-column query -1 a-ref cols))
          ;; Good ref.
          [:field {:lib/uuid (str (random-uuid)), :base-type :type/Text}
           "Cat__NAME"]
          7

          ;; INCORRECT REF. We shouldn't be using the join alias here since the join happened in a previous stage, and
          ;; we should definitely not be using it in combination with the desired column alias.
          [:field {:lib/uuid (str (random-uuid)), :base-type :type/Text, :join-alias "Cat"}
           "Cat__NAME"]
          7

          ;; INCORRECT REF. This would be a correct ref in the stage the join happened.
          [:field {:lib/uuid (str (random-uuid)), :base-type :type/Text, :join-alias "Cat"}
           "NAME"]
          7

          ;; Acceptable ref -- this is the historic ref that would have been returned by QP metadata results.
          [:field {:lib/uuid (str (random-uuid)), :base-type :type/Text} "NAME_2"]
          7

          ;; Good ref
          [:field {:lib/uuid (str (random-uuid)), :base-type :type/Text} "NAME"]
          1)))))

(deftest ^:parallel find-matching-column-self-join-test
  (testing "find-matching-column with a self join"
    (let [query     (lib.tu/query-with-self-join)
          cols      (for [col (meta/fields :orders)]
                      (meta/field-metadata :orders col))
          table-col #(assoc % :lib/source :source/table-defaults)
          join-col  #(-> %
                         (merge {:lib/source                   :source/joins
                                 :metabase.lib.join/join-alias "Orders"
                                 :lib/desired-column-alias     (str "Orders__" (:name %))}))
          sorted    #(sort-by (juxt :position :source-alias) %)
          visible   (lib/visible-columns query)]
      (is (=? (->> (sorted (concat (map table-col cols)
                                   (map join-col  cols)))
                   (map #(dissoc % :name)))
              (sorted (lib/returned-columns query))))
      (testing "matches the defaults by ID"
        (doseq [col-key (meta/fields :orders)]
          (is (=? (table-col (meta/field-metadata :orders col-key))
                  (-> (meta/field-metadata :orders col-key)
                      table-col
                      lib/ref
                      (lib.equality/find-matching-column visible))))))
      (testing "matches the joined columns by ID"
        (doseq [col-key (meta/fields :orders)]
          (is (=? (join-col (meta/field-metadata :orders col-key))
                  (-> (meta/field-metadata :orders col-key)
                      join-col
                      lib/ref
                      (lib.equality/find-matching-column visible))))))
      (testing "the matches of default and joins are distinct"
        (let [matches (for [col-key (meta/fields :orders)
                            col-fn  [table-col join-col]]
                        (-> (meta/field-metadata :orders col-key)
                            col-fn
                            lib/ref
                            (lib.equality/find-matching-column visible)))]
          (is (every? some? matches))
          (is (= (count matches)
                 (count (set matches)))))))))

(deftest ^:parallel find-matching-column-self-join-with-fields-test
  (testing "find-matching-column works with a tricky case taken from an e2e test"
    (let [base   (-> (lib.tu/query-with-self-join)
                     (lib/with-fields [(meta/field-metadata :orders :id)
                                       (meta/field-metadata :orders :tax)]))
          [join] (lib/joins base)
          all-4  (lib/replace-join base join (lib/with-join-fields join [(meta/field-metadata :orders :id)
                                                                         (meta/field-metadata :orders :tax)]))
          just-3 (lib/replace-join base join (lib/with-join-fields join [(meta/field-metadata :orders :id)]))]
      (is (=? [{:lib/desired-column-alias "ID"}
               {:lib/desired-column-alias "TAX"}
               {:lib/desired-column-alias "Orders__ID"}
               {:lib/desired-column-alias "Orders__TAX"}]
              (lib/returned-columns all-4)))
      (is (=? [{:lib/desired-column-alias "ID"}
               {:lib/desired-column-alias "TAX"}
               {:lib/desired-column-alias "Orders__ID"}]
              (lib/returned-columns just-3)))
      (testing "matching the four fields against"
        (let [hr-own-id   {:lib/type :metadata/column
                           :description        "Own ID"
                           :base-type          :type/BigInteger
                           :semantic-type      :type/PK
                           :effective-type     :type/BigInteger
                           :table-id           (meta/id :orders)
                           :id                 (meta/id :orders :id)
                           :name               "ID"
                           :lib/source         :source/table-defaults
                           :fk-target-field-id nil
                           :parent-id          nil
                           :display-name       "ID"
                           :position           0}
              hr-own-tax  {:lib/type :metadata/column
                           :description        "Own Tax"
                           :base-type          :type/Float
                           :semantic-type      nil
                           :effective-type     :type/Float
                           :table-id           (meta/id :orders)
                           :id                 (meta/id :orders :tax)
                           :name               "TAX"
                           :lib/source         :source/table-defaults
                           :fk-target-field-id nil
                           :parent-id          nil
                           :display-name       "Tax"
                           :position           4}
              hr-join-id  {:lib/type :metadata/column
                           :description        "Join ID"
                           :base-type          :type/BigInteger
                           :semantic-type      :type/PK
                           :effective-type     :type/BigInteger
                           :table-id           (meta/id :orders)
                           :id                 (meta/id :orders :id)
                           :name               "ID_2"
                           :source-alias       "Orders"
                           :lib/source         :source/joins
                           :fk-target-field-id nil
                           :parent-id          nil
                           :display-name       "Orders → ID"
                           :position           0}
              hr-join-tax {:lib/type :metadata/column
                           :description        "Join Tax"
                           :base-type          :type/Float
                           :semantic-type      nil
                           :effective-type     :type/Float
                           :table-id           (meta/id :orders)
                           :id                 (meta/id :orders :tax)
                           :name               "TAX_2"
                           :source-alias       "Orders"
                           :lib/source         :source/joins
                           :fk-target-field-id nil
                           :parent-id          nil
                           :display-name       "Orders → Tax"
                           :position           4}
              ret-4 [hr-own-id hr-own-tax hr-join-id hr-join-tax]
              ret-3 [hr-own-id hr-own-tax hr-join-id]
              refs  (for [join-alias       [nil "Orders"]
                          [column coltype] [[:id :type/Integer] [:tax :type/Float]]]
                      [:field (merge {:lib/uuid       (str (random-uuid))
                                      :base-type      coltype
                                      :effective-type coltype}
                                     (when join-alias
                                       {:join-alias join-alias}))
                       (meta/id :orders column)])
              exp-4 [{:display-name "ID"}
                     {:display-name "Tax"}
                     {:display-name "Orders → ID"}
                     {:display-name "Orders → Tax"}]
              exp-3 (update exp-4 3 (constantly nil))]
          (testing "all-4 matches everything"
            (is (=? exp-4
                    (->> refs
                         (map #(lib.equality/find-matching-column % ret-4)))))
            (is (=? exp-4
                    (->> refs
                         (map #(lib.equality/find-matching-column all-4 -1 % ret-4)))))
            (is (=? [0 1 2 3]
                    #_{:clj-kondo/ignore [:discouraged-var]}
                    (lib.equality/find-column-indexes-for-refs all-4 -1 refs ret-4))))
          (testing "just-3 does not match the joined TAX"
            (is (=? exp-3
                    (->> refs
                         (map #(lib.equality/find-matching-column % ret-3)))))
            (is (=? exp-3
                    (->> refs
                         (map #(lib.equality/find-matching-column just-3 -1 % ret-3)))))
            (is (=? [0 1 2 -1]
                    #_{:clj-kondo/ignore [:discouraged-var]}
                    (lib.equality/find-column-indexes-for-refs just-3 -1 refs ret-3)))))))))

(deftest ^:parallel find-matching-column-aggregation-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/aggregate (lib/count)))
        [ag]  (lib/aggregations query)]
    (testing "without passing query"
      (testing "matches with UUID"
        (is (=? {:display-name "Count", :lib/source :source/aggregations}
                (lib.equality/find-matching-column
                 [:aggregation {:lib/uuid (str (random-uuid))} (lib.options/uuid ag)]
                 (lib/returned-columns query)))))
      (testing "fails with bad UUID but good source-name"
        (is (nil? (lib.equality/find-matching-column
                   [:aggregation {:lib/uuid        (str (random-uuid))
                                  :lib/source-name "count"}
                    "this is a bad UUID"]
                   (lib/returned-columns query))))))
    (testing "when passing query"
      (testing "matches with UUID"
        (is (=? {:display-name "Count", :lib/source :source/aggregations}
                (lib.equality/find-matching-column
                 query -1
                 [:aggregation {:lib/uuid (str (random-uuid))} (lib.options/uuid ag)]
                 (lib/returned-columns query)))))
      (testing "matches with bad UUID but good source-name"
        (is (=? {:display-name "Count", :lib/source :source/aggregations}
                (lib.equality/find-matching-column
                 query -1
                 [:aggregation {:lib/uuid        (str (random-uuid))
                                :lib/source-name "count"}
                  "this is a bad UUID"]
                 (lib/returned-columns query))))))))

(deftest ^:parallel find-matching-column-expression-test
  (is (=? {:name "expr", :lib/source :source/expressions}
          (lib.equality/find-matching-column
           [:expression {:lib/uuid (str (random-uuid))} "expr"]
           (lib/visible-columns (lib.tu/query-with-expression))))))

(deftest ^:parallel find-column-for-legacy-ref-field-test
  (let [query (lib.tu/venues-query)]
    (are [legacy-ref] (=? {:name "NAME", :id (meta/id :venues :name)}
                          (lib/find-column-for-legacy-ref query legacy-ref (lib/visible-columns query)))
      [:field (meta/id :venues :name) nil]
      [:field (meta/id :venues :name) {}]
      ;; should work with refs that need normalization
      ["field" (meta/id :venues :name) nil]
      ["field" (meta/id :venues :name)]
      #?@(:cljs
          [#js ["field" (meta/id :venues :name) nil]
           #js ["field" (meta/id :venues :name) #js {}]]))))

(deftest ^:parallel find-column-for-legacy-ref-match-by-name-test
  (testing "Make sure fallback matching by name works correctly"
    (is (=? {:name "NAME"}
            (lib/find-column-for-legacy-ref
             (lib.tu/venues-query)
             [:field (meta/id :venues :name) nil]
             [(dissoc (meta/field-metadata :venues :name) :id :table-id)])))))

(deftest ^:parallel find-column-for-legacy-ref-expression-test
  (let [query (lib.tu/query-with-expression)]
    (are [legacy-ref] (=? {:name "expr", :lib/source :source/expressions}
                          (lib/find-column-for-legacy-ref query legacy-ref (lib/visible-columns query)))
      [:expression "expr"]
      ["expression" "expr"]
      ["expression" "expr" nil]
      ["expression" "expr" {}]
      #?@(:cljs
          [#js ["expression" "expr"]
           #js ["expression" "expr" #js {}]]))))

(deftest ^:parallel find-column-for-legacy-ref-aggregation-test
  (let [query (-> (lib.tu/venues-query)
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

(deftest ^:parallel implicitly-joinable-columns-test
  (testing "implicit join columns in eg. a breakout should be matched"
    (let [base             (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                               (lib/aggregate (lib/count))
                               (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :year)))
          vis              (lib/visible-columns base)
          base-user-source (m/find-first #(= (:id %) (meta/id :people :source)) vis)
          base-category    (m/find-first #(= (:id %) (meta/id :products :category)) vis)
          query            (-> base
                               (lib/breakout base-user-source)
                               (lib/breakout base-category))
          returned         (map #(assoc %1 :source-alias %2)
                                (lib/returned-columns query)
                                [nil "PEOPLE__via__USER_ID" "PRODUCTS__via__PRODUCT_ID" nil])]
      (is (= :source/implicitly-joinable (:lib/source base-user-source)))
      (is (= :source/implicitly-joinable (:lib/source base-category)))
      (is (= 4 (count returned)))
      (is (= (map :name returned)
             (for [col returned]
               (:name (lib.equality/find-matching-column query -1 (lib/ref col) returned)))))))
  (testing "implicitly joinable columns via joins should be matched correctly"
    (let [query         (lib.tu/query-with-self-join)
          visible-cols  (lib/visible-columns query)]
      (doseq [col visible-cols]
        (is (= col (lib/find-matching-column (lib/ref col) visible-cols))))))
  (testing "implicitly joinable columns from the previous query stage are matched correctly"
    (let [query         (-> (lib.tu/query-with-self-join) lib/append-stage)
          visible-cols  (lib/visible-columns query)
          implicit-cols (filter #(= :source/implicitly-joinable (:lib/source %)) visible-cols)]
      (doseq [col implicit-cols]
        (is (= col (lib.equality/find-matching-column (lib.ref/ref col) implicit-cols)))))))

(deftest ^:parallel field-refs-to-custom-expressions-test
  (testing "custom columns that wrap a Field must not have `:id` (#44940)"
    (let [query      (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         (lib/expression "CA" (meta/field-metadata :orders :created-at)))
          columns    (lib/visible-columns query)
          created-at (m/find-first #(= (:name %) "CREATED_AT") columns)
          ca-expr    (m/find-first #(= (:name %) "CA") columns)]
      (testing "different columns"
        (is (int? (:id created-at)))
        (is (nil? (:id ca-expr))))

      (testing "both refs should match correctly"
        (is (= created-at
               (lib.equality/find-matching-column (lib/ref created-at) columns)))
        (is (= ca-expr
               (lib.equality/find-matching-column (lib/ref ca-expr)    columns)))))))

(deftest ^:parallel disambiguate-matches-using-temporal-unit-if-needed-test
  (let [created-at-month (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month)
        created-at-year  (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :year)]
    (doseq [col [created-at-month
                 created-at-year]]
      (is (= col
             (lib.equality/find-matching-column
              (lib/ref col)
              [created-at-month
               created-at-year]))))))

(deftest ^:parallel disambiguate-matches-using-binning-if-needed-test
  (testing "'bin-width' binning strategy"
    (let [latitude-10 (lib/with-binning (meta/field-metadata :people :latitude) {:strategy :bin-width, :bin-width 10})
          latitude-20 (lib/with-binning (meta/field-metadata :people :latitude) {:strategy :bin-width, :bin-width 20})]
      (doseq [col [latitude-10
                   latitude-20]]
        (is (= col
               (lib.equality/find-matching-column
                (lib/ref col)
                [latitude-10
                 latitude-20]))))))
  (testing "'num-bins' binning strategy"
    (let [total-10 (lib/with-binning (meta/field-metadata :orders :total) {:strategy :num-bins, :num-bins 10})
          total-20 (lib/with-binning (meta/field-metadata :orders :total) {:strategy :num-bins, :num-bins 20})]
      (doseq [col [total-10
                   total-20]]
        (is (= col
               (lib.equality/find-matching-column
                (lib/ref col)
                [total-10
                 total-20])))))))

(deftest ^:parallel find-matching-column-by-id-with-expression-aliasing-joined-column-test
  (testing "find-matching-column should be able to find columns based on ID even when a joined column is aliased as an expression (#44940)"
    (let [a-ref [:field {:lib/uuid   (str (random-uuid))
                         :base-type  :type/Text
                         :join-alias "Cat"}
                 (meta/id :categories :name)]
          query (-> (lib.tu/query-with-join)
                    (lib/expression "Joined Name" a-ref))
          cols  (lib/returned-columns query)]
      (is (=? {:name                     "NAME_2"
               :lib/desired-column-alias "Cat__NAME"
               :id                       (meta/id :categories :name)}
              (lib.equality/find-matching-column query -1 a-ref cols))))))

(deftest ^:parallel find-matching-ref-multiple-breakouts-test
  (testing "should be able to distinguish between multiple breakouts of the same column in the previous stage"
    (let [query       (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/aggregate (lib/count))
                          (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :year))
                          (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :orders :created-at) :month))
                          (lib/append-stage))
          columns     (lib/fieldable-columns query)
          column-refs (mapv lib.ref/ref columns)]
      (is (=? [:field {} "CREATED_AT"]
              (lib.equality/find-matching-ref (first columns) column-refs)))
      (is (=? [:field {} "CREATED_AT_2"]
              (lib.equality/find-matching-ref (second columns) column-refs))))))

(deftest ^:parallel find-matching-column-multiple-implicit-joins-test
  (testing "when there are multiple implicit joins for the same column, matches correctly"
    (let [base      (lib/query meta/metadata-provider (meta/table-metadata :ic/reports))
          columns   (lib.metadata.calculation/visible-columns base)
          by-id     (group-by :id columns)
          name-cols (by-id (meta/id :ic/accounts :name))]
      (is (= 2 (count name-cols)))
      (doseq [col name-cols
              :let [query (lib/filter base (lib/= col "foo"))
                    cols  (lib.metadata.calculation/visible-columns query)
                    [_op _opts filter-col] (first (lib/filters query))]]
        (is (=? col (lib.equality/find-matching-column query -1 filter-col cols)))))))

(deftest ^:parallel desired-alias-field-ref-selected-test
  (testing "We should match field refs using desired-column-alias names correctly"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id            1
                           :dataset-query {:database (meta/id)
                                           :type     :query
                                           :query    {:source-table (meta/id :orders)
                                                      :joins        [{:source-table (meta/id :products)
                                                                      :alias        "Products"
                                                                      :condition    [:=
                                                                                     [:field (meta/id :orders :product-id) nil]
                                                                                     [:field (meta/id :products :id) {:join-alias "Products"}]]
                                                                      :fields       :all}]}}}
                          {:id            2
                           :dataset-query {:database (meta/id)
                                           :type     :query
                                           :query    {:source-table "card__1"}}}]})
          query (-> (lib/query mp (lib.metadata/card mp 2))
                    lib/append-stage
                    (lib/with-fields [[:field
                                       {:base-type :type/BigInteger, :lib/uuid "00000000-0000-0000-0000-000000000000"}
                                       "ID"]
                                      [:field
                                       {:base-type :type/BigInteger, :lib/uuid "00000000-0000-0000-0000-000000000001"}
                                       "Products__ID"]]))
          cols  (lib/visible-columns query)]
      (is (=? {:name "ID_2", :lib/desired-column-alias "Products__ID"}
              (lib.equality/find-matching-column
               [:field
                {:base-type :type/BigInteger, :lib/uuid "00000000-0000-0000-0000-000000000002"}
                "Products__ID"]
               cols))))))

(deftest ^:parallel find-match-with-inherited-temporal-unit-test
  (let [field-ref [:field {:lib/uuid                "86e6d41c-d693-4f08-ae30-7ad411da8ec7"
                           :effective-type          :type/DateTime
                           :base-type               :type/DateTime
                           :inherited-temporal-unit :month} 39]
        cols      [{:base-type                 :type/DateTime
                    :created-at                "2025-06-24T20:58:39.593446-07:00"
                    :description               "The date and time an order was submitted."
                    :display-name              "Created At: Year"
                    :effective-type            :type/DateTime
                    :id                        39
                    :inherited-temporal-unit   :year
                    :last-analyzed             "2025-06-24T20:58:41.088313-07:00"
                    :lib/deduplicated-name     "CREATED_AT"
                    :lib/desired-column-alias  "CREATED_AT"
                    :lib/hack-original-name    "CREATED_AT"
                    :lib/original-display-name "Created At"
                    :lib/original-name         "CREATED_AT"
                    :lib/original-ref          [:field {:base-type :type/DateTime, :temporal-unit :year, :lib/uuid "aa4324c7-12d2-46fe-ba8d-8f1fe54b61af", :effective-type :type/DateTime} 39]
                    :lib/source                :source/previous-stage
                    :lib/source-column-alias   "CREATED_AT"
                    :lib/source-uuid           "aa4324c7-12d2-46fe-ba8d-8f1fe54b61af"
                    :lib/type                  :metadata/column
                    :name                      "CREATED_AT"
                    :semantic-type             :type/CreationTimestamp
                    :table-id                  5
                    :updated-at                "2025-06-24T20:58:41.088313-07:00"}
                   {:base-type                 :type/DateTime
                    :created-at                "2025-06-24T20:58:39.593446-07:00"
                    :description               "The date and time an order was submitted."
                    :display-name              "Created At: Month"
                    :effective-type            :type/DateTime
                    :id                        39
                    :inherited-temporal-unit   :month
                    :last-analyzed             "2025-06-24T20:58:41.088313-07:00"
                    :lib/deduplicated-name     "CREATED_AT_2"
                    :lib/desired-column-alias  "CREATED_AT_2"
                    :lib/hack-original-name    "CREATED_AT"
                    :lib/original-display-name "Created At"
                    :lib/original-name         "CREATED_AT"
                    :lib/original-ref          [:field {:base-type :type/DateTime, :temporal-unit :month, :lib/uuid "1f16a57a-2afd-4c92-8d6c-b41062235a49", :effective-type :type/DateTime} 39]
                    :lib/source                :source/previous-stage
                    :lib/source-column-alias   "CREATED_AT_2"
                    :lib/source-uuid           "1f16a57a-2afd-4c92-8d6c-b41062235a49"
                    :lib/type                  :metadata/column
                    :name                      "CREATED_AT"
                    :semantic-type             :type/CreationTimestamp
                    :table-id                  5
                    :updated-at                "2025-06-24T20:58:41.088313-07:00"}]]
    (is (=? {:display-name "Created At: Month"}
            (lib.equality/find-matching-column field-ref cols)))))

(deftest ^:parallel mark-selected-columns-works-for-js-use-cases-test
  (testing "Does mark-selected-columns actually work for the uses cases in [[metabase.lib.js/visible-columns*]] now?"
    (let [query {:lib/type     :mbql/query
                 :lib/metadata meta/metadata-provider
                 :database     (meta/id)
                 :stages       [{:lib/type     :mbql.stage/mbql
                                 :source-table (meta/id :orders)
                                 :aggregation  [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]
                                 :breakout     [[:field {:base-type      :type/DateTime
                                                         :temporal-unit  :year
                                                         :lib/uuid       "00000000-0000-0000-0000-000000000001"
                                                         :effective-type :type/DateTime}
                                                 (meta/id :orders :created-at)]
                                                [:field {:base-type      :type/DateTime
                                                         :temporal-unit  :month
                                                         :lib/uuid       "00000000-0000-0000-0000-000000000002"
                                                         :effective-type :type/DateTime}
                                                 (meta/id :orders :created-at)]]}
                                {:lib/type :mbql.stage/mbql
                                 :fields   [[:field
                                             {:base-type               :type/DateTime
                                              :inherited-temporal-unit :month
                                              :lib/uuid                "00000000-0000-0000-0000-000000000003"}
                                             "CREATED_AT_2"]
                                            [:field {:base-type :type/Integer, :lib/uuid "00000000-0000-0000-0000-000000000004"}
                                             "count"]]
                                 :filters  [[:> {:lib/uuid "00000000-0000-0000-0000-000000000005"}
                                             [:field {:base-type :type/Integer, :lib/uuid "00000000-0000-0000-0000-000000000007"}
                                              "count"] 0]]}]}]
      (is (=? [{:display-name "Created At: Month"}
               {:display-name "Count"}]
              (lib/returned-columns query)))
      (is (=? [{:display-name "Created At: Year"}
               {:display-name "Created At: Month"}
               {:display-name "Count"}]
              (lib/visible-columns query)))
      (testing `lib.equality/mark-selected-columns
        (testing "2-arity"
          (is (=? [{:display-name "Created At: Year"}
                   {:display-name "Created At: Month"}
                   {:display-name "Count"}]
                  (lib.equality/mark-selected-columns
                   (lib/visible-columns query)
                   (lib/returned-columns query)))))
        (testing "4-arity"
          (is (=? [{:display-name "Created At: Year"}
                   {:display-name "Created At: Month"}
                   {:display-name "Count"}]
                  (lib.equality/mark-selected-columns
                   query
                   -1
                   (lib/visible-columns query)
                   (lib/returned-columns query)))))))))

(deftest ^:parallel mark-selected-columns-works-for-js-use-cases-test-2
  (testing "Does mark-selected-columns actually work for the uses cases in [[metabase.lib.js/visible-columns*]] now?"
    (let [query {:lib/type     :mbql/query
                 :lib/metadata meta/metadata-provider
                 :database     (meta/id)
                 :stages       [{:lib/type     :mbql.stage/mbql
                                 :source-table (meta/id :orders)
                                 :aggregation  [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]
                                 :breakout     [[:field {:base-type      :type/Float
                                                         :binning        {:strategy :num-bins, :num-bins 10}
                                                         :lib/uuid       "00000000-0000-0000-0000-000000000001"
                                                         :effective-type :type/Float}
                                                 (meta/id :orders :total)]
                                                [:field {:base-type      :type/Float
                                                         :binning        {:strategy :num-bins, :num-bins 50}
                                                         :lib/uuid       "00000000-0000-0000-0000-000000000002"
                                                         :effective-type :type/Float}
                                                 (meta/id :orders :total)]]}
                                {:lib/type :mbql.stage/mbql
                                 :fields   [[:field
                                             {:base-type :type/Float
                                              :lib/uuid  "00000000-0000-0000-0000-000000000003"}
                                             "TOTAL_2"]
                                            [:field {:base-type :type/Integer, :lib/uuid "00000000-0000-0000-0000-000000000004"}
                                             "count"]]
                                 :filters  [[:> {:lib/uuid "00000000-0000-0000-0000-000000000005"}
                                             [:field {:base-type :type/Integer, :lib/uuid "00000000-0000-0000-0000-000000000007"}
                                              "count"] 0]]}]}]
      (is (=? [{:display-name "Total: 50 bins"}
               {:display-name "Count"}]
              (lib/returned-columns query)))
      (is (=? [{:display-name "Total: 10 bins"}
               {:display-name "Total: 50 bins"}
               {:display-name "Count"}]
              (lib/visible-columns query)))
      (testing `lib.equality/mark-selected-columns
        (testing "2-arity"
          (is (=? [{:display-name "Total: 10 bins"}
                   {:display-name "Total: 50 bins"}
                   {:display-name "Count"}]
                  (lib.equality/mark-selected-columns
                   (lib/visible-columns query)
                   (lib/returned-columns query)))))
        (testing "4-arity"
          (is (=? [{:display-name "Total: 10 bins"}
                   {:display-name "Total: 50 bins"}
                   {:display-name "Count"}]
                  (lib.equality/mark-selected-columns
                   query
                   -1
                   (lib/visible-columns query)
                   (lib/returned-columns query)))))))))

(deftest ^:parallel find-matching-ref-join-test
  (testing "Support same-stage matching for columns and refs from a join"
    (let [col  {:base-type                    :type/Text
                :display-name                 "Title"
                :effective-type               :type/Text
                :lib/deduplicated-name        "TITLE"
                :lib/desired-column-alias     "question b - Product__TITLE"
                :lib/original-name            "TITLE"
                :lib/source                   :source/joins
                :lib/source-column-alias      "TITLE"
                :lib/type                     :metadata/column
                :metabase.lib.join/join-alias "question b - Product"
                :name                         "TITLE"}
          refs [[:field
                 {:lib/uuid       "435541d8-8c9e-4a95-ac12-0e4c246ca797"
                  :effective-type :type/BigInteger
                  :base-type      :type/BigInteger
                  :join-alias     "question b - Product"}
                 "ID"]
                [:field
                 {:lib/uuid       "e4503910-efdf-49b9-b49b-d0590bb54435"
                  :effective-type :type/Text
                  :base-type      :type/Text
                  :join-alias     "question b - Product"}
                 "EAN"]
                [:field
                 {:lib/uuid       "ad7a6309-c8b8-4213-bcab-ab9c8e40517b"
                  :effective-type :type/Text
                  :base-type      :type/Text
                  :join-alias     "question b - Product"}
                 "TITLE"]]]
      (is (= [:field
              {:lib/uuid       "ad7a6309-c8b8-4213-bcab-ab9c8e40517b"
               :effective-type :type/Text
               :base-type      :type/Text
               :join-alias     "question b - Product"}
              "TITLE"]
             (lib.equality/find-matching-ref col refs {:match-type ::lib.equality/match-type.same-stage}))))))

(deftest ^:parallel same-stage-matching-do-not-barf-when-trying-to-find-a-match-for-an-expression-ref-test
  (let [[col] (lib/returned-columns (lib/query meta/metadata-provider (meta/table-metadata :venues)))]
    ;; just make sure this doesn't barf.
    (is (nil? (lib.equality/find-matching-ref
               col
               [[:expression {:lib/uuid (str (random-uuid)), :base-type :type/Integer} "bad_expression"]]
               {:match-type ::lib.equality/match-type.same-stage})))))

(deftest ^:parallel pick-correct-column-when-one-is-from-join-and-on-is-not-test
  (testing "If we have two cols and one has a join alias and one doesn't, and our ref has no alias, then pick the col with no alias"
    (let [cols  [{:base-type                :type/DateTime
                  :display-name             "Created At"
                  :effective-type           :type/DateTime
                  :id                       66
                  :lib/card-id              5
                  :lib/desired-column-alias "CREATED_AT"
                  :lib/model-display-name   "Created At"
                  :lib/original-name        "CREATED_AT"
                  :lib/source               :source/card
                  :lib/source-column-alias  "CREATED_AT"
                  :lib/type                 :metadata/column
                  :name                     "CREATED_AT"
                  :name-field               nil}
                 {:base-type                :type/DateTime
                  :display-name             "Products → Created At"
                  :effective-type           :type/DateTime
                  :id                       66
                  :lib/card-id              5
                  :lib/desired-column-alias "CREATED_AT_2"
                  :lib/model-display-name   "Products → Created At"
                  :lib/original-join-alias  "Products"
                  :lib/original-name        "CREATED_AT_2"
                  :lib/source               :source/card
                  :lib/source-column-alias  "CREATED_AT_2"
                  :lib/type                 :metadata/column
                  :name                     "CREATED_AT_2"
                  :name-field               nil}]
          a-ref [:field {:lib/uuid                                          "28d2f111-3882-4ffb-a650-0650bc7d7c3b"
                         :effective-type                                    :type/DateTime
                         :base-type                                         :type/DateTime
                         :metabase.lib.query/transformation-added-base-type true}
                 66]]
      (is (=? {:id 66, :display-name "Created At"}
              (lib.equality/find-matching-column a-ref cols))))))

(deftest ^:parallel match-by-source-uuid-test
  (let [col  {:base-type                    :type/BigInteger
              :display-name                 "ID"
              :effective-type               :type/BigInteger
              :id                           55600
              :lib/deduplicated-name        "ID_2"
              :lib/desired-column-alias     "Orders__ID"
              :lib/original-join-alias      "Orders"
              :lib/original-name            "ID"
              :lib/source                   :source/joins
              :lib/source-column-alias      "ID"
              :lib/source-uuid              "1c2a0643-f25c-4099-a2d5-7c7e790b632f"
              :lib/type                     :metadata/column
              :metabase.lib.join/join-alias "Orders"
              :name                         "ID_2"
              :semantic-type                :type/PK
              :source-alias                 "Orders"
              :table-id                     55060}
        refs [[:field
               {:lib/uuid       "1c2a0643-f25c-4099-a2d5-7c7e790b632f"
                :effective-type :type/BigInteger
                :base-type      :type/BigInteger
                :join-alias     "Orders"}
               55600]
              [:field
               {:lib/uuid       "6a535ba3-2efd-49cd-9d43-809ddfc3f111"
                :effective-type :type/Float
                :base-type      :type/Float
                :join-alias     "Orders"}
               55603]]]
    (is (= (first refs)
           (lib.equality/find-matching-ref col refs {:match-type ::lib.equality/match-type.same-stage})))))

(deftest ^:parallel match-by-source-field-test
  (let [col  {:base-type                :type/BigInteger
              :display-name             "ID"
              :effective-type           :type/BigInteger
              :fk-field-id              35
              :fk-field-name            "USER_ID"
              :fk-target-field-id       nil
              :has-field-values         :none
              :id                       24
              :lib/deduplicated-name    "ID"
              :lib/desired-column-alias "PEOPLE__via__USER_ID__ID"
              :lib/original-name        "ID"
              :lib/source               :source/implicitly-joinable
              :lib/source-column-alias  "ID"
              :lib/type                 :metadata/column
              :name                     "ID"}
        refs [[:field {:base-type :type/BigInteger, :lib/uuid "b10907ef-d71b-4ddc-b3b9-ff0fda706b6d"} "ID"]
              [:field {:base-type :type/BigInteger, :source-field 35, :source-field-name "USER_ID", :lib/uuid "1cb6708d-754d-48b9-b44f-660a7c91561d", :effective-type :type/BigInteger} 24]]]
    (is (= (second refs)
           (lib.equality/find-matching-ref col refs {:match-type ::lib.equality/match-type.same-stage})))))
