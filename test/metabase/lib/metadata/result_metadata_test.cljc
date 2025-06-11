(ns metabase.lib.metadata.result-metadata-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.result-metadata :as result-metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- column-info [query {initial-columns :cols}]
  (result-metadata/expected-cols query initial-columns))

(deftest ^:parallel col-info-field-ids-test
  (testing {:base-type "make sure columns are comming back the way we'd expect for :field clauses"}
    (lib.tu.macros/$ids venues
      (is (=? [{:source    :fields
                :field-ref $price}]
              (column-info
               (lib/query meta/metadata-provider (lib.tu.macros/mbql-query venues {:fields [$price]}))
               {:columns [:price], :cols [{}]}))))))

(deftest ^:parallel col-info-for-implicit-joins-test
  (lib.tu.macros/$ids venues
    (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk-field-id` "
                  "info about the source Field")
      (is (=? [{:fk-field-id  %category-id
                :source       :fields
                :field-ref    $category-id->categories.name
                ;; for whatever reason this is what the `annotate` middleware traditionally returns here, for
                ;; some reason we use the `:long` style inside aggregations and the `:default` style elsewhere
                ;; who knows why. See notes
                ;; on [[metabase.query-processor.middleware.result-metadata/col-info-for-aggregation-clause]]
                :display-name "Category → Name"}]
              (column-info
               (lib/query meta/metadata-provider {:type :query, :query {:source-table $$venues, :fields [$category-id->categories.name]}})
               {:columns [:name]}))))))

(deftest ^:parallel col-info-for-implicit-joins-aggregation-test
  (lib.tu.macros/$ids venues
    (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk-field-id` "
                  "info about the source Field")
      (is (=? [{:source       :aggregation
                :field-ref    [:aggregation 0]
                :display-name "Distinct values of Category → Name"}]
              (column-info
               (lib/query
                meta/metadata-provider
                {:type  :query
                 :query {:source-table $$venues
                         :aggregation  [[:distinct $category-id->categories.name]]}})
               {:columns [:name]}))))))

(deftest ^:parallel col-info-for-explicit-joins-with-fk-field-id-test
  (lib.tu.macros/$ids venues
    (testing (str "we should get `:fk-field-id` and information where possible when using joins; "
                  "display-name should include the display name of the FK field (for IMPLICIT JOINS)")
      (is (=? [{:display-name "Category → Name"
                :source       :fields
                :field-ref    [:field (meta/id :categories :name) {:join-alias "Category"}]}]
              (column-info
               (lib/query
                meta/metadata-provider
                {:type  :query
                 :query {:source-table (meta/id :venues)
                         :fields [&Category.categories.name]
                         ;; This is a hand-rolled implicit join clause.
                         :joins  [{:alias        "Category"
                                   :source-table $$venues
                                   :condition    [:= $category-id &CATEGORIES__via__CATEGORY_ID.categories.id]
                                   :strategy     :left-join
                                   :fk-field-id  %category-id}]}})
               {:columns [:name]}))))))

(deftest ^:parallel col-info-for-explicit-joins-without-fk-field-id-test
  (lib.tu.macros/$ids venues
    (testing (str "for EXPLICIT JOINS (which do not include an `:fk-field-id` in the Join info) the returned "
                  "`:field-ref` should be have only `:join-alias`, and no `:source-field`")
      (is (=? [{:display-name "Categories → Name"
                :source       :fields
                :field-ref    &Categories.categories.name}]
              (column-info
               (lib/query
                meta/metadata-provider
                {:type  :query
                 :query {:source-table (meta/id :venues)
                         :fields [&Categories.categories.name]
                         :joins  [{:alias        "Categories"
                                   :source-table $$venues
                                   :condition    [:= $category-id &Categories.categories.id]
                                   :strategy     :left-join}]}})
               {:columns [:name]}))))))

(deftest ^:parallel col-info-for-field-with-temporal-unit-test
  (lib.tu.macros/$ids venues
    (testing "when a `:field` with `:temporal-unit` is used, we should add in info about the `:unit`"
      (is (=? [{:unit      :month
                :source    :fields
                :field-ref !month.price}]
              (column-info
               (lib/query
                meta/metadata-provider
                {:type :query, :query {:source-table (meta/id :venues)
                                       :fields       (lib.tu.macros/$ids venues [!month.price])}})
               {:columns [:price]}))))))

(deftest ^:parallel col-info-for-field-literal-with-temporal-unit-test
  (lib.tu.macros/$ids venues
    (testing "datetime unit should work on field literals too"
      (is (=? [{:name         "price"
                :base-type    :type/Number
                :display-name "Price: Month"
                :unit         :month
                :source       :fields
                :field-ref    !month.*price/Number}]
              (column-info
               (lib/query meta/metadata-provider
                          {:type :query, :query {:source-table (meta/id :venues)
                                                 :fields       [[:field "price" {:base-type :type/Number, :temporal-unit :month}]]}})
               {:columns [:price]}))))))

