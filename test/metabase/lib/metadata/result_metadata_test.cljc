(ns metabase.lib.metadata.result-metadata-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.result-metadata :as result-metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(mu/defn- column-info [query :- ::lib.schema/query {initial-columns :cols}]
  (result-metadata/returned-columns query initial-columns))

(deftest ^:parallel col-info-field-ids-test
  (testing "make sure columns are comming back the way we'd expect for :field clauses"
    (lib.tu.macros/$ids venues
      (is (=? [{::result-metadata/source    :fields
                ::result-metadata/field-ref $price}]
              (column-info
               (lib/query meta/metadata-provider (lib.tu.macros/mbql-query venues {:fields [$price]}))
               {:columns [:price], :cols [{}]}))))))

(deftest ^:parallel col-info-for-implicit-joins-test
  (lib.tu.macros/$ids venues
    (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk-field-id` "
                  "info about the source Field")
      (is (=? [{:fk-field-id                %category-id
                ::result-metadata/source    :fields
                ::result-metadata/field-ref $category-id->categories.name
                ;; for whatever reason this is what the `annotate` middleware traditionally returns here, for
                ;; some reason we use the `:long` style inside aggregations and the `:default` style elsewhere
                ;; who knows why. See notes
                ;; on [[metabase.query-processor.middleware.result-metadata/col-info-for-aggregation-clause]]
                :display-name               "Category → Name"}]
              (column-info
               (lib/query meta/metadata-provider {:type :query, :query {:source-table $$venues, :fields [$category-id->categories.name]}})
               {:columns [:name]}))))))

(deftest ^:parallel col-info-for-implicit-joins-aggregation-test
  (lib.tu.macros/$ids venues
    (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk-field-id` "
                  "info about the source Field")
      (is (=? [{::result-metadata/source    :aggregation
                ::result-metadata/field-ref [:aggregation 0]
                :display-name               "Distinct values of Category → Name"}]
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
      (is (=? [{:display-name               "Category → Name"
                ::result-metadata/source    :fields
                ;; sort of contrived since this is not a query we could build create IRL... even tho the join is
                ;; technically explicit it matches the shape of an implicit one, so we should return field refs that
                ;; act like the join isn't here yet
                ::result-metadata/field-ref [:field (meta/id :categories :name) {:source-field (meta/id :venues :category-id)}]}]
              (column-info
               (lib/query
                meta/metadata-provider
                {:type  :query
                 :query {:source-table (meta/id :venues)
                         :fields       [&Category.categories.name]
                         ;; This is a hand-rolled implicit join clause.
                         :joins        [{:alias        "Category"
                                         :source-table $$categories
                                         :condition    [:= $category-id &CATEGORIES__via__CATEGORY_ID.categories.id]
                                         :strategy     :left-join
                                         :fk-field-id  %category-id}]}})
               {:columns [:name]}))))))

(deftest ^:parallel col-info-for-explicit-joins-without-fk-field-id-test
  (lib.tu.macros/$ids venues
    (testing (str "for EXPLICIT JOINS (which do not include an `:fk-field-id` in the Join info) the returned "
                  "`::result-metadata/field-ref` should be have only `:join-alias`, and no `:source-field`")
      (is (=? [{:display-name               "Categories → Name"
                ::result-metadata/source    :fields
                ::result-metadata/field-ref &Categories.categories.name}]
              (column-info
               (lib/query
                meta/metadata-provider
                {:type  :query
                 :query {:source-table (meta/id :venues)
                         :fields       [&Categories.categories.name]
                         :joins        [{:alias        "Categories"
                                         :source-table $$categories
                                         :condition    [:= $category-id &Categories.categories.id]
                                         :strategy     :left-join}]}})
               {:columns [:name]}))))))

(deftest ^:parallel col-info-for-field-with-temporal-unit-test
  (lib.tu.macros/$ids venues
    (testing "when a `:field` with `:temporal-unit` is used, we should add in info about the `:unit`"
      (is (=? [{:unit                       :month
                ::result-metadata/source    :fields
                ::result-metadata/field-ref !month.price}]
              (column-info
               (lib/query
                meta/metadata-provider
                {:type :query, :query {:source-table (meta/id :venues)
                                       :fields       (lib.tu.macros/$ids venues [!month.price])}})
               {:columns [:price]}))))))

(deftest ^:parallel col-info-for-field-literal-with-temporal-unit-test
  (lib.tu.macros/$ids venues
    (testing "datetime unit should work on field literals too"
      (is (=? [{:name                       "price"
                :base-type                  :type/Number
                :display-name               "Price: Month"
                :unit                       :month
                ::result-metadata/source    :fields
                ::result-metadata/field-ref !month.*price/Number}]
              (column-info
               (lib/query meta/metadata-provider
                          {:type :query, :query {:source-table (meta/id :venues)
                                                 :fields       [[:field "price" {:base-type :type/Number, :temporal-unit :month}]]}})
               {:columns [:price]}))))))

(deftest ^:parallel col-info-for-binning-strategy-test
  (testing "when binning strategy is used, include `:binning-info`"
    (is (=? [{:name                       "price"
              :base-type                  :type/Number
              :display-name               "Price: 10 bins: Month"
              :unit                       :month
              ::result-metadata/source    :fields
              :binning-info               {:num-bins 10, :bin-width 5, :min-value -100, :max-value 100, :binning-strategy :num-bins}
              ::result-metadata/field-ref [:field "price" {:base-type     :type/Number
                                                           :temporal-unit :month
                                                           :binning       {:strategy  :num-bins
                                                                           :num-bins  10
                                                                           :bin-width 5
                                                                           :min-value -100
                                                                           :max-value 100}}]}]
            (column-info
             (lib/query
              meta/metadata-provider
              {:type  :query
               :query {:source-table (meta/id :venues)
                       :fields       [[:field "price" {:base-type     :type/Number
                                                       :temporal-unit :month
                                                       :binning       {:strategy  :num-bins
                                                                       :num-bins  10
                                                                       :bin-width 5
                                                                       :min-value -100
                                                                       :max-value 100}}]]}})
             {:columns [:price]})))))

(def child-parent-grandparent-metadata-provider
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
      (is (=? {:table-id          (meta/id :venues)
               ;; these two are a gross symptom. there's some tension. sometimes it makes sense to have an effective
               ;; type: the db type is different and we have a way to convert. Othertimes, it doesn't make sense:
               ;; when the info is inferred. the solution to this might be quite extensive renaming
               :name              "grandparent.parent"
               ::result-metadata/field-ref         [:field 2 nil]
               :parent-id         1
               :visibility-type   :normal
               :display-name      "Grandparent: Parent"
               :base-type         :type/Text}
              (first (column-info query {:cols [{:metabase.lib.query/transformation-added-base-type true}]})))))))

