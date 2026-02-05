(ns metabase.lib.util-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util :as lib.util]))

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel pipeline-test
  (are [query expected] (=? expected
                            (lib.util/pipeline query))
    ;; MBQL query
    {:database 1
     :type     :query
     :query    {:source-query {:source-query {:source-table 2}}
                :filter       [:=
                               {:lib/uuid "a1898aa6-4928-4e97-837d-e440ce21085e"}
                               [:field 3 {:lib/uuid "1cb2a996-6ba1-45fb-8101-63dc3105c311"}]
                               "wow"]}}
    {:database 1
     :stages   [{:lib/type     :mbql.stage/mbql
                 :source-table 2}
                {:lib/type :mbql.stage/mbql}
                {:lib/type :mbql.stage/mbql
                 :filters  [[:=
                             {:lib/uuid "a1898aa6-4928-4e97-837d-e440ce21085e"}
                             [:field 3 {:lib/uuid "1cb2a996-6ba1-45fb-8101-63dc3105c311"}]
                             "wow"]]}]}

    ;; native query
    {:database 1
     :type     :native
     :native   {:query "SELECT * FROM VENUES;"}}
    {:database 1
     :stages   [{:lib/type :mbql.stage/native
                 :native   "SELECT * FROM VENUES;"}]}

    ;; already a pipeline: nothing to do
    {:database 1
     :lib/type :mbql/query
     :stages   [{:lib/type    :mbql.stage/native
                 :lib/options {:lib/uuid "ef87e113-7436-41dd-9f78-3232c6778436"}
                 :native      "SELECT * FROM VENUES;"}]}
    {:database 1
     :lib/type :mbql/query
     :stages   [{:lib/type :mbql.stage/native
                 :native   "SELECT * FROM VENUES;"}]}))