(deftest ^:parallel col-info-for-binning-strategy-test
  (testing "when binning strategy is used, include `:binning-info`"
    (is (=? [{:name         "price"
              :base-type    :type/Number
              :display-name "Price: Month"
              :unit         :month
              :source       :fields
              :binning-info {:num-bins 10, :bin-width 5, :min-value -100, :max-value 100, :binning-strategy :num-bins}
              :field-ref    [:field "price" {:base-type     :type/Number
                                             :temporal-unit :month
                                             :binning       {:strategy  :num-bins
                                                             :num-bins  10
                                                             :bin-width 5
                                                             :min-value -100
                                                             :max-value 100}}]
              :was-binned true}]
            (column-info
             (lib/query
              meta/metadata-provider
              {:type  :query
               :query {:source-table (meta/id :venues)
                       :fields [[:field "price" {:base-type     :type/Number
                                                 :temporal-unit :month
                                                 :binning       {:strategy  :num-bins
                                                                 :num-bins  10
                                                                 :bin-width 5
                                                                 :min-value -100
                                                                 :max-value 100}}]]}})
             {:columns [:price]})))))

(def ^:private child-parent-grandparent-metadata-provider
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:fields [(assoc (meta/field-metadata :venues :name)
                    :id           1
                    :name         "grandparent"
                    :display-name "Grandparent")
             (assoc (meta/field-metadata :venues :name)
                    :id           2
                    :name         "parent"
                    :display-name "Parent"
                    :parent-id    1)
             (assoc (meta/field-metadata :venues :name)
                    :id           3
                    :name         "child"
                    :display-name "Child"
                    :parent-id    2)]}))

(deftest ^:parallel col-info-combine-parent-field-names-test
  (testing "For fields with parents we should return them with a combined name including parent's name"
    (let [metadata-provider child-parent-grandparent-metadata-provider
          query             (-> (lib/query metadata-provider (meta/table-metadata :venues))
                                (lib/with-fields [(lib.metadata/field metadata-provider 2)]))]
      (is (=? {:description       nil
               :table-id          (meta/id :venues)
               ;; these two are a gross symptom. there's some tension. sometimes it makes sense to have an effective
               ;; type: the db type is different and we have a way to convert. Othertimes, it doesn't make sense:
               ;; when the info is inferred. the solution to this might be quite extensive renaming
               :coercion-strategy nil
               :name              "grandparent.parent"
               :settings          nil
               :field-ref         [:field 2 nil]
               :nfc-path          nil
               :parent-id         1
               :visibility-type   :normal
               ;; TODO -- not sure about this display name, seems like it's including parent twice -- Cam
               :display-name      "Grandparent: Grandparent: Parent"
               :base-type         :type/Text}
              (first (column-info query {:cols [{:metabase.lib.query/transformation-added-base-type true}]})))))))

(deftest ^:parallel col-info-combine-grandparent-field-names-test
  (testing "nested-nested fields should include grandparent name (etc)"
    (let [metadata-provider child-parent-grandparent-metadata-provider
          query             (-> (lib/query metadata-provider (meta/table-metadata :venues))
                                (lib/with-fields [(lib.metadata/field metadata-provider 3)]))]
      (is (=? {:description       nil
               :table-id          (meta/id :venues)
               :coercion-strategy nil
               :name              "grandparent.parent.child"
               :settings          nil
               :field-ref         [:field 3 {:base-type :type/Text}]
               :nfc-path          nil
               :parent-id         2
               :id                3
               :visibility-type   :normal
               ;; TODO -- not sure about this display name, seems like it's including parent twice -- Cam
               :display-name      "Grandparent: Parent: Grandparent: Parent: Child"
               :base-type         :type/Text}
              (first (column-info query {:cols [{:metabase.lib.query/transformation-added-base-type false}]})))))))

(deftest ^:parallel col-info-field-literals-test
  (testing "field literals should get the information from the matching `:source-metadata` if it was supplied"
    (let [query {:database (meta/id)
                 :lib/type :mbql/query
                 :stages   [{:lib/type           :mbql.stage/native
                             :lib/stage-metadata {:columns [{:lib/type :metadata/column
                                                             :name          "abc"
                                                             :display-name  "another Field"
                                                             :base-type     :type/Integer
                                                             :semantic-type :type/FK}
                                                            {:lib/type :metadata/column
                                                             :name          "sum"
                                                             :display-name  "sum of User ID"
                                                             :base-type     :type/Integer
                                                             :semantic-type :type/FK}]}}
                            {:lib/type :mbql.stage/mbql
                             :fields   [[:field {:lib/uuid (str (random-uuid)), :base-type :type/Integer} "sum"]]}]}]
      (is (=? {:name          "sum"
               :display-name  "sum of User ID"
               :base-type     :type/Integer
               :field-ref     [:field "sum" {:base-type :type/Integer}]
               :semantic-type :type/FK}
              (-> (column-info query {:cols [{}]})
                  first))))))