(deftest ^:parallel col-info-combine-grandparent-field-names-test
  (testing "nested-nested fields should include grandparent name (etc)"
    (let [metadata-provider child-parent-grandparent-metadata-provider
          query             (-> (lib/query metadata-provider (meta/table-metadata :venues))
                                (lib/with-fields [(lib.metadata/field metadata-provider 3)]))]
      (is (=? {:table-id          (meta/id :venues)
               :name              "grandparent.parent.child"
               ::result-metadata/field-ref         [:field 3 nil]
               :parent-id         2
               :id                3
               :visibility-type   :normal
               :display-name      "Grandparent: Parent: Child"
               :base-type         :type/Text}
              (first (column-info query {:cols [{:metabase.lib.query/transformation-added-base-type false}]})))))))

(deftest ^:parallel col-info-field-literals-test
  (testing "field literals should get the information from the matching `:source-metadata` if it was supplied"
    (let [query (lib/query
                 meta/metadata-provider
                 {:database (meta/id)
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
                              :fields   [[:field {:lib/uuid (str (random-uuid)), :base-type :type/Integer} "sum"]]}]})]
      (is (=? {:name          "sum"
               :display-name  "sum of User ID"
               :base-type     :type/Integer
               ::result-metadata/field-ref     [:field "sum" {:base-type :type/Integer}]
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
             ::result-metadata/field-ref    [:expression "double-price"]}
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

(deftest ^:parallel converted-timezone-test
  (testing "col-info for convert-timezone should have a `converted-timezone` property"
    (is (=? {:converted-timezone "Asia/Ho_Chi_Minh"
             :base-type          :type/DateTime
             :name               "last-login-converted"
             :display-name       "last-login-converted"
             ::result-metadata/field-ref          [:expression "last-login-converted"]}
            (expression-metadata :users "last-login-converted" (lib/convert-timezone
                                                                (meta/field-metadata :users :last-login)
                                                                "Asia/Ho_Chi_Minh"
                                                                "UTC"))))))

(deftest ^:parallel converted-timezone-test-2
  (testing "col-info for convert-timezone should have a `converted-timezone` property (convert-timezone nested inside another expression)"
    (is (=? {:converted-timezone "Asia/Ho_Chi_Minh"
             :base-type          :type/DateTime
             :name               "last-login-converted"
             :display-name       "last-login-converted"
             ::result-metadata/field-ref          [:expression "last-login-converted"]}
            (expression-metadata :users "last-login-converted" (lib/datetime-add
                                                                (lib/convert-timezone
                                                                 (meta/field-metadata :users :last-login)
                                                                 "Asia/Ho_Chi_Minh"
                                                                 "UTC")
                                                                2
                                                                :hour))))))

(deftest ^:parallel converted-timezone-test-3
  (testing "converted-timezone should come back for expression refs"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query users
                   {:expressions {"expr" [:convert-timezone [:field (meta/id :users :last-login) nil] "Asia/Seoul"]}
                    :fields      [[:expression "expr"]]}))]
      (is (=? [{:name               "expr"
                :converted-timezone "Asia/Seoul"}]
              (result-metadata/returned-columns query))))))