(deftest ^:parallel pipeline-joins-test
  ;; this isn't meant to be 100% correct pMBQL -- `->pipeline` is just supposed to put stuff in the generally correct
  ;; shape, just to make sure we have `:stages` and stuff looking the way they should. [[metabase.lib.convert]] uses
  ;; this as part of what it does
  (is (=? {:lib/type :mbql/query
           :stages   [{:lib/type    :mbql.stage/mbql
                       :fields      [[:field (meta/id :categories :name) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                       :joins       [{:lib/type    :mbql/join
                                      :lib/options {:lib/uuid string?}
                                      :alias       "CATEGORIES__via__CATEGORY_ID"
                                      :conditions  [[:=
                                                     [:field (meta/id :venues :category-id)]
                                                     [:field (meta/id :categories :id) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]]
                                      :strategy    :left-join
                                      :fk-field-id (meta/id :venues :category-id)
                                      :stages      [{:lib/type     :mbql.stage/mbql
                                                     :source-table (meta/id :venues)}]}]}]
           :database (meta/id)}
          (lib.util/pipeline
           {:database (meta/id)
            :type     :query
            :query    {:fields [[:field (meta/id :categories :name) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                       :joins  [{:alias        "CATEGORIES__via__CATEGORY_ID"
                                 :source-table (meta/id :venues)
                                 :condition    [:=
                                                [:field (meta/id :venues :category-id)]
                                                [:field (meta/id :categories :id) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                                 :strategy     :left-join
                                 :fk-field-id  (meta/id :venues :category-id)}]}}))))

(deftest ^:parallel pipeline-joins-test-2
  (testing "Make sure we don't add unnecessary stages to joins when pipelining"
    (let [query {:database 33001
                 :type     :query
                 :query    {:aggregation  [[:count]]
                            :joins        [{:source-query {:source-table 33010
                                                           :parameters   [{:name "id", :type :category, :target [:field 33100 nil], :value 5}]}
                                            :alias        "c"
                                            :condition    [:= [:field 33402 nil] [:field 33100 {:join-alias "c"}]]
                                            :parameters   [{:type "category", :target [:field 33101 nil], :value "BBQ"}]}]
                            :source-table 33040}}]
      (is (=? {:stages [{:joins [{:stages [{}]}]}]}
              (lib.util/pipeline query))))))

(deftest ^:parallel pipeline-source-metadata-test
  (testing "`:source-metadata` should get moved to the previous stage as `:lib/stage-metadata`"
    (is (=? {:lib/type :mbql/query
             :stages   [{:lib/type           :mbql.stage/mbql
                         :source-table       (meta/id :venues)
                         :lib/stage-metadata {:lib/type :metadata/results
                                              :columns  [(meta/field-metadata :venues :id)]}}
                        {:lib/type :mbql.stage/mbql}]}
            (lib.util/pipeline
             {:database (meta/id)
              :type     :query
              :query    {:source-query    {:source-table (meta/id :venues)}
                         :source-metadata [(meta/field-metadata :venues :id)]}})))))

(deftest ^:parallel query-stage-test
  (is (=? {:lib/type     :mbql.stage/mbql
           :source-table 1}
          (lib.util/query-stage {:database 1
                                 :lib/type :mbql/query
                                 :stages   [{:lib/type     :mbql.stage/mbql
                                             :source-table 1}]}
                                0))))

(deftest ^:parallel query-stage-test-2
  (are [index expected] (=? expected
                            (lib.util/query-stage {:database 1
                                                   :lib/type :mbql/query
                                                   :stages   [{:lib/type     :mbql.stage/mbql
                                                               :source-table 1}
                                                              {:lib/type     :mbql.stage/mbql}]}
                                                  index))
    0 {:lib/type     :mbql.stage/mbql
       :source-table 1}
    1 {:lib/type :mbql.stage/mbql}))

(deftest ^:parallel query-stage-test-3
  (testing "negative index"
    (are [index expected] (=? expected
                              (lib.util/query-stage {:database 1
                                                     :lib/type :mbql/query
                                                     :stages   [{:lib/type     :mbql.stage/mbql
                                                                 :source-table 1}
                                                                {:lib/type     :mbql.stage/mbql}]}
                                                    index))
      -1 {:lib/type :mbql.stage/mbql}
      -2 {:lib/type     :mbql.stage/mbql
          :source-table 1})))

(deftest ^:parallel query-stage-test-4
  (testing "Out of bounds"
    (let [query {:database 1
                 :lib/type :mbql/query
                 :stages   [{:lib/type     :mbql.stage/mbql
                             :source-table 1}
                            {:lib/type     :mbql.stage/mbql}]}]
      (is (thrown-with-msg?
           #?(:clj Throwable :cljs js/Error)
           #"Stage 2 does not exist"
           (lib.util/query-stage query 2)))
      (is (thrown-with-msg?
           #?(:clj Throwable :cljs js/Error)
           #"Stage -3 does not exist"
           (lib.util/query-stage query -3))))))

(deftest ^:parallel update-query-stage-test
  (is (=? {:database 1
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table 1
                       :aggregation  [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]}]}
          (lib.util/update-query-stage {:database 1
                                        :type     :query
                                        :query    {:source-table 1}}
                                       0
                                       update
                                       :aggregation
                                       conj
                                       [:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}])))
  (are [stage expected] (=? expected
                            (lib.util/update-query-stage {:database 1
                                                          :type     :query
                                                          :query    {:source-query {:source-table 1}}}
                                                         stage
                                                         update
                                                         :aggregation
                                                         conj
                                                         [:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]))
    0 {:database 1
       :stages   [{:lib/type     :mbql.stage/mbql
                   :source-table 1
                   :aggregation  [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]}
                  {:lib/type :mbql.stage/mbql}]}
    1 {:database 1
       :stages   [{:lib/type     :mbql.stage/mbql
                   :source-table 1}
                  {:lib/type    :mbql.stage/mbql
                   :aggregation [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]}]}
    -1 {:database 1
        :stages   [{:lib/type     :mbql.stage/mbql
                    :source-table 1}
                   {:lib/type    :mbql.stage/mbql
                    :aggregation [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]}]})
  (testing "out of bounds"
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs js/Error)
         #"Stage 2 does not exist"
         (lib.util/update-query-stage {:database 1
                                       :type     :query
                                       :query    {:source-query {:source-table 1}}}
                                      2
                                      update
                                      :aggregation
                                      conj
                                      [:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}])))))