(defn- expression-metadata [table expression-name expression]
  (let [query (as-> (lib/query meta/metadata-provider (meta/table-metadata table)) query
                (lib/expression query expression-name expression)
                (lib/with-fields query [(lib/expression-ref query expression-name)]))]
    (-> (column-info query {:cols [{}]})
        first)))

(deftest ^:parallel col-info-expressions-test
  (testing "col info for an `expression` should work as expected"
    (is (=? {:base-type    :type/Integer
             :name         "double-price"
             :display-name "double-price"
             :field-ref    [:expression "double-price"]}
            (expression-metadata :venues "double-price" (lib/* (meta/field-metadata :venues :price) 2))))))

(deftest ^:parallel col-info-expressions-test-1b
  (testing "col info for a boolean `expression` should have the correct `base-type`"
    (lib.tu.macros/$ids people
      (doseq [expression [[:< $id 10]
                          [:<= $id 10]
                          [:> $id 10]
                          [:>= $id 10]
                          [:= $id 10]
                          [:!= $id 10]
                          [:between $id 10 20]
                          [:starts-with $id "a"]
                          [:ends-with $id "a"]
                          [:contains $id "a"]
                          [:does-not-contain $name "a"]
                          [:inside $latitude $longitude 90 -90 -90 90]
                          [:is-empty $name]
                          [:not-empty $name]
                          [:is-null $name]
                          [:not-null $name]
                          [:time-interval $created-at 1 :year]
                          [:relative-time-interval $created-at 1 :year -2 :year]
                          [:and [:> $id 10] [:< $id 20]]
                          [:or [:> $id 10] [:< $id 20]]
                          [:not [:> $id 10]]]]
        (is (=? {:base-type :type/Boolean}
                (expression-metadata :people "expression" (lib.convert/->pMBQL expression))))))))

(deftest ^:parallel col-info-expressions-test-2
  (testing "col-info for convert-timezone should have a `converted-timezone` property"
    (is (=? {:converted-timezone "Asia/Ho_Chi_Minh"
             :base-type          :type/DateTime
             :name               "last-login-converted"
             :display-name       "last-login-converted"
             :field-ref          [:expression "last-login-converted"]}
            (expression-metadata :users "last-login-converted" (lib/convert-timezone
                                                                (meta/field-metadata :users :last-login)
                                                                "Asia/Ho_Chi_Minh"
                                                                "UTC"))))))

(deftest ^:parallel col-info-expressions-test-2b
  (testing "col-info for convert-timezone should have a `converted-timezone` property"
    (is (=? {:converted-timezone "Asia/Ho_Chi_Minh"
             :base-type          :type/DateTime
             :name               "last-login-converted"
             :display-name       "last-login-converted"
             :field-ref          [:expression "last-login-converted"]}
            (expression-metadata :users "last-login-converted" (lib/datetime-add
                                                                (lib/convert-timezone
                                                                 (meta/field-metadata :users :last-login)
                                                                 "Asia/Ho_Chi_Minh"
                                                                 "UTC")
                                                                2
                                                                :hour))))))

(defn- col-info-for-aggregation-clause
  ([ag-clause]
   (col-info-for-aggregation-clause
    (lib/query meta/metadata-provider (meta/table-metadata :venues))
    ag-clause))

  ([query ag-clause]
   (let [query (-> query
                   (lib/aggregate (lib/->pMBQL ag-clause)))]
     (-> (column-info query {:cols []})
         first))))

(defn- aggregation-names
  [ag-clause]
  (-> (col-info-for-aggregation-clause ag-clause)
      (select-keys [:name :display-name])))

(deftest ^:parallel aggregation-names-test
  (testing "basic aggregations"
    (testing ":count"
      (is (= {:name "count", :display-name "Count"}
             (aggregation-names [:count]))))))

(deftest ^:parallel aggregation-names-test-2
  (testing "basic aggregations"
    (testing ":distinct"
      (is (= {:name "count", :display-name "Distinct values of ID"}
             (aggregation-names [:distinct [:field (meta/id :venues :id) nil]]))))))

(deftest ^:parallel aggregation-names-test-3
  (testing "basic aggregations"
    (testing ":sum"
      (is (= {:name "sum", :display-name "Sum of ID"}
             (aggregation-names [:sum [:field (meta/id :venues :id) nil]]))))))

(deftest ^:parallel aggregation-names-test-4
  (testing "expressions"
    (testing "simple expression"
      (is (= {:name "expression", :display-name "Count + 1"}
             (aggregation-names [:+ [:count] 1]))))))

(deftest ^:parallel aggregation-names-test-5
  (testing "expressions"
    (testing "expression with nested expressions"
      (is (= {:name "expression", :display-name "Min of ID + (2 × Average of Price)"}
             (aggregation-names
              [:+
               [:min [:field (meta/id :venues :id) nil]]
               [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]))))))

(deftest ^:parallel aggregation-names-test-6
  (testing "expressions"
    (testing "very complicated expression"
      (is (= {:name "expression", :display-name "Min of ID + (2 × Average of Price × 3 × (Max of Category ID - 4))"}
             (aggregation-names
              [:+
               [:min [:field (meta/id :venues :id) nil]]
               [:*
                2
                [:avg [:field (meta/id :venues :price) nil]]
                3
                [:- [:max [:field (meta/id :venues :category-id) nil]] 4]]]))))))

(deftest ^:parallel aggregation-names-test-7
  (testing "`aggregation-options`"
    (testing "`:name` and `:display-name`"
      (is (= {:name "generated_name", :display-name "User-specified Name"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (meta/id :venues :id) nil]] [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]
               {:name "generated_name", :display-name "User-specified Name"}]))))))

(deftest ^:parallel aggregation-names-test-8
  (testing "`aggregation-options`"
    (testing "`:name` only"
      (is (= {:name "generated_name", :display-name "Min of ID + (2 × Average of Price)"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (meta/id :venues :id) nil]] [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]
               {:name "generated_name"}]))))))

(deftest ^:parallel aggregation-names-test-9
  (testing "`aggregation-options`"
    (testing "`:display-name` only"
      (is (= {:name "expression", :display-name "User-specified Name"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (meta/id :venues :id) nil]] [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]
               {:display-name "User-specified Name"}]))))))

(deftest ^:parallel col-info-for-aggregation-clause-test
  (testing "basic aggregation clauses"
    (testing "`:count` (no field)"
      (is (=? {:base-type    :type/Float
               :name         "expression"
               :display-name "Count ÷ 2"}
              (col-info-for-aggregation-clause [:/ [:count] 2]))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-1b
  (testing "basic aggregation clauses"
    (testing "`:sum`"
      (is (=? {:base-type    :type/Integer
               :name         "sum"
               :display-name "Sum of Price + 1"}
              (lib.tu.macros/$ids venues
                (col-info-for-aggregation-clause [:sum [:+ $price 1]])))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-2
  (testing "`:aggregation-options`"
    (testing "`:name` and `:display-name`"
      (is (=? {:base-type     :type/Integer
               :settings      {:is_priceless true}
               :name          "sum_2"
               :display-name  "My custom name"}
              (lib.tu.macros/$ids venues
                (col-info-for-aggregation-clause
                 [:aggregation-options [:sum $price] {:name "sum_2", :display-name "My custom name"}])))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-2b
  (testing "`:aggregation-options`"
    (testing "`:name` only"
      (is (=? {:base-type     :type/Integer
               :settings      {:is_priceless true}
               :name          "sum_2"
               :display-name  "Sum of Price"}
              (lib.tu.macros/$ids venues
                (col-info-for-aggregation-clause [:aggregation-options [:sum $price] {:name "sum_2"}])))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-2c
  (testing "`:aggregation-options`"
    (testing "`:display-name` only"
      (is (=? {:base-type     :type/Integer
               :settings      {:is_priceless true}
               :name          "sum"
               :display-name  "My Custom Name"}
              (lib.tu.macros/$ids venues
                (col-info-for-aggregation-clause
                 [:aggregation-options [:sum $price] {:display-name "My Custom Name"}])))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-3
  (testing (str "if a driver is kind enough to supply us with some information about the `:cols` that come back, we "
                "should include that information in the results. Their information should be preferred over ours")
    (let [metadata-provider (lib.tu/merged-mock-metadata-provider
                             meta/metadata-provider
                             {:cards [{:id            1
                                       :database-id   (meta/id)
                                       :name          "Some metric"
                                       :type          :metric
                                       :dataset-query (lib.tu.macros/mbql-query orders
                                                        {:aggregation [[:sum $subtotal]]})}]})
          query (lib/query
                 metadata-provider
                 (lib.tu.macros/mbql-query venues {:aggregation [[:metric 1]]}))]
      (is (=? [{:display-name   "Total Events"
                :base-type      :type/Float
                :effective-type :type/Float
                :source         :aggregation
                :field-ref      [:aggregation 0]}]
              (column-info
               query
               {:cols [{:display-name "Total Events", :base-type :type/Float}]}))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-4
  (testing "col info for an `expression` aggregation w/ a named expression should work as expected"
    (let [query (lib.tu.macros/mbql-query venues
                  {:expressions {"double-price" [:* $price 2]}
                   :aggregation [[:sum [:expression "double-price"]]]})]
      (is (=? {:base-type    :type/Integer
               :name         "sum"
               :display-name "Sum of double-price"}
              (lib.tu.macros/$ids venues
                (col-info-for-aggregation-clause
                 (lib/query meta/metadata-provider query)
                 [:sum [:expression "double-price"]])))))))

(defn- infered-col-type [expr]
  (let [metadata (expression-metadata :checkins "expression" (lib.convert/->pMBQL expr))]
    (select-keys metadata [:base-type :effective-type :semantic-type])))

(defn- expression-type
  [expr]
  ((some-fn :effective-type :base-type) (infered-col-type expr)))

(defn- infer [expr]
  (-> (lib/query
       meta/metadata-provider
       (lib.tu.macros/mbql-query venues
         {:expressions {"expr" expr}
          :fields [[:expression "expr"]]
          :limit 10}))
      (column-info {:cols [{}]})
      first))

(deftest ^:parallel computed-columns-inference
  (testing "Coalesce"
    (testing "Uses the first clause"
      (testing "Gets the type information from the field"
        (is (=? {:name           "expr"
                 :source         :fields
                 :field-ref      [:expression "expr"]
                 :effective-type :type/Text
                 :display-name   "expr"
                 :base-type      :type/Text}
                (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])))
        (testing "Does not contain a field id in its analysis (#18513)"
          (is (false? (contains? (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])
                                 :id))))))))

(deftest ^:parallel computed-columns-inference-1b
  (testing "Coalesce"
    (testing "Uses the first clause"
      (testing "Gets the type information from the literal"
        (is (=? {:base-type    :type/Text
                 :name         "expr"
                 :display-name "expr"
                 :field-ref    [:expression "expr"]
                 :source       :fields}
                (infer [:coalesce "bar" [:field (meta/id :venues :name) nil]])))))))

(deftest ^:parallel computed-columns-inference-2
  (testing "Case"
    (testing "Uses first available type information"
      (testing "From a field"
        (is (=? {:name           "expr"
                 :source         :fields
                 :field-ref      [:expression "expr"]
                 :effective-type :type/Text
                 :display-name   "expr"
                 :base-type      :type/Text}
                (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])))
        (testing "does not contain a field id in its analysis (#17512)"
          (is (false?
               (contains? (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])
                          :id))))))))

(deftest ^:parallel computed-columns-inference-2b
  (testing "Case"
    (is (=? {:base-type :type/Text, :effective-type :type/Text}
            (infered-col-type [:case [[[:> [:field (meta/id :venues :price) nil] 2] "big"]]])))
    (is (=? {:base-type :type/Integer}
            (infered-col-type [:case [[[:> [:field (meta/id :venues :price) nil] 2]
                                       [:+ [:field (meta/id :venues :price) nil] 1]]]])))))

(deftest ^:parallel computed-columns-inference-2c
  (testing "Case"
    (testing "Make sure we skip nils when infering case return type"
      (is (=? {:base-type :type/Number}
              (infered-col-type [:case [[[:< [:field (meta/id :venues :price) nil] 10] [:value nil {:base-type :type/Number}]]
                                        [[:> [:field (meta/id :venues :price) nil] 2]  10]]]))))))

(deftest ^:parallel computed-columns-inference-2d
  (testing "Case"
    (is (=? {:base-type :type/Integer}
            (infered-col-type [:case [[[:> [:field (meta/id :venues :price) nil] 2]
                                       [:+ [:field (meta/id :venues :price) nil] 1]]]])))))

(deftest ^:parallel detect-temporal-expressions-test
  (are [expr] (isa? (expression-type expr) :type/Temporal)
    [:+ [:field (meta/id :checkins :date) nil] [:interval -1 :month]]
    [:field (meta/id :checkins :date) {:temporal-unit :month}])
  (are [expr] (not (isa? (expression-type expr) :type/Temporal))
    [:+ 1 [:temporal-extract
           [:+ [:field (meta/id :checkins :date) nil] [:interval -1 :month]]
           :year-of-era]]
    [:+ [:field (meta/id :checkins :date) nil] 3]))

(deftest ^:parallel temporal-extract-test
  (are [expr base-type] (=? {:base-type base-type}
                            (infered-col-type expr))
    [:datetime-add [:field (meta/id :checkins :date) nil] 2 :month]    :type/Date
    [:datetime-add [:field (meta/id :checkins :date) nil] 2 :hour]     :type/Date
    [:datetime-add [:field (meta/id :users :last-login) nil] 2 :month] :type/DateTime))

(deftest ^:parallel test-string-extracts
  (are [expr base-type] (=? {:base-type base-type}
                            (infered-col-type expr))
    [:trim "foo"]                                          :type/Text
    [:ltrim "foo"]                                         :type/Text
    [:rtrim "foo"]                                         :type/Text
    [:length "foo"]                                        :type/Integer
    [:upper "foo"]                                         :type/Text
    [:lower "foo"]                                         :type/Text
    [:substring "foo" 2]                                   :type/Text
    [:replace "foo" "f" "b"]                               :type/Text
    [:regex-match-first "foo" "f"]                         :type/Text
    [:concat "foo" "bar"]                                  :type/Text
    [:coalesce "foo" "bar"]                                :type/Text
    [:coalesce [:field (meta/id :venues :name) nil] "bar"] :type/Text))

(deftest ^:parallel unique-name-key-test
  (testing "Make sure `:cols` always come back with a unique `:name` key (#8759)"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query venues
                   {:aggregation [[:count]
                                  [:sum $price]
                                  [:count]
                                  [:aggregation-options [:count] {:display-name "count_2"}]]}))]
      (is (=? [{:base-type      :type/Number
                :effective-type :type/Number
                :semantic-type :type/Quantity
                :name          "count"
                :display-name  "count"
                :source        :aggregation
                :field-ref     [:aggregation 0]}
               {:source       :aggregation
                :name         "sum"
                :display-name "sum"
                :base-type    :type/Number
                :effective-type :type/Number
                :field-ref    [:aggregation 1]}
               {:base-type     :type/Number
                :effective-type :type/Number
                :semantic-type :type/Quantity
                :name          "count_2"
                :display-name  "count"
                :source        :aggregation
                :field-ref     [:aggregation 2]}
               {:base-type     :type/Number
                :effective-type :type/Number
                :semantic-type :type/Quantity
                :name          "count_3"
                :display-name  "count_2"
                :source        :aggregation
                :field-ref     [:aggregation 3]}]
              (column-info
               query
               {:cols [{:name "count", :display-name "count", :base-type :type/Number}
                       {:name "sum", :display-name "sum", :base-type :type/Number}
                       {:name "count", :display-name "count", :base-type :type/Number}
                       {:name "count_2", :display-name "count_2", :base-type :type/Number}]}))))))

(deftest ^:parallel expressions-keys-test
  (testing "make sure expressions come back with the right set of keys (#8854)"
    (is (=? {:name            "discount_price"
             :display-name    "discount_price"
             :base-type       :type/Float
             :source          :fields
             :field-ref       [:expression "discount_price"]}
            (-> (column-info
                 (lib/query
                  meta/metadata-provider
                  (lib.tu.macros/mbql-query venues
                    {:expressions {"discount_price" [:* 0.9 $price]}
                     :fields      [$name [:expression "discount_price"]]
                     :limit       10}))
                 {:cols [{} {}]})
                second)))))

(deftest ^:parallel deduplicate-expression-names-test
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "expressions in aggregations"
      (let [query (lib/query
                   meta/metadata-provider
                   (lib.tu.macros/mbql-query venues
                     {:aggregation [[:* 0.9 [:avg $price]]
                                    [:* 0.8 [:avg $price]]]
                      :limit       10}))]
        (is (=? [{:base-type    :type/Float
                  :name         "expression"
                  :display-name "0.9 × Average of Price"
                  :source       :aggregation
                  :field-ref    [:aggregation 0]}
                 {:base-type    :type/Float
                  :name         "expression_2"
                  :display-name "0.8 × Average of Price"
                  :source       :aggregation
                  :field-ref    [:aggregation 1]}]
                (column-info query {:cols [{} {}]})))))))

(deftest ^:parallel deduplicate-expression-names-test-2
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "named :expressions"
      (let [query (lib/query
                   meta/metadata-provider
                   (lib.tu.macros/mbql-query users
                     {:expressions {:prev_month [:+ $last-login [:interval -1 :month]]}
                      :fields      [[:expression "prev_month"]], :limit 10}))]
        (is (=? [{:name            "prev_month"
                  :display-name    "prev_month"
                  :base-type       :type/Temporal
                  :source          :fields
                  :field-ref       [:expression "prev_month"]}]
                (column-info query {:cols [{}]})))))))

(deftest ^:parallel rename-join-with-long-alias-test
  (let [old-alias   "Products with a very long name - Product ID with a _598bd25b"
        new-alias   "Products with a very long name - Product ID with a very long name"
        query       (lib/query
                     meta/metadata-provider
                     {:lib/type :mbql/query
                      :database (meta/id)
                      :stages [{:lib/type :mbql.stage/mbql
                                :source-table (meta/id :orders)
                                :joins [{:lib/type :mbql/join
                                         :stages [{:lib/type :mbql.stage/mbql
                                                   :source-table (meta/id :products)}]
                                         :alias old-alias
                                         :strategy :left-join
                                         :fields [[:field {:join-alias old-alias, :base-type :type/BigInteger} (meta/id :products :id)]
                                                  [:field {:join-alias old-alias, :base-type :type/Text} (meta/id :products :ean)]
                                                  [:field {:join-alias old-alias, :base-type :type/Text} (meta/id :products :title)]
                                                  [:field {:join-alias old-alias, :base-type :type/Text} (meta/id :products :category)]
                                                  [:field {:join-alias old-alias, :base-type :type/Text} (meta/id :products :vendor)]
                                                  [:field {:join-alias old-alias, :base-type :type/Float} (meta/id :products :price)]
                                                  [:field {:join-alias old-alias, :base-type :type/Float} (meta/id :products :rating)]
                                                  [:field {:join-alias old-alias, :base-type :type/DateTimeWithLocalTZ} (meta/id :products :created-at)]]
                                         :conditions [[:=
                                                       {}
                                                       [:field {:base-type :type/Integer} (meta/id :orders :product-id)]
                                                       [:field {:join-alias old-alias, :base-type :type/BigInteger} (meta/id :products :id)]]]}]
                                :aggregation [[:count {:name "count"}]]
                                :breakout [[:field {:join-alias old-alias, :base-type :type/Text} (meta/id :products :category)]]
                                :order-by [[:asc
                                            {}
                                            [:field {:join-alias old-alias, :base-type :type/Text} (meta/id :products :category)]]]}
                               {:lib/type :mbql.stage/mbql
                                :fields [[:field {:join-alias old-alias, :base-type :type/Text} (meta/id :products :category)]
                                         [:field {:base-type :type/Integer} "count"]]
                                :filters [[:=
                                           {}
                                           [:field {:base-type :type/Integer} "count"]
                                           [:value {:base-type :type/Integer, :effective-type :type/Integer} 1337]]]}]
                      :info {:alias/escaped->original {old-alias new-alias}}})]
    (is (=? {:stages [{:joins [{:alias new-alias
                                :strategy :left-join
                                :fields [[:field {:join-alias new-alias} (meta/id :products :id)]
                                         [:field {:join-alias new-alias} (meta/id :products :ean)]
                                         [:field {:join-alias new-alias} (meta/id :products :title)]
                                         [:field {:join-alias new-alias} (meta/id :products :category)]
                                         [:field {:join-alias new-alias} (meta/id :products :vendor)]
                                         [:field {:join-alias new-alias} (meta/id :products :price)]
                                         [:field {:join-alias new-alias} (meta/id :products :rating)]
                                         [:field {:join-alias new-alias} (meta/id :products :created-at)]]
                                :conditions [[:=
                                              {}
                                              [:field {} (meta/id :orders :product-id)]
                                              [:field {:join-alias new-alias} (meta/id :products :id)]]]}]
                       :breakout [[:field {:join-alias new-alias} (meta/id :products :category)]]
                       :order-by [[:asc
                                   {}
                                   [:field {:join-alias new-alias} (meta/id :products :category)]]]}
                      {:lib/type :mbql.stage/mbql
                       :fields [[:field {:join-alias new-alias} (meta/id :products :category)]
                                [:field {} "count"]]
                       :filters [[:=
                                  {}
                                  [:field {} "count"]
                                  [:value {:effective-type :type/Integer} 1337]]]}]
             :info {:alias/escaped->original {old-alias new-alias}}}
            (#'result-metadata/rename-join query old-alias new-alias)))))

;;; TODO -- more tests that make sure queries work with additional stages or nested joins
(deftest ^:parallel restore-original-join-aliases-test
  (let [query (-> (lib/query
                   meta/metadata-provider
                   (lib.tu.macros/mbql-query orders
                     {:joins  [{:source-table $$products
                                :condition    [:= $product-id [:field %products.id {:join-alias "*ESCAPED*"}]]
                                :alias        "*ESCAPED*"
                                :fields       [[:field %products.title {:join-alias "*ESCAPED*"}]]}]
                      :fields [$orders.id
                               [:field %products.title {:join-alias "*ESCAPED*"}]]
                      :limit  4}))
                  (assoc-in [:info :alias/escaped->original "*ESCAPED*"] "*ORIGINAL*"))]
    (is (=? {:stages [{:joins [{:alias "*ESCAPED*"
                                :fields [[:field {:join-alias "*ESCAPED*"} pos-int?]]
                                :conditions [[:=
                                              {}
                                              [:field {} pos-int?]
                                              [:field {:join-alias "*ESCAPED*"} pos-int?]]]}]
                       :fields [[:field {} pos-int?]
                                [:field {:join-alias "*ESCAPED*"} pos-int?]]}]
             :info {:alias/escaped->original {"*ESCAPED*" "*ORIGINAL*"}}}
            query))
    (is (=? {:stages [{:joins [{:alias "*ORIGINAL*"
                                :fields [[:field {:join-alias "*ORIGINAL*"} pos-int?]]
                                :conditions [[:=
                                              {}
                                              [:field {} pos-int?]
                                              [:field {:join-alias "*ORIGINAL*"} pos-int?]]]}]
                       :fields [[:field {} pos-int?]
                                [:field {:join-alias "*ORIGINAL*"} pos-int?]]}]
             :info {:alias/escaped->original {"*ESCAPED*" "*ORIGINAL*"}}}
            (#'result-metadata/restore-original-join-aliases query)))))

;;; adapted from [[metabase.query-processor-test.nested-queries-test/breakout-year-test]]
(deftest ^:parallel breakout-year-test
  (testing (str "make sure when doing a nested query we give you metadata that would suggest you should be able to "
                "break out a *YEAR*")
    (let [source-query (lib.tu.macros/mbql-query checkins
                         {:aggregation  [[:count]]
                          :breakout     [!year.date]})
          metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                             meta/metadata-provider
                             [source-query])]
      (let [[date-col count-col] (for [col (result-metadata/expected-cols (lib/query meta/metadata-provider source-query))]
                                   (as-> col col
                                     (assoc col :source :fields)
                                     (dissoc col :position :aggregation_index)
                                     (m/filter-keys simple-keyword? col)))]
        ;; since the bucketing is happening in the source query rather than at this level, the field ref should
        ;; return temporal unit `:default` rather than the upstream bucketing unit. You wouldn't want to re-apply
        ;; the `:year` bucketing if you used this query in another subsequent query, so the field ref doesn't
        ;; include the unit; however `:unit` is still `:year` so the frontend can use the correct formatting to
        ;; display values of the column.
        (is (=? [(assoc date-col  :field-ref [:field "DATE" {:base-type :type/Date}], :unit :year)
                 (assoc count-col :field-ref [:field "count" {:base-type :type/Integer}])]
                (result-metadata/expected-cols
                 (lib/query metadata-provider (lib.metadata/card metadata-provider 1)))))))))

;;; adapted from [[metabase.query-processor-test.model-test/model-self-join-test]]
#_(deftest ^:parallel model-self-join-test
  (testing "Field references from model joined a second time can be resolved (#48639)"
    (let [mp meta/metadata-provider
          mp (lib.tu/mock-metadata-provider
              mp
              {:cards [{:id 1
                        :name "Products+Reviews"
                        :database-id (meta/id)
                        :type :model
                        :dataset-query (-> (lib/query mp (lib.metadata/table mp (meta/id :products)))
                                           (lib/join (-> (lib/join-clause (lib.metadata/table mp (meta/id :reviews))
                                                                          [(lib/=
                                                                            (lib.metadata/field mp (meta/id :products :id))
                                                                            (lib.metadata/field mp (meta/id :reviews :product-id)))])
                                                         (lib/with-join-fields :all))))}]})
          mp (lib.tu/mock-metadata-provider
              mp
              {:cards [{:id 2
                        :database-id (meta/id)
                        :name "Products+Reviews Summary"
                        :type :model
                        :dataset-query (binding [lib.metadata.calculation/*display-name-style* :long]
                                         (as-> (lib/query mp (lib.metadata/card mp 1)) $q
                                           (lib/aggregate $q (lib/sum (->> $q
                                                                           lib/available-aggregation-operators
                                                                           (m/find-first (comp #{:sum} :short))
                                                                           :columns
                                                                           (m/find-first #(= (:display-name %) "Price")))))
                                           (lib/breakout $q (-> (or (m/find-first #(= (:display-name %) "Reviews → Created At")
                                                                                  (lib/breakoutable-columns $q))
                                                                    (throw (ex-info "Cannot find 'Reviews → Created At'"
                                                                                    {:cols (lib/breakoutable-columns $q)})))
                                                                (lib/with-temporal-bucket :month)))))}]})
          query (binding [lib.metadata.calculation/*display-name-style* :long]
                  (as-> (lib/query mp (lib.metadata/card mp 1)) $q
                    (lib/breakout $q (-> (m/find-first (comp #{"Reviews → Created At"} :display-name)
                                                       (lib/breakoutable-columns $q))
                                         (lib/with-temporal-bucket :month)))
                    (lib/aggregate $q (lib/avg (->> $q
                                                    lib/available-aggregation-operators
                                                    (m/find-first (comp #{:avg} :short))
                                                    :columns
                                                    (m/find-first (comp #{"Rating"} :display-name)))))
                    (lib/append-stage $q)
                    (letfn [(find-col [query display-name]
                              (or (m/find-first #(= (:display-name %) display-name)
                                                (lib/breakoutable-columns query))
                                  (throw (ex-info "Failed to find column with display name"
                                                  {:display-name display-name
                                                   :found       (map :display-name (lib/breakoutable-columns query))}))))]
                      (lib/join $q (-> (lib/join-clause (lib.metadata/card mp 2)
                                                        [(lib/=
                                                          (lib/with-temporal-bucket (find-col $q "Reviews → Created At: Month")
                                                            :month)
                                                          (lib/with-temporal-bucket (find-col
                                                                                     (lib/query mp (lib.metadata/card mp 2))
                                                                                     "Reviews → Created At: Month")
                                                            :month))])
                                       (lib/with-join-fields :all))))))]
      (is (=? ["Reviews → Created At: Month"
               "Average of Rating"
               "Products+Reviews Summary - Reviews → Created At: Month → Reviews → Created At: Month"
               "Products+Reviews Summary - Reviews → Created At: Month → Sum"]
              (map :display-name (result-metadata/expected-cols query)))))))

;;; see
;;; also [[metabase.query-processor.middleware.add-source-metadata-test/add-correct-metadata-fields-for-deeply-nested-source-queries-test]]
#_(deftest ^:parallel add-correct-metadata-fields-for-deeply-nested-source-queries-test
  (let [query (lib/query
               meta/metadata-provider
               (lib.tu.macros/mbql-query orders
                 {:source-query {:source-table $$orders
                                 :filter       [:= $id 1]
                                 :aggregation  [[:sum $total]]
                                 :breakout     [!day.created-at
                                                $product-id->products.title
                                                $product-id->products.category]}
                  :filter       [:> *sum/Float 100]
                  :aggregation  [[:sum *sum/Float]]
                  :breakout     [*TITLE/Text]}))]
    (is (= [[:field "TITLE" {:base-type :type/Text}]
            [:aggregation 0]]
           (map :field-ref (result-metadata/expected-cols query))))))