(deftest ^:parallel converted-timezone-test-4
  (testing "We should be able to reach back into the source card to resolve and expression to populate :converted-timezone"
    (let [mp (lib.tu/metadata-provider-with-cards-for-queries
              meta/metadata-provider
              [(lib.tu.macros/mbql-query users
                 {:expressions {"to-07"       [:convert-timezone $last-login "Asia/Saigon" "UTC"]
                                "to-07-to-09" [:convert-timezone [:expression "to-07"] "Asia/Seoul" "America/Los_Angeles"]}
                  :fields      [$last-login
                                [:expression "to-07"]
                                [:expression "to-07-to-09"]]})])
          query (lib/query mp (lib.metadata/card mp 1))]
      (testing "lib/returned columns must propagate :lib/original-expression-name in order for :converted-timezone to work correctly"
        (is (=? [{}
                 {:lib/original-expression-name "to-07"}
                 {:lib/original-expression-name "to-07-to-09"}]
                (lib/returned-columns query))))
      (is (=? [{:name "LAST_LOGIN"}
               {:name "to-07", :converted-timezone "Asia/Saigon"}
               {:name "to-07-to-09", :converted-timezone "Asia/Seoul"}]
              (map #(select-keys % [:name :converted-timezone])
                   (result-metadata/returned-columns query)))))))

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
          query             (lib/query
                             metadata-provider
                             (lib.tu.macros/mbql-query venues {:aggregation [[:metric 1]]}))]
      (is (=? [{:display-name               "Total Events"
                :base-type                  :type/Float
                :effective-type             :type/Float
                ::result-metadata/source    :aggregation
                ::result-metadata/field-ref [:aggregation 0]}]
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
        (is (=? {:name                       "expr"
                 ::result-metadata/source    :fields
                 ::result-metadata/field-ref [:expression "expr"]
                 :effective-type             :type/Text
                 :display-name               "expr"
                 :base-type                  :type/Text}
                (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])))
        (testing "Does not contain a field id in its analysis (#18513)"
          (is (false? (contains? (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])
                                 :id))))))))

(deftest ^:parallel computed-columns-inference-1b
  (testing "Coalesce"
    (testing "Uses the first clause"
      (testing "Gets the type information from the literal"
        (is (=? {:base-type                  :type/Text
                 :name                       "expr"
                 :display-name               "expr"
                 ::result-metadata/field-ref [:expression "expr"]
                 ::result-metadata/source    :fields}
                (infer [:coalesce "bar" [:field (meta/id :venues :name) nil]])))))))