(deftest ^:parallel ensure-mbql-final-stage-test
  (is (=? {:database 1
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table 2}]}
          (lib.util/ensure-mbql-final-stage {:database 1
                                             :type     :query
                                             :query    {:source-table 2}})))
  (is (=? {:database 1
           :stages   [{:lib/type :mbql.stage/native
                       :native   "SELECT * FROM venues;"}
                      {:lib/type :mbql.stage/mbql}]}
          (lib.util/ensure-mbql-final-stage {:database 1
                                             :type     :native
                                             :native   {:query "SELECT * FROM venues;"}}))))

(deftest ^:parallel join-strings-with-conjunction-test
  (are [coll expected] (= expected
                          (lib.util/join-strings-with-conjunction "and" coll))
    []                nil
    ["a"]             "a"
    ["a" "b"]         "a and b"
    ["a" "b" "c"]     "a, b, and c"
    ["a" "b" "c" "d"] "a, b, c, and d"))

(deftest ^:parallel strip-id-test
  (are [exp in] (= exp (lib.util/strip-id in))
    "foo"            "foo"
    "Fancy Name"     "Fancy Name"
    "Customer"       "Customer ID"
    "Customer"       "Customer id"
    "some id number" "some id number"))

(deftest ^:parallel original-isa?
  (are [exp typ] (lib.util/original-isa? exp typ)
    (lib/ref (meta/field-metadata :products :id))
    :type/Number

    (lib/ref (meta/field-metadata :products :created-at))
    :type/Temporal

    (-> (meta/field-metadata :products :created-at)
        (lib/with-temporal-bucket :day-of-week)
        lib/ref)
    :type/Temporal

    (-> (meta/field-metadata :products :created-at)
        lib/ref
        (lib/with-temporal-bucket :day-of-week))
    :type/Temporal))

(deftest ^:parallel top-level-expression-clause-do-not-wrap-values-test
  (testing "named-expression-clause should not wrap a :value clause in another :value clause"
    (is (=? [:value {:semantic-type :type/Country, :base-type :type/Text, :lib/expression-name "Country"}
             "United States"]
            (lib.util/top-level-expression-clause
             [:value {:semantic-type :type/Country, :base-type :type/Text, :lib/uuid (str (random-uuid))}
              "United States"]
             "Country")))))

(deftest ^:parallel fresh-uuids-test
  (is (=? [:=
           {:lib/uuid (partial not= "8044c5a1-10ab-4122-8663-aa544074c082")}
           [:field {:lib/uuid (partial not= "36a2abff-e4ae-4752-b232-4885e08f52ea")} 5]
           "abc"]
          (lib.util/fresh-uuids
           [:=
            {:lib/uuid "8044c5a1-10ab-4122-8663-aa544074c082"}
            [:field {:lib/uuid "36a2abff-e4ae-4752-b232-4885e08f52ea"} 5]
            "abc"]))))

(def ^:private single-stage-query
  (lib.tu/venues-query))

(def ^:private two-stage-query
  (-> (lib/append-stage single-stage-query)
      (lib/filter (lib/= 1 (meta/field-metadata :venues :id)))))

(deftest ^:parallel first-stage?-test
  (testing "should return true for the first stage"
    (is (true? (lib.util/first-stage? single-stage-query 0)))
    (is (true? (lib.util/first-stage? two-stage-query 0))))
  (testing "should return false for the second stage"
    (is (false? (lib.util/first-stage? two-stage-query 1))))
  (testing "should throw for invalid index"
    (are [form] (thrown-with-msg?
                 #?(:clj Throwable :cljs js/Error)
                 #"Stage .* does not exist"
                 form)
      (lib.util/first-stage? single-stage-query 1)
      (lib.util/first-stage? single-stage-query -2)
      (lib.util/first-stage? two-stage-query 2)
      (lib.util/first-stage? two-stage-query -3))))

(deftest ^:parallel last-stage?-test
  (testing "should return true for the last stage"
    (is (true? (lib.util/last-stage? single-stage-query 0)))
    (is (true? (lib.util/last-stage? two-stage-query 1))))
  (testing "should return false for a non-last stage"
    (is (false? (lib.util/last-stage? two-stage-query 0))))
  (testing "should throw for invalid index"
    (are [form] (thrown-with-msg?
                 #?(:clj Throwable :cljs js/Error)
                 #"Stage .* does not exist"
                 form)
      (lib.util/last-stage? single-stage-query 1)
      (lib.util/last-stage? single-stage-query -2)
      (lib.util/last-stage? two-stage-query 2)
      (lib.util/last-stage? two-stage-query -3))))

(deftest ^:parallel drop-later-stages-test
  (is (= 1 (lib/stage-count (lib.util/drop-later-stages single-stage-query 0))))
  (is (= 1 (lib/stage-count (lib.util/drop-later-stages single-stage-query -1))))
  (is (= single-stage-query (lib.util/drop-later-stages single-stage-query 0)))
  (is (= 1 (lib/stage-count (lib.util/drop-later-stages two-stage-query 0))))
  (is (= 1 (lib/stage-count (lib.util/drop-later-stages two-stage-query -2))))
  (is (= 2 (lib/stage-count (lib.util/drop-later-stages two-stage-query 1))))
  (is (= 2 (lib/stage-count (lib.util/drop-later-stages two-stage-query -1))))
  (is (= two-stage-query (lib.util/drop-later-stages two-stage-query -1))))