(deftest ^:parallel computed-columns-inference-2
  (testing "Case"
    (testing "Uses first available type information"
      (testing "From a field"
        (is (=? {:name                       "expr"
                 ::result-metadata/source    :fields
                 ::result-metadata/field-ref [:expression "expr"]
                 :effective-type             :type/Text
                 :display-name               "expr"
                 :base-type                  :type/Text}
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
      (is (=? [{:base-type                  :type/Number
                :effective-type             :type/Number
                :semantic-type              :type/Quantity
                :name                       "count"
                :display-name               "count"
                ::result-metadata/source    :aggregation
                ::result-metadata/field-ref [:aggregation 0]}
               {::result-metadata/source    :aggregation
                :name                       "sum"
                :display-name               "sum"
                :base-type                  :type/Number
                :effective-type             :type/Number
                ::result-metadata/field-ref [:aggregation 1]}
               {:base-type                  :type/Number
                :effective-type             :type/Number
                :semantic-type              :type/Quantity
                :name                       "count_2"
                :display-name               "count"
                ::result-metadata/source    :aggregation
                ::result-metadata/field-ref [:aggregation 2]}
               {:base-type                  :type/Number
                :effective-type             :type/Number
                :semantic-type              :type/Quantity
                :name                       "count_3"
                :display-name               "count_2"
                ::result-metadata/source    :aggregation
                ::result-metadata/field-ref [:aggregation 3]}]
              (column-info
               query
               {:cols [{:name "count", :display-name "count", :base-type :type/Number}
                       {:name "sum", :display-name "sum", :base-type :type/Number}
                       {:name "count", :display-name "count", :base-type :type/Number}
                       {:name "count_2", :display-name "count_2", :base-type :type/Number}]}))))))

(deftest ^:parallel expressions-keys-test
  (testing "make sure expressions come back with the right set of keys (#8854)"
    (is (=? {:name                       "discount_price"
             :display-name               "discount_price"
             :base-type                  :type/Float
             ::result-metadata/source    :fields
             ::result-metadata/field-ref [:expression "discount_price"]}
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
        (is (=? [{:base-type                  :type/Float
                  :name                       "expression"
                  :display-name               "0.9 × Average of Price"
                  ::result-metadata/source    :aggregation
                  ::result-metadata/field-ref [:aggregation 0]}
                 {:base-type                  :type/Float
                  :name                       "expression_2"
                  :display-name               "0.8 × Average of Price"
                  ::result-metadata/source    :aggregation
                  ::result-metadata/field-ref [:aggregation 1]}]
                (column-info query {:cols [{} {}]})))))))

(deftest ^:parallel deduplicate-expression-names-test-2
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "named :expressions"
      (let [query (lib/query
                   meta/metadata-provider
                   (lib.tu.macros/mbql-query users
                     {:expressions {:prev_month [:+ $last-login [:interval -1 :month]]}
                      :fields      [[:expression "prev_month"]], :limit 10}))]
        (is (=? [{:name                       "prev_month"
                  :display-name               "prev_month"
                  :base-type                  :type/Temporal
                  ::result-metadata/source    :fields
                  ::result-metadata/field-ref [:expression "prev_month"]}]
                (column-info query {:cols [{}]})))))))

;;; adapted from [[metabase.query-processor.nested-queries-test/breakout-year-test]]
(deftest ^:parallel breakout-year-test
  (testing (str "make sure when doing a nested query we give you metadata that would suggest you should be able to "
                "break out a *YEAR*")
    (let [source-query         (lib.tu.macros/mbql-query checkins
                                 {:aggregation [[:count]]
                                  :breakout    [!year.date]})
          metadata-provider    (lib.tu/metadata-provider-with-cards-for-queries
                                meta/metadata-provider
                                [source-query])
          [date-col count-col] (for [col (result-metadata/returned-columns (lib/query meta/metadata-provider source-query))]
                                 (as-> col col
                                   (assoc col ::result-metadata/source :fields)
                                   (dissoc col :position)
                                   (m/filter-keys simple-keyword? col)))]
      ;; since the bucketing is happening in the source query rather than at this level, the field ref should
      ;; return temporal unit `:default` rather than the upstream bucketing unit. You wouldn't want to re-apply
      ;; the `:year` bucketing if you used this query in another subsequent query, so the field ref doesn't
      ;; include the unit; however `:unit` is still `:year` so the frontend can use the correct formatting to
      ;; display values of the column.
      (is (=? [(assoc date-col  ::result-metadata/field-ref [:field (meta/id :checkins :date) nil], :unit :year)
               (assoc count-col ::result-metadata/field-ref [:field "count" {:base-type :type/Integer}])]
              (result-metadata/returned-columns
               (lib/query metadata-provider (lib.metadata/card metadata-provider 1))))))))

(deftest ^:parallel flow-semantic-types-test
  (testing "results should include semantic types from source models"
    (let [mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:cards [{:id            1
                        :name          "Base"
                        :database-id   (meta/id)
                        :dataset-query (lib.tu.macros/mbql-query orders
                                         {:expressions  {"Tax Rate" [:/
                                                                     [:field (meta/id :orders :tax) {:base-type :type/Float}]
                                                                     [:field (meta/id :orders :total) {:base-type :type/Float}]]}
                                          :fields       [[:field (meta/id :orders :tax) {:base-type :type/Float}]
                                                         [:field (meta/id :orders :total) {:base-type :type/Float}]
                                                         [:expression "Tax Rate"]]
                                          :limit        10})}
                       {:id              2
                        :name            "Model"
                        :type            :model
                        :database-id     (meta/id)
                        :dataset-query   {:type     :query
                                          :database (meta/id)
                                          :query    {:source-table "card__1"}}
                        :result-metadata [{:name         "TAX"
                                           :display_name "Tax"
                                           :base_type    :type/Float}
                                          {:name         "TOTAL"
                                           :display_name "Total"
                                           :base_type    :type/Float}
                                          {:name          "Tax Rate"
                                           :display_name  "Tax Rate"
                                           :base_type     :type/Float
                                           :semantic_type :type/Percentage
                                           :field_ref     [:field "Tax Rate" {:base-type :type/Float}]}]}
                       {:id            3
                        :name          "Q3"
                        :database-id   (meta/id)
                        :dataset-query {:type     :query
                                        :database (meta/id)
                                        :query    {:source-table "card__2"}}}]})]
      (is (= [{:name "TAX"}
              {:name "TOTAL"}
              {:name "Tax Rate", :semantic-type :type/Percentage}]
             (map #(select-keys % [:name :semantic-type])
                  (result-metadata/returned-columns (lib/query mp (:dataset-query (lib.metadata/card mp 3)))))
             (map #(select-keys % [:name :semantic-type])
                  (result-metadata/returned-columns (lib/query mp (lib.metadata/card mp 3)))))))))

(deftest ^:parallel remapped-columns-in-joined-source-queries-test
  (testing "Remapped columns in joined source queries should work (#15578)"
    (let [mp    (lib.tu/remap-metadata-provider
                 meta/metadata-provider
                 (meta/id :orders :product-id) (meta/id :products :title))
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-query products
                   {:joins    [{:source-query {:source-table $$orders
                                               :breakout     [$orders.product-id]
                                               :aggregation  [[:sum $orders.quantity]]}
                                :alias        "Orders"
                                :condition    [:= $id &Orders.orders.product-id]
                                ;; we can get title since product-id is remapped to title
                                :fields       [&Orders.title
                                               &Orders.*sum/Integer]}]
                    :fields   [$title $category]
                    :order-by [[:asc $id]]
                    :limit    3}))]
      (is (= [["TITLE"    "TITLE"         "TITLE"    "Title"]                     ; products.title
              ["CATEGORY" "CATEGORY"      "CATEGORY" "Category"]                  ; products.category
              ["TITLE_2"  "Orders__TITLE" "TITLE"    "Orders → Title"]            ; orders.product-id -> products.title
              ["sum"      "Orders__sum"   "sum"      "Orders → Sum of Quantity"]] ; sum(orders.quantity)
             (map (juxt :name :lib/desired-column-alias :lib/source-column-alias :display-name) (result-metadata/returned-columns query))))
      (testing "with disable-remaps option in the middleware"
        (is (= [["TITLE"    "TITLE"         "TITLE"    "Title"]
                ["CATEGORY" "CATEGORY"      "CATEGORY" "Category"]
                ;; orders.title should get excluded since it is invalid without remaps being in play.
                ["sum"      "Orders__sum"   "sum"      "Orders → Sum of Quantity"]]
               (map (juxt :name :lib/desired-column-alias :lib/source-column-alias :display-name)
                    (result-metadata/returned-columns
                     (assoc-in query [:middleware :disable-remaps?] true)))))))))

(deftest ^:parallel correct-legacy-refs-test
  (testing "broken field refs should use names if they used names in the source query, regardless of whether it makes sense"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query orders
                   {:source-query {:source-query {:source-table $$orders
                                                  :aggregation  [[:sum $total]]
                                                  :breakout     [!day.created-at
                                                                 $product-id->products.title
                                                                 $product-id->products.category]}
                                   :aggregation  [[:sum *sum/Float]]
                                   :breakout     [*TITLE/Text]}
                    :filter       [:> *sum/Float 100]}))]
      ;; this should return a field literal ref because that's what we used in the query, even if that's not technically
      ;; correct.
      (is (= [[:field "TITLE" {:base-type :type/Text}]
              [:field "sum"   {:base-type :type/Float}]]
             (map ::result-metadata/field-ref (result-metadata/returned-columns query)))))))