(deftest ^:parallel do-not-add-extra-stages-to-join-test
  (is (=? {:stages [{:source-table 45060
                     :joins        [{:alias  "PRODUCTS__via__PRODUCT_ID"
                                     :stages [{:source-table 45050
                                               :fields       [[:field 45500 {:base-type :type/BigInteger}]
                                                              [:field 45507 {:base-type :type/Text}]]}]}]}]}
          (lib.util/pipeline '{:database 45001
                               :type     :query
                               :query    {:source-table 45060
                                          :joins        [{:strategy     :left-join
                                                          :alias        "PRODUCTS__via__PRODUCT_ID"
                                                          :fk-field-id  45607
                                                          :condition    [:=
                                                                         [:field 45607 nil]
                                                                         [:field 45500 {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]
                                                          :source-query {:source-table 45050
                                                                         :fields       [[:field 45500 {:base-type :type/BigInteger}]
                                                                                        [:field 45507 {:base-type :type/Text}]]}}]}}))))

(deftest ^:parallel pipeline-puts-join-metadata-in-the-correct-place-test
  (testing "Should be able to convert a query with metadata to MBQL 5 correctly (without normalization errors)"
    (let [query {:database 83001
                 :type     :query
                 :query    {:joins        [{:alias           "Q1"
                                            :fields          :all
                                            :condition       [:=
                                                              [:field "CC" {:base-type :type/Integer}]
                                                              [:field "CC" {:base-type :type/Integer, :join-alias "Q1"}]]
                                            :source-query    {:expressions     {"CC" [:+ 1 1]}
                                                              :source-query    {:source-table 83050
                                                                                :aggregation  [[:count]]
                                                                                :breakout     [[:field 83502 nil]]}
                                                              :source-metadata [{:name "CATEGORY"}
                                                                                {:name "count"}]}
                                            :source-metadata [{:name "CATEGORY"}
                                                              {:name "count"}
                                                              {:name "CC", :lib/expression-name "CC"}]}]
                            :source-query {:expressions  {"CC" [:+ 1 1]}
                                           :source-query {:source-table 83050
                                                          :aggregation  [[:count]]
                                                          :breakout     [[:field 83502 nil]]}}}}]
      (is (=? {:stages [{:source-table 83050
                         :aggregation  [[:count]]
                         :breakout     [[:field 83502 nil]]}
                        {:expressions {"CC" [:+ 1 1]}}
                        {:joins [{:alias           "Q1"
                                  :fields          :all
                                  :source-metadata (symbol "nil #_\"key is not present.\"")
                                  :conditions      [[:=
                                                     [:field "CC" {:base-type :type/Integer}]
                                                     [:field "CC" {:base-type :type/Integer, :join-alias "Q1"}]]]
                                  :stages          [{:source-table       83050
                                                     :aggregation        [[:count]]
                                                     :breakout           [[:field 83502 nil]]
                                                     :lib/stage-metadata {:columns [{:name "CATEGORY"}
                                                                                    {:name "count"}]}}
                                                    {:expressions        {"CC" [:+ 1 1]}
                                                     :lib/stage-metadata {:columns [{:name "CATEGORY"}
                                                                                    {:name "count"}
                                                                                    {:name "CC", :lib/expression-name "CC"}]}}]}]}]}
              (lib.util/pipeline query))))))

(deftest ^:parallel parse-column-display-name-parts-plain-column-test
  (testing "Plain column names should be translatable"
    (is (= [{:type :translatable, :value "Total"}]
           (lib.util/parse-column-display-name-parts "Total")))
    (is (= [{:type :translatable, :value "Created At"}]
           (lib.util/parse-column-display-name-parts "Created At")))))

(deftest ^:parallel parse-column-display-name-parts-temporal-bucket-test
  (testing "Temporal bucket patterns should have static suffix"
    (is (= [{:type :translatable, :value "Total"}
            {:type :static, :value ": "}
            {:type :static, :value "Month"}]
           (lib.util/parse-column-display-name-parts "Total: Month")))
    (is (= [{:type :translatable, :value "Created At"}
            {:type :static, :value ": "}
            {:type :static, :value "Day of week"}]
           (lib.util/parse-column-display-name-parts "Created At: Day of week")))))

(deftest ^:parallel parse-column-display-name-parts-join-test
  (testing "Joined table patterns should have translatable parts separated by static arrow"
    (is (= [{:type :translatable, :value "Products"}
            {:type :static, :value " → "}
            {:type :translatable, :value "Total"}]
           (lib.util/parse-column-display-name-parts "Products → Total")))
    (is (= [{:type :translatable, :value "Orders"}
            {:type :static, :value " → "}
            {:type :translatable, :value "Products"}
            {:type :static, :value " → "}
            {:type :translatable, :value "Total"}]
           (lib.util/parse-column-display-name-parts "Orders → Products → Total")))))

(deftest ^:parallel parse-column-display-name-parts-implicit-join-test
  (testing "Implicit join patterns (with dash) should be parsed when arrow is present"
    (is (= [{:type :translatable, :value "People"}
            {:type :static, :value " - "}
            {:type :translatable, :value "Product"}
            {:type :static, :value " → "}
            {:type :translatable, :value "Created At"}]
           (lib.util/parse-column-display-name-parts "People - Product → Created At")))))

(deftest ^:parallel parse-column-display-name-parts-join-with-temporal-bucket-test
  (testing "Joined table with temporal bucket"
    (is (= [{:type :translatable, :value "Products"}
            {:type :static, :value " → "}
            {:type :translatable, :value "Created At"}
            {:type :static, :value ": "}
            {:type :static, :value "Month"}]
           (lib.util/parse-column-display-name-parts "Products → Created At: Month")))))

(deftest ^:parallel parse-column-display-name-parts-aggregation-test
  (testing "Aggregation patterns should have static prefix/suffix"
    ;; More specific patterns (with suffix) must come before general patterns
    (let [patterns [{:prefix "Sum of ", :suffix " matching condition"}
                    {:prefix "Sum of ", :suffix ""}
                    {:prefix "Distinct values of ", :suffix ""}]]
      (is (= [{:type :static, :value "Sum of "}
              {:type :translatable, :value "Total"}]
             (lib.util/parse-column-display-name-parts "Sum of Total" patterns)))
      (is (= [{:type :static, :value "Distinct values of "}
              {:type :translatable, :value "Category"}]
             (lib.util/parse-column-display-name-parts "Distinct values of Category" patterns)))
      (is (= [{:type :static, :value "Sum of "}
              {:type :translatable, :value "Price"}
              {:type :static, :value " matching condition"}]
             (lib.util/parse-column-display-name-parts "Sum of Price matching condition" patterns))))))

(deftest ^:parallel parse-column-display-name-parts-aggregation-with-join-test
  (testing "Aggregation with joined table"
    (let [patterns [{:prefix "Distinct values of ", :suffix ""}]]
      (is (= [{:type :static, :value "Distinct values of "}
              {:type :translatable, :value "Products"}
              {:type :static, :value " → "}
              {:type :translatable, :value "Created At"}]
             (lib.util/parse-column-display-name-parts "Distinct values of Products → Created At" patterns))))))

(deftest ^:parallel parse-column-display-name-parts-complex-test
  (testing "Complex pattern: aggregation with implicit join and temporal bucket"
    (let [patterns [{:prefix "Distinct values of ", :suffix ""}]]
      (is (= [{:type :static, :value "Distinct values of "}
              {:type :translatable, :value "People"}
              {:type :static, :value " - "}
              {:type :translatable, :value "Product"}
              {:type :static, :value " → "}
              {:type :translatable, :value "Created At"}
              {:type :static, :value ": "}
              {:type :static, :value "Month"}]
             (lib.util/parse-column-display-name-parts
              "Distinct values of People - Product → Created At: Month"
              patterns))))))

(deftest ^:parallel parse-column-display-name-parts-rtl-test
  (testing "RTL pattern: value comes first (e.g., Hebrew 'Sum of X' = 'X של סכום')"
    (let [patterns [{:prefix "", :suffix " של סכום"}]]
      (is (= [{:type :translatable, :value "Total"}
              {:type :static, :value " של סכום"}]
             (lib.util/parse-column-display-name-parts "Total של סכום" patterns)))))

  (testing "Wrapped pattern: value in middle (e.g., French 'Somme de X totale')"
    (let [patterns [{:prefix "Somme de ", :suffix " totale"}]]
      (is (= [{:type :static, :value "Somme de "}
              {:type :translatable, :value "Total"}
              {:type :static, :value " totale"}]
             (lib.util/parse-column-display-name-parts "Somme de Total totale" patterns)))))

  (testing "Nested RTL patterns"
    (let [patterns [{:prefix "", :suffix " של סכום"}
                    {:prefix "", :suffix " של מינימום"}]]
      (is (= [{:type :translatable, :value "Total"}
              {:type :static, :value " של מינימום"}
              {:type :static, :value " של סכום"}]
             (lib.util/parse-column-display-name-parts "Total של מינימום של סכום" patterns)))))

  (testing "RTL pattern with join"
    (let [patterns [{:prefix "", :suffix " של סכום"}]]
      (is (= [{:type :translatable, :value "Products"}
              {:type :static, :value " → "}
              {:type :translatable, :value "Total"}
              {:type :static, :value " של סכום"}]
             (lib.util/parse-column-display-name-parts "Products → Total של סכום" patterns))))))