(deftest ^:parallel mbql-query-type-inference-test
  (testing "should add decent base/effective types if driver comes back with `:base-type :type/*`"
    (doseq [initial-metadata [{:name "a"}
                              {:name "a", :base-type :type/*}
                              {:name "a", :base-type :type/*, :effective-type :type/*}
                              {:name "a", :base-type :type/Integer}]
            :let             [expected-base-type (if (= (:base-type initial-metadata) :type/Integer)
                                       ;; if the initial driver type comes back as something other than `:type/*`, we
                                       ;; should use that. Otherwise if it comes back as `:type/*` use the type
                                       ;; calculated by Lib.
                                                   :type/Integer
                                                   :type/BigInteger)]]
      ;; should work with and without rows
      (testing (lib.util/format "\ninitial-metadata = %s" (pr-str initial-metadata))
        (is (=? [{:name                       "ID"
                  :display-name               "ID"
                  :base-type                  expected-base-type
                  :effective-type             expected-base-type
                  ::result-metadata/source    :fields
                  ::result-metadata/field-ref [:field (meta/id :venues :id) nil]}]
                (column-info
                 (lib/query meta/metadata-provider (lib.tu.macros/mbql-query venues
                                                     {:fields [$id]}))
                 {:cols [initial-metadata]})))))))

(deftest ^:parallel native-column-info-test
  (testing "native column info"
    (testing "should disambiguate duplicate names"
      (doseq [rows  [[]
                     [[1 nil]]]
              query [{:type :native, :native {:query "SELECT *"}}
                     {:type :query, :query {:source-query {:native "SELECT *"}}}]]
        (testing (lib.util/format "\nrows = %s,query = %s" (pr-str rows) (pr-str query))
          (is (=? [{:name                       "a"
                    :display-name               "a"
                    :base-type                  :type/Integer
                    ::result-metadata/source    :native
                    ::result-metadata/field-ref [:field "a" {:base-type :type/Integer}]}
                   {:name                       "a_2"
                    :display-name               "a"
                    :base-type                  :type/Integer
                    ::result-metadata/source    :native
                    ::result-metadata/field-ref [:field "a_2" {:base-type :type/Integer}]}]
                  (column-info
                   (lib/query meta/metadata-provider query)
                   {:cols [{:name "a" :base_type :type/Integer} {:name "a" :base_type :type/Integer}]}))))))))

;;; adapted from parameters/utils/targets > getParameterColumns > unit of time parameter > question > date breakouts
;;; in multiple stages - returns date column from the last stage only
(deftest ^:parallel display-name-for-columns-with-multiple-date-buckets-test
  (testing "the display name should only append the most recent date bucketing unit"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/count))
                    (as-> query (lib/breakout query (-> (m/find-first #(= (:id %) (meta/id :orders :created-at))
                                                                      (lib/breakoutable-columns query))
                                                        (lib/with-temporal-bucket :month))))
                    lib/append-stage
                    (as-> query (lib/breakout query (-> (m/find-first #(= (:id %) (meta/id :orders :created-at))
                                                                      (lib/breakoutable-columns query))
                                                        (lib/with-temporal-bucket :year)))))]
      (binding [lib.metadata.calculation/*display-name-style* :long]
        (is (=? [{:base-type                                  :type/DateTimeWithLocalTZ
                  :display-name                               "Created At: Year"
                  :effective-type                             :type/Integer
                  ;; additional keys in field ref are WRONG
                  ::result-metadata/field-ref                 [:field "CREATED_AT" (partial = {:base-type     :type/DateTimeWithLocalTZ
                                                                                               :temporal-unit :year})]
                  :id                                         (meta/id :orders :created-at)
                  :inherited-temporal-unit                    :year
                  :name                                       "CREATED_AT"
                  :semantic-type                              :type/CreationTimestamp
                  ::result-metadata/source                    :breakout
                  :table-id                                   (meta/id :orders)
                  :unit                                       :year
                  :lib/deduplicated-name                      "CREATED_AT"
                  :lib/desired-column-alias                   "CREATED_AT"
                  :lib/original-display-name                  "Created At"
                  :lib/original-name                          "CREATED_AT"
                  :lib/source                                 :source/previous-stage
                  :lib/breakout?                              true
                  :lib/source-column-alias                    "CREATED_AT"
                  :lib/type                                   :metadata/column
                  :metabase.lib.field/original-effective-type :type/DateTimeWithLocalTZ
                  :metabase.lib.field/temporal-unit           :year}]
                (column-info query {})))))))

(deftest ^:parallel preserve-edited-metadata-test
  (testing "Cards preserve their edited metadata"
    (let [query                    (lib/query
                                    meta/metadata-provider
                                    {:database (meta/id)
                                     :type     :query
                                     :query    {:source-table (meta/id :venues)}})
          cols                     (result-metadata/returned-columns query)
          base-type->semantic-type (fn [base-type]
                                     (condp #(isa? %2 %1) base-type
                                       :type/Integer :type/Quantity
                                       :type/Float   :type/Cost
                                       :type/Text    :type/Name
                                       base-type))
          user-edited              (for [col cols]
                                     (assoc col
                                            :description   "user description"
                                            :display-name  "user display name"
                                            :semantic-type (base-type->semantic-type (:base-type col))))]
      (testing "respect :metadata/model-metadata"
        (let [query (-> query
                        (assoc-in [:info :metadata/model-metadata] user-edited))]
          (is (=? [{:name "ID",          :description "user description", :display-name "user display name", :semantic-type :type/Quantity}
                   {:name "NAME",        :description "user description", :display-name "user display name", :semantic-type :type/Name}
                   {:name "CATEGORY_ID", :description "user description", :display-name "user display name", :semantic-type :type/Quantity}
                   {:name "LATITUDE",    :description "user description", :display-name "user display name", :semantic-type :type/Cost}
                   {:name "LONGITUDE",   :description "user description", :display-name "user display name", :semantic-type :type/Cost}
                   {:name "PRICE",       :description "user description", :display-name "user display name", :semantic-type :type/Quantity}]
                  (result-metadata/returned-columns query))))))))

(deftest ^:parallel model-metadata-id-preservation-test
  (testing "Model metadata :id handling based on query type (#67680)"
    (testing "MBQL query: stale :id from model metadata should be ignored"
      ;; When a model's source table changes, result_metadata may have stale :id values
      ;; pointing to the old table. These should NOT override the :id from query analysis.
      (let [query                     (lib/query meta/metadata-provider
                                                 {:database (meta/id)
                                                  :type     :query
                                                  :query    {:source-table (meta/id :venues)}})
            ;; Get the real columns to use as a base
            real-cols                 (result-metadata/returned-columns query)
            real-id                   (:id (first real-cols))
            ;; Create "stale" model metadata with wrong :id values (pointing to ORDERS instead of VENUES)
            stale-model-metadata      (for [col real-cols]
                                        {:name          (:name col)
                                         :display_name  (:display-name col)
                                         :base_type     (:base-type col)
                                         :semantic_type (:semantic-type col)
                                         :id            (meta/id :orders :id)
                                         :table_id      (meta/id :orders)})
            ;; Add stale metadata to query
            query-with-stale-metadata (assoc-in query [:info :metadata/model-metadata] stale-model-metadata)
            result-cols               (result-metadata/returned-columns query-with-stale-metadata)]
        (is (= real-id (:id (first result-cols)))
            "MBQL models should use :id from query analysis, not stale model metadata")))
    (testing "Native query: :id from model metadata should be preserved"
      ;; Native queries have no field references to analyze, so user-mapped :id values
      ;; from model metadata are the only source of field linkage and must be preserved.
      (let [native-query         (lib/native-query meta/metadata-provider "SELECT * FROM venues")
            ;; User-mapped model metadata with explicit :id values
            user-mapped-metadata [{:name         "ID"
                                   :display_name "Venue ID"
                                   :base_type    :type/BigInteger
                                   :id           (meta/id :venues :id)
                                   :table_id     (meta/id :venues)}]
            query-with-metadata  (assoc-in native-query [:info :metadata/model-metadata] user-mapped-metadata)
            result-cols          (result-metadata/returned-columns query-with-metadata)]
        (is (= (meta/id :venues :id) (:id (first result-cols)))
            "Native models should preserve :id from model metadata (user mappings)")))))

(deftest ^:parallel propagate-binning-test
  (testing "Test this stuff the same way this stuff is tested in the Cypress e2e notebook tests"
    (let [mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:cards [{:id            1
                        :name          "Q1"
                        :dataset-query (lib.tu.macros/mbql-query orders
                                         {:aggregation [[:count]]
                                          :breakout    [[:field %total {:binning {:strategy :num-bins, :num-bins 10}}]
                                                        [:field %total {:binning {:strategy :num-bins, :num-bins 50}}]]})}]})]
      (is (=? [{:display-name         "Total: 10 bins"
                :lib/original-binning {:strategy :num-bins, :num-bins 10}
                :binning-info         {:binning-strategy :num-bins, :strategy :num-bins, :num-bins 10}}
               {:display-name         "Total: 50 bins"
                :lib/original-binning {:strategy :num-bins, :num-bins 50}
                :binning-info         {:binning-strategy :num-bins, :strategy :num-bins, :num-bins 50}}
               {:display-name "Count"}]
              (-> (lib/query mp (lib.metadata/card mp 1))
                  (lib/aggregate (lib/count))
                  (lib.tu.notebook/add-breakout {:name "Q1"} {:display-name "Total: 10 bins"} {})
                  (lib.tu.notebook/add-breakout {:name "Q1"} {:display-name "Total: 50 bins"} {})
                  result-metadata/returned-columns))))))

(deftest ^:parallel propagate-bucketing-test
  (testing "Test this stuff the same way this stuff is tested in the Cypress e2e notebook tests"
    (let [mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:cards [{:id            1
                        :name          "Q1"
                        :dataset-query (lib.tu.macros/mbql-query orders
                                         {:aggregation [[:count]]
                                          :breakout    [[:field %created-at {:temporal-unit :month}]
                                                        [:field %created-at {:temporal-unit :year}]]})}]})]
      (is (=? [{:display-name "Created At: Month"
                :unit         :month}
               {:display-name "Created At: Year"
                :unit         :year}
               {:display-name "Count"}]
              (-> (lib/query mp (lib.metadata/card mp 1))
                  lib/append-stage
                  (lib/aggregate (lib/count))
                  (lib.tu.notebook/add-breakout {:display-name "Summaries"} {:display-name "Created At: Month"} {})
                  (lib.tu.notebook/add-breakout {:display-name "Summaries"} {:display-name "Created At: Year"} {})
                  result-metadata/returned-columns))))))

(deftest ^:parallel display-name-for-implicitly-joined-columns-test
  (let [query (lib/query
               meta/metadata-provider
               {:lib/type :mbql/query
                :database (meta/id)
                :stages   [{:lib/type     :mbql.stage/mbql
                            :source-table (meta/id :orders)
                            :joins        [{:lib/type            :mbql/join
                                            :qp/is-implicit-join true
                                            :stages              [{:lib/type     :mbql.stage/mbql
                                                                   :source-table (meta/id :products)}]
                                            :alias               "PRODUCTS__via__PRODUCT_ID"
                                            :strategy            :left-join
                                            :conditions          [[:=
                                                                   {}
                                                                   [:field {}
                                                                    (meta/id :orders :product-id)]
                                                                   [:field {:join-alias "PRODUCTS__via__PRODUCT_ID"}
                                                                    (meta/id :products :id)]]]
                                            :lib/options         {:lib/uuid "14b26511-68b9-48d6-9968-b115a5089009"}
                                            :fk-field-id         (meta/id :orders :product-id)}]
                            :aggregation  [[:count {:lib/uuid "3a14967e-bd6c-4cdd-a837-b6d098ef513b", :name "count"}]
                                           [:sum {:name "sum"}
                                            [:field {}
                                             (meta/id :orders :total)]]
                                           [:avg {:name "avg"}
                                            [:field {}
                                             (meta/id :orders :quantity)]]]
                            :breakout     [[:field {:source-field (meta/id :orders :product-id)
                                                    :join-alias   "PRODUCTS__via__PRODUCT_ID"}
                                            (meta/id :products :rating)]
                                           [:field {:source-field (meta/id :orders :product-id)
                                                    :join-alias   "PRODUCTS__via__PRODUCT_ID"}
                                            (meta/id :products :category)]]}]})]
    (is (= ["Product → Rating"
            "Product → Category"
            "Count"
            "Sum of Total" "Average of Quantity"]
           (map :display-name (result-metadata/returned-columns query))))))

(deftest ^:parallel return-correct-deduplicated-names-test
  (testing "Deduplicated names from previous stage should be preserved even when excluding certain fields"
    ;; e.g. a field called CREATED_AT_2 in the previous stage should continue to be called that. See ;; see
    ;; https://metaboat.slack.com/archives/C0645JP1W81/p1750961267171999
    (let [query (-> (lib/query
                     meta/metadata-provider
                     (lib.tu.macros/mbql-query orders
                       {:source-query {:source-table $$orders
                                       :aggregation  [[:count]]
                                       :breakout     [[:field %created-at {:base-type :type/DateTime, :temporal-unit :year}]
                                                      [:field %created-at {:base-type :type/DateTime, :temporal-unit :month}]]}
                        :filter       [:>
                                       [:field "count" {:base-type :type/Integer}]
                                       0]}))
                    lib/append-stage
                    lib/append-stage
                    (as-> query (lib/remove-field query -1 (first (lib/fieldable-columns query -1)))))]
      (is (=? [{:name "CREATED_AT_2", :display-name "Created At: Month", ::result-metadata/field-ref [:field "CREATED_AT_2" {}]}
               {:name "count", :display-name "Count", ::result-metadata/field-ref [:field "count" {}]}]
              (result-metadata/returned-columns query))))))

(deftest ^:parallel deduplicate-field-refs-test
  (testing "Don't return duplicate field refs, force deduplicated-name when they are ambiguous (QUE-1623)"
    (let [cols [(-> (meta/field-metadata :venues :id)
                    (assoc :lib/source :source/previous-stage
                           ::result-metadata/field-ref  [:field (meta/id :venues :id) nil]))
                (-> (meta/field-metadata :venues :name)
                    (assoc :lib/source               :source/joins
                           ::result-metadata/field-ref                [:field (meta/id :venues :name) nil]
                           :metabase.lib.join/join-alias "v1"
                           :lib/source-column-alias      "NAME"
                           :lib/desired-column-alias     "v1__NAME"))
                (-> (meta/field-metadata :venues :name)
                    (assoc :lib/source               :source/joins
                           ::result-metadata/field-ref                [:field (meta/id :venues :name) nil]
                           :metabase.lib.join/join-alias "v2"
                           :lib/source-column-alias      "NAME"
                           :lib/desired-column-alias     "v2__NAME"))]
          cols (lib.field.util/add-deduplicated-names cols)]
      (is (=? [[:field (meta/id :venues :id) nil]
               [:field "NAME"   {}]
               [:field "NAME_2" {}]]
              (map ::result-metadata/field-ref (#'result-metadata/deduplicate-field-refs cols)))))))

(deftest ^:parallel remove-namespaced-options-test
  (are [clause expected] (= expected
                            (#'result-metadata/remove-namespaced-options clause))
    [:field 1 {::namespaced true}]                [:field 1 nil]
    [:field 1 {::namespaced true, :a 1}]          [:field 1 {:a 1}]
    [:expression "wow"]                           [:expression "wow"]
    [:expression "wow" {::namespaced true}]       [:expression "wow"]
    [:expression "wow" {::namespaced true, :a 1}] [:expression "wow" {:a 1}]
    [:aggregation 0]                              [:aggregation 0]
    [:aggregation 0 {::namespaced true}]          [:aggregation 0]
    [:aggregation 0 {::namespaced true, :a 1}]    [:aggregation 0 {:a 1}]))

(deftest ^:parallel always-include-desired-column-alias-test
  (testing "Populate source and desired column aliases for native queries without stage metadata"
    (let [query        (lib/native-query meta/metadata-provider "SELECT 1;")
          initial-cols [{:base-type :type/Integer, :name "x"}
                        {:base-type :type/Integer, :name "y"}
                        {:base-type :type/Integer, :name "z"}
                        {:base-type :type/Integer, :name "x"}
                        ;; do not truncate really long aliases coming back from native queries, if the native query
                        ;; returned it then presumably it's ok with the database that ran the query and we need to use
                        ;; the original name to refer back to it in subsequent stages.
                        {:base-type :type/Integer, :name "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"}
                        {:base-type :type/Integer, :name "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"}]]
      (is (=? [{:lib/source-column-alias  "x"
                :lib/desired-column-alias "x"}
               {:lib/source-column-alias  "y"
                :lib/desired-column-alias "y"}
               {:lib/source-column-alias  "z"
                :lib/desired-column-alias "z"}
               {:lib/source-column-alias  "x"
                :lib/desired-column-alias "x_2"}
               {:lib/source-column-alias  "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
                :lib/desired-column-alias "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"}
               {:lib/source-column-alias  "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
                :lib/desired-column-alias "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count_2"}]
              (map #(select-keys % [:lib/source-column-alias :lib/desired-column-alias])
                   (result-metadata/returned-columns query initial-cols)))))))
