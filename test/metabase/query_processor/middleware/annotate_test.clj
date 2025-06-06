(ns ^:mb/driver-tests metabase.query-processor.middleware.annotate-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn- add-column-info
  ([query metadata]
   (add-column-info query metadata []))

  ([query    :- :map
    metadata :- ::annotate/metadata
    rows     :- [:maybe [:sequential [:sequential :any]]]]
   (letfn [(rff [metadata]
             (fn rf
               ([]
                {:data metadata})
               ([results]
                (:data results))
               ([results row]
                (update-in results [:data :rows] (fn [rows]
                                                   (conj (or rows []) row))))))]
     (driver/with-driver :h2
       (let [rff' (annotate/add-column-info query rff)
             rf   (rff' metadata)]
         (transduce identity rf rows))))))

(deftest ^:parallel native-column-info-test
  (testing "native column info"
    (testing "should still infer types even if the initial value(s) are `nil` (#4256, #6924)"
      (is (= [:type/Integer]
             (transduce identity (#'annotate/base-type-inferer {:cols [{}]})
                        (concat (repeat 1000 [nil]) [[1] [2]])))))))

(deftest ^:parallel native-column-info-test-2
  (testing "native column info"
    (testing "should use default `base_type` of `type/*` if there are no non-nil values in the sample"
      (is (= [:type/*]
             (transduce identity (#'annotate/base-type-inferer {:cols [{}]})
                        [[nil]]))))))

(deftest ^:parallel native-column-info-test-3
  (testing "native column info"
    (testing "should attempt to infer better base type if driver returns :type/* (#12150)"
      ;; `merged-column-info` handles merging info returned by driver & inferred by annotate
      (is (= [:type/Integer]
             (transduce identity (#'annotate/base-type-inferer {:cols [{:base_type :type/*}]})
                        [[1] [2] [nil] [3]]))))))

(defn- column-info [query {:keys [rows], :as metadata}]
  (let [metadata (cond-> metadata
                   (and (seq (:columns metadata))
                        (empty? (:cols metadata)))
                   (assoc :cols []))]
    (-> (add-column-info query (dissoc metadata :rows) rows)
        :cols)))

(deftest ^:parallel native-column-info-test-4
  (testing "native column info"
    (testing "should disambiguate duplicate names"
      (doseq [rows [[]
                    [[1 nil]]]]
        ;; should work with and without rows
        (testing (format "\nrows = %s" (pr-str rows))
          (is (=? [{:name         "a"
                    :display_name "a"
                    :base_type    :type/Integer
                    :source       :native
                    :field_ref    [:field "a" {:base-type :type/Integer}]}
                   {:name         "a_2"
                    :display_name "a"
                    :base_type    :type/Integer
                    :source       :native
                    :field_ref    [:field "a_2" {:base-type :type/Integer}]}]
                  (column-info
                   (lib/query meta/metadata-provider {:type :native})
                   {:cols [{:name "a" :base_type :type/Integer} {:name "a" :base_type :type/Integer}]
                    :rows rows}))))))))

(deftest ^:parallel native-column-type-inferrence-test
  (testing "native column info should be able to infer types from rows if not provided by driver initial metadata"
    (doseq [[expected-base-type rows] {:type/*       []
                                       :type/Integer [[1 nil]]}]
      ;; should work with and without rows
      (testing (format "\nrows = %s" (pr-str rows))
        (is (=? [{:name         "a"
                  :display_name "a"
                  :base_type    expected-base-type
                  :source       :native
                  :field_ref    [:field "a" {:base-type expected-base-type}]}
                 {:name         "a_2"
                  :display_name "a"
                  :base_type    :type/*
                  :source       :native
                  :field_ref    [:field "a_2" {:base-type :type/*}]}]
                (column-info
                 (lib/query meta/metadata-provider {:type :native})
                 {:cols [{:name "a"} {:name "a"}]
                  :rows rows})))))))

(deftest ^:parallel col-info-field-ids-test
  (testing {:base-type "make sure columns are comming back the way we'd expect for :field clauses"}
    (lib.tu.macros/$ids venues
      (is (=? [{:source    :fields
                :field_ref $price}]
              (column-info
               (lib/query meta/metadata-provider (lib.tu.macros/mbql-query venues {:fields [$price]}))
               {:columns [:price], :cols [{}]}))))))

(deftest ^:parallel col-info-for-implicit-joins-test
  (lib.tu.macros/$ids venues
    (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk_field_id` "
                  "info about the source Field")
      (is (=? [{:fk_field_id  %category-id
                :source       :fields
                :field_ref    $category-id->categories.name
                ;; for whatever reason this is what the `annotate` middleware traditionally returns here, for
                ;; some reason we use the `:long` style inside aggregations and the `:default` style elsewhere
                ;; who knows why. See notes
                ;; on [[metabase.query-processor.middleware.annotate/col-info-for-aggregation-clause]]
                :display_name "Category → Name"}]
              (column-info
               (lib/query meta/metadata-provider {:type :query, :query {:source-table $$venues, :fields [$category-id->categories.name]}})
               {:columns [:name]}))))))

(deftest ^:parallel col-info-for-implicit-joins-aggregation-test
  (lib.tu.macros/$ids venues
    (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk_field_id` "
                  "info about the source Field")
      (is (=? [{:source       :aggregation
                :field_ref    [:aggregation 0]
                :display_name "Distinct values of Category → Name"}]
              (column-info
               (lib/query
                meta/metadata-provider
                {:type  :query
                 :query {:source-table $$venues
                         :aggregation  [[:distinct $category-id->categories.name]]}})
               {:columns [:name]}))))))

(deftest ^:parallel col-info-for-explicit-joins-with-fk-field-id-test
  (lib.tu.macros/$ids venues
    (testing (str "we should get `:fk_field_id` and information where possible when using joins; "
                  "display_name should include the display name of the FK field (for IMPLICIT JOINS)")
      (is (=? [{:display_name "Category → Name"
                :source       :fields
                :field_ref    [:field (meta/id :categories :name) {:join-alias "Category"}]}]
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
                  "`:field_ref` should be have only `:join-alias`, and no `:source-field`")
      (is (=? [{:display_name "Categories → Name"
                :source       :fields
                :field_ref    &Categories.categories.name}]
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
                :field_ref !month.price}]
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
                :base_type    :type/Number
                :display_name "Price: Month"
                :unit         :month
                :source       :fields
                :field_ref    !month.*price/Number}]
              (column-info
               (lib/query meta/metadata-provider
                          {:type :query, :query {:source-table (meta/id :venues)
                                                 :fields       [[:field "price" {:base-type :type/Number, :temporal-unit :month}]]}})
               {:columns [:price]}))))))

(deftest ^:parallel col-info-for-binning-strategy-test
  (testing "when binning strategy is used, include `:binning_info`"
    (is (=? [{:name         "price"
              :base_type    :type/Number
              :display_name "Price: Month"
              :unit         :month
              :source       :fields
              :binning_info {:num_bins 10, :bin_width 5, :min_value -100, :max_value 100, :binning_strategy :num-bins}
              :field_ref    [:field "price" {:base-type     :type/Number
                                             :temporal-unit :month
                                             :binning       {:strategy  :num-bins
                                                             :num-bins  10
                                                             :bin-width 5
                                                             :min-value -100
                                                             :max-value 100}}]
              :was_binned true}]
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
               :table_id          (meta/id :venues)
               ;; these two are a gross symptom. there's some tension. sometimes it makes sense to have an effective
               ;; type: the db type is different and we have a way to convert. Othertimes, it doesn't make sense:
               ;; when the info is inferred. the solution to this might be quite extensive renaming
               :coercion_strategy nil
               :name              "grandparent.parent"
               :settings          nil
               :field_ref         [:field 2 nil]
               :nfc_path          nil
               :parent_id         1
               :visibility_type   :normal
               ;; TODO -- not sure about this display name, seems like it's including parent twice -- Cam
               :display_name      "Grandparent: Grandparent: Parent"
               :base_type         :type/Text}
              (-> (add-column-info query {:cols [{}]})
                  :cols
                  first))))))

(deftest ^:parallel col-info-combine-grandparent-field-names-test
  (testing "nested-nested fields should include grandparent name (etc)"
    (let [metadata-provider child-parent-grandparent-metadata-provider
          query             (-> (lib/query metadata-provider (meta/table-metadata :venues))
                                (lib/with-fields [(lib.metadata/field metadata-provider 3)]))]
      (is (=? {:description       nil
               :table_id          (meta/id :venues)
               :coercion_strategy nil
               :name              "grandparent.parent.child"
               :settings          nil
               :field_ref         [:field 3 nil]
               :nfc_path          nil
               :parent_id         2
               :id                3
               :visibility_type   :normal
               ;; TODO -- not sure about this display name, seems like it's including parent twice -- Cam
               :display_name      "Grandparent: Parent: Grandparent: Parent: Child"
               :base_type         :type/Text}
              (-> (add-column-info query {:cols [{}]})
                  :cols
                  first))))))

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
               :display_name  "sum of User ID"
               :base_type     :type/Integer
               :field_ref     [:field "sum" {:base-type :type/Integer}]
               :semantic_type :type/FK}
              (-> (add-column-info query {:cols [{}]})
                  :cols
                  first))))))

(defn- expression-metadata [table expression-name expression]
  (let [query (as-> (lib/query meta/metadata-provider (meta/table-metadata table)) query
                (lib/expression query expression-name expression)
                (lib/with-fields query [(lib/expression-ref query expression-name)]))]
    (-> (add-column-info query {:cols [{}]})
        :cols
        first)))

(deftest ^:parallel col-info-expressions-test
  (testing "col info for an `expression` should work as expected"
    (is (=? {:base_type    :type/Integer
             :name         "double-price"
             :display_name "double-price"
             :field_ref    [:expression "double-price"]}
            (expression-metadata :venues "double-price" (lib/* (meta/field-metadata :venues :price) 2))))))

(deftest ^:parallel col-info-expressions-test-1b
  (testing "col info for a boolean `expression` should have the correct `base_type`"
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
        (is (=? {:base_type :type/Boolean}
                (expression-metadata :people "expression" (lib.convert/->pMBQL expression))))))))

(deftest ^:parallel col-info-expressions-test-2
  (testing "col-info for convert-timezone should have a `converted_timezone` property"
    (is (=? {:converted_timezone "Asia/Ho_Chi_Minh"
             :base_type          :type/DateTime
             :name               "last-login-converted"
             :display_name       "last-login-converted"
             :field_ref          [:expression "last-login-converted"]}
            (expression-metadata :users "last-login-converted" (lib/convert-timezone
                                                                (meta/field-metadata :users :last-login)
                                                                "Asia/Ho_Chi_Minh"
                                                                "UTC"))))))

(deftest ^:parallel col-info-expressions-test-2b
  (testing "col-info for convert-timezone should have a `converted_timezone` property"
    (is (=? {:converted_timezone "Asia/Ho_Chi_Minh"
             :base_type          :type/DateTime
             :name               "last-login-converted"
             :display_name       "last-login-converted"
             :field_ref          [:expression "last-login-converted"]}
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
     (-> (add-column-info query {:cols []})
         :cols
         first))))

(defn- aggregation-names
  [ag-clause]
  (-> (col-info-for-aggregation-clause ag-clause)
      (select-keys [:name :display_name])))

(deftest ^:parallel aggregation-names-test
  (testing "basic aggregations"
    (testing ":count"
      (is (= {:name "count", :display_name "Count"}
             (aggregation-names [:count]))))))

(deftest ^:parallel aggregation-names-test-2
  (testing "basic aggregations"
    (testing ":distinct"
      (is (= {:name "count", :display_name "Distinct values of ID"}
             (aggregation-names [:distinct [:field (meta/id :venues :id) nil]]))))))

(deftest ^:parallel aggregation-names-test-3
  (testing "basic aggregations"
    (testing ":sum"
      (is (= {:name "sum", :display_name "Sum of ID"}
             (aggregation-names [:sum [:field (meta/id :venues :id) nil]]))))))

(deftest ^:parallel aggregation-names-test-4
  (testing "expressions"
    (testing "simple expression"
      (is (= {:name "expression", :display_name "Count + 1"}
             (aggregation-names [:+ [:count] 1]))))))

(deftest ^:parallel aggregation-names-test-5
  (testing "expressions"
    (testing "expression with nested expressions"
      (is (= {:name "expression", :display_name "Min of ID + (2 × Average of Price)"}
             (aggregation-names
              [:+
               [:min [:field (meta/id :venues :id) nil]]
               [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]))))))

(deftest ^:parallel aggregation-names-test-6
  (testing "expressions"
    (testing "very complicated expression"
      (is (= {:name "expression", :display_name "Min of ID + (2 × Average of Price × 3 × (Max of Category ID - 4))"}
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
      (is (= {:name "generated_name", :display_name "User-specified Name"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (meta/id :venues :id) nil]] [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]
               {:name "generated_name", :display-name "User-specified Name"}]))))))

(deftest ^:parallel aggregation-names-test-8
  (testing "`aggregation-options`"
    (testing "`:name` only"
      (is (= {:name "generated_name", :display_name "Min of ID + (2 × Average of Price)"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (meta/id :venues :id) nil]] [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]
               {:name "generated_name"}]))))))

(deftest ^:parallel aggregation-names-test-9
  (testing "`aggregation-options`"
    (testing "`:display-name` only"
      (is (= {:name "expression", :display_name "User-specified Name"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (meta/id :venues :id) nil]] [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]
               {:display-name "User-specified Name"}]))))))

(deftest ^:parallel col-info-for-aggregation-clause-test
  (testing "basic aggregation clauses"
    (testing "`:count` (no field)"
      (is (=? {:base_type    :type/Float
               :name         "expression"
               :display_name "Count ÷ 2"}
              (col-info-for-aggregation-clause [:/ [:count] 2]))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-1b
  (testing "basic aggregation clauses"
    (testing "`:sum`"
      (is (=? {:base_type    :type/Integer
               :name         "sum"
               :display_name "Sum of Price + 1"}
              (lib.tu.macros/$ids venues
                (col-info-for-aggregation-clause [:sum [:+ $price 1]])))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-2
  (testing "`:aggregation-options`"
    (testing "`:name` and `:display-name`"
      (is (=? {:base_type     :type/Integer
               :settings      {:is_priceless true}
               :name          "sum_2"
               :display_name  "My custom name"}
              (lib.tu.macros/$ids venues
                (col-info-for-aggregation-clause
                 [:aggregation-options [:sum $price] {:name "sum_2", :display-name "My custom name"}])))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-2b
  (testing "`:aggregation-options`"
    (testing "`:name` only"
      (is (=? {:base_type     :type/Integer
               :settings      {:is_priceless true}
               :name          "sum_2"
               :display_name  "Sum of Price"}
              (lib.tu.macros/$ids venues
                (col-info-for-aggregation-clause [:aggregation-options [:sum $price] {:name "sum_2"}])))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-2c
  (testing "`:aggregation-options`"
    (testing "`:display-name` only"
      (is (=? {:base_type     :type/Integer
               :settings      {:is_priceless true}
               :name          "sum"
               :display_name  "My Custom Name"}
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
      (is (=? {:cols [{:display_name   "Total Events"
                       :base_type      :type/Float
                       :effective_type :type/Float
                       :source         :aggregation
                       :field_ref      [:aggregation 0]}]}
              (add-column-info
               query
               {:cols [{:display_name "Total Events", :base_type :type/Float}]}))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-4
  (testing "col info for an `expression` aggregation w/ a named expression should work as expected"
    (let [query (lib.tu.macros/mbql-query venues
                  {:expressions {"double-price" [:* $price 2]}
                   :aggregation [[:sum [:expression "double-price"]]]})]
      (is (=? {:base_type    :type/Integer
               :name         "sum"
               :display_name "Sum of double-price"}
              (lib.tu.macros/$ids venues
                (col-info-for-aggregation-clause
                 (lib/query meta/metadata-provider query)
                 [:sum [:expression "double-price"]])))))))

(defn- infered-col-type [expr]
  (let [metadata (expression-metadata :checkins "expression" (lib.convert/->pMBQL expr))]
    (select-keys metadata [:base_type :effective_type :semantic_type])))

(defn- expression-type
  [expr]
  ((some-fn :effective_type :base_type) (infered-col-type expr)))

(defn- infer [expr]
  (-> (lib/query
       meta/metadata-provider
       (lib.tu.macros/mbql-query venues
         {:expressions {"expr" expr}
          :expression-idents {"expr" "LbroONhJ5OWyvFCQB4zp3"}
          :fields [[:expression "expr"]]
          :limit 10}))
      (add-column-info {:cols [{}]})
      :cols
      first))

(deftest ^:parallel computed-columns-inference
  (testing "Coalesce"
    (testing "Uses the first clause"
      (testing "Gets the type information from the field"
        (is (=? {:name           "expr"
                 :source         :fields
                 :field_ref      [:expression "expr"]
                 :effective_type :type/Text
                 :display_name   "expr"
                 :base_type      :type/Text}
                (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])))
        (testing "Does not contain a field id in its analysis (#18513)"
          (is (false? (contains? (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])
                                 :id))))))))

(deftest ^:parallel computed-columns-inference-1b
  (testing "Coalesce"
    (testing "Uses the first clause"
      (testing "Gets the type information from the literal"
        (is (=? {:base_type    :type/Text
                 :name         "expr"
                 :display_name "expr"
                 :field_ref    [:expression "expr"]
                 :source       :fields}
                (infer [:coalesce "bar" [:field (meta/id :venues :name) nil]])))))))

(deftest ^:parallel computed-columns-inference-2
  (testing "Case"
    (testing "Uses first available type information"
      (testing "From a field"
        (is (=? {:name           "expr"
                 :source         :fields
                 :field_ref      [:expression "expr"]
                 :effective_type :type/Text
                 :display_name   "expr"
                 :base_type      :type/Text}
                (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])))
        (testing "does not contain a field id in its analysis (#17512)"
          (is (false?
               (contains? (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])
                          :id))))))))

(deftest ^:parallel computed-columns-inference-2b
  (testing "Case"
    (is (=? {:base_type :type/Text, :effective_type :type/Text}
            (infered-col-type [:case [[[:> [:field (meta/id :venues :price) nil] 2] "big"]]])))
    (is (=? {:base_type :type/Integer}
            (infered-col-type [:case [[[:> [:field (meta/id :venues :price) nil] 2]
                                       [:+ [:field (meta/id :venues :price) nil] 1]]]])))))

(deftest ^:parallel computed-columns-inference-2c
  (testing "Case"
    (testing "Make sure we skip nils when infering case return type"
      (is (=? {:base_type :type/Number}
              (infered-col-type [:case [[[:< [:field (meta/id :venues :price) nil] 10] [:value nil {:base_type :type/Number}]]
                                        [[:> [:field (meta/id :venues :price) nil] 2]  10]]]))))))

(deftest ^:parallel computed-columns-inference-2d
  (testing "Case"
    (is (=? {:base_type :type/Integer}
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
  (are [expr base-type] (=? {:base_type base-type}
                            (infered-col-type expr))
    [:datetime-add [:field (meta/id :checkins :date) nil] 2 :month]    :type/Date
    [:datetime-add [:field (meta/id :checkins :date) nil] 2 :hour]     :type/Date
    [:datetime-add [:field (meta/id :users :last-login) nil] 2 :month] :type/DateTime))

(deftest ^:parallel test-string-extracts
  (are [expr base-type] (=? {:base_type base-type}
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
      (is (=? {:cols
               [{:base_type      :type/Number
                 :effective_type :type/Number
                 :semantic_type :type/Quantity
                 :name          "count"
                 :display_name  "count"
                 :source        :aggregation
                 :field_ref     [:aggregation 0]}
                {:source       :aggregation
                 :name         "sum"
                 :display_name "sum"
                 :base_type    :type/Number
                 :effective_type :type/Number
                 :field_ref    [:aggregation 1]}
                {:base_type     :type/Number
                 :effective_type :type/Number
                 :semantic_type :type/Quantity
                 :name          "count_2"
                 :display_name  "count"
                 :source        :aggregation
                 :field_ref     [:aggregation 2]}
                {:base_type     :type/Number
                 :effective_type :type/Number
                 :semantic_type :type/Quantity
                 :name          "count_3"
                 :display_name  "count_2"
                 :source        :aggregation
                 :field_ref     [:aggregation 3]}]}
              (add-column-info
               query
               {:cols [{:name "count", :display_name "count", :base_type :type/Number}
                       {:name "sum", :display_name "sum", :base_type :type/Number}
                       {:name "count", :display_name "count", :base_type :type/Number}
                       {:name "count_2", :display_name "count_2", :base_type :type/Number}]}))))))

(deftest ^:parallel expressions-keys-test
  (testing "make sure expressions come back with the right set of keys (#8854)"
    (is (=? {:name            "discount_price"
             :display_name    "discount_price"
             :base_type       :type/Float
             :source          :fields
             :field_ref       [:expression "discount_price"]}
            (-> (add-column-info
                 (lib/query
                  meta/metadata-provider
                  (lib.tu.macros/mbql-query venues
                    {:expressions {"discount_price" [:* 0.9 $price]}
                     :expression-idents {"discount_price" "bdW6mQ49dxdMbC1CheUpt"}
                     :fields      [$name [:expression "discount_price"]]
                     :limit       10}))
                 {:cols [{} {}]})
                :cols
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
        (is (=? [{:base_type    :type/Float
                  :name         "expression"
                  :display_name "0.9 × Average of Price"
                  :source       :aggregation
                  :field_ref    [:aggregation 0]}
                 {:base_type    :type/Float
                  :name         "expression_2"
                  :display_name "0.8 × Average of Price"
                  :source       :aggregation
                  :field_ref    [:aggregation 1]}]
                (:cols (add-column-info query {:cols [{} {}]}))))))))

(deftest ^:parallel deduplicate-expression-names-test-2
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "named :expressions"
      (let [query (lib/query
                   meta/metadata-provider
                   (lib.tu.macros/mbql-query users
                     {:expressions {:prev_month [:+ $last-login [:interval -1 :month]]}
                      :fields      [[:expression "prev_month"]], :limit 10}))]
        (is (=? [{:name            "prev_month"
                  :display_name    "prev_month"
                  :base_type       :type/Temporal
                  :source          :fields
                  :field_ref       [:expression "prev_month"]}]
                (:cols (add-column-info query {:cols [{}]}))))))))

(deftest ^:parallel mbql-cols-nested-queries-test
  (testing "Should be able to infer MBQL columns with nested queries"
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [base-query (qp.preprocess/preprocess
                        (lib.tu.macros/mbql-query venues
                          {:joins [{:fields       :all
                                    :source-table $$categories
                                    :condition    [:= $category-id &c.categories.id]
                                    :alias        "c"}]}))
            join-ident (get-in base-query [:query :joins 0 :ident])]
        (doseq [level [0 1 2 3]
                :let [field (fn [field-key legacy-ref]
                              (let [metadata (meta/field-metadata :venues field-key)]
                                (-> metadata
                                    (select-keys [:id :name :ident])
                                    (assoc :field_ref (if (zero? level)
                                                        legacy-ref
                                                        [:field (:name metadata) {:base-type (:base-type metadata)}])))))]]
          (testing (format "%d level(s) of nesting" level)
            (let [nested-query (lib/query
                                (qp.store/metadata-provider)
                                (mt/nest-query base-query level))]
              (is (= (lib.tu.macros/$ids venues
                       [(field :id          $id)
                        (field :name        $name)
                        (field :category-id $category-id)
                        (field :latitude    $latitude)
                        (field :longitude   $longitude)
                        (field :price       $price)
                        {:name      "ID_2"
                         :id        %categories.id
                         :ident     (lib/explicitly-joined-ident (meta/ident :categories :id) join-ident)
                         :field_ref (if (zero? level)
                                      &c.categories.id
                                      [:field "c__ID" {:base-type :type/BigInteger}])}
                        {:name      "NAME_2"
                         :id        %categories.name
                         :ident     (lib/explicitly-joined-ident (meta/ident :categories :name) join-ident)
                         :field_ref (if (zero? level)
                                      &c.categories.name
                                      [:field "c__NAME" {:base-type :type/Text}])}])
                     (map #(select-keys % [:name :id :field_ref :ident])
                          (:cols (add-column-info nested-query {:cols []}))))))))))))

(deftest ^:parallel mbql-cols-nested-queries-test-2
  (testing "Aggregated question with source is an aggregated models should infer display_name correctly (#23248)"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [(lib.tu.macros/mbql-query products
                                         {:aggregation
                                          [[:aggregation-options
                                            [:sum $price]
                                            {:name "sum"}]
                                           [:aggregation-options
                                            [:max $rating]
                                            {:name "max"}]]
                                          :breakout     [$category]
                                          :order-by     [[:asc $category]]})])
      (let [query (lib/query
                   (qp.store/metadata-provider)
                   (qp.preprocess/preprocess
                    (lib.tu.macros/mbql-query nil
                      {:source-table "card__1"
                       :aggregation  [[:aggregation-options
                                       [:sum
                                        [:field
                                         "sum"
                                         {:base-type :type/Float}]]
                                       {:name "sum"}]
                                      [:aggregation-options
                                       [:count]
                                       {:name "count"}]]
                       :limit        1})))]
        (is (= ["Sum of Sum of Price" "Count"]
               (->> (add-column-info query {:cols [{} {}]})
                    :cols
                    (map :display_name))))))))

(deftest ^:parallel inception-test
  (testing "Should return correct metadata for an 'inception-style' nesting of source > source > source with a join (#14745)"
    ;; these tests look at the metadata for just one column so it's easier to spot the differences.
    (letfn [(ean-metadata [result]
              (as-> (:cols result) result
                (m/index-by :name result)
                (get result "EAN")
                (select-keys result [:name :display_name :base_type :semantic_type :id :field_ref])))]
      (qp.store/with-metadata-provider meta/metadata-provider
        (testing "Make sure metadata is correct for the 'EAN' column with"
          (let [base-query (qp.preprocess/preprocess
                            (lib.tu.macros/mbql-query orders
                              {:joins [{:fields       :all
                                        :source-table $$products
                                        :condition    [:= $product-id &Products.products.id]
                                        :alias        "Products"}]
                               :limit 10}))]
            (doseq [level (range 4)]
              (testing (format "%d level(s) of nesting" level)
                (let [nested-query (lib/query
                                    meta/metadata-provider
                                    (mt/nest-query base-query level))]
                  (testing (format "\nQuery = %s" (u/pprint-to-str nested-query))
                    (is (= (lib.tu.macros/$ids products
                             {:name          "EAN"
                              :display_name  "Products → Ean"
                              :base_type     :type/Text
                              :semantic_type nil
                              :id            %ean
                              :field_ref     (if (zero? level)
                                               &Products.ean
                                               [:field "Products__EAN" {:base-type :type/Text}])})
                           (ean-metadata (add-column-info nested-query {:cols []}))))))))))))))

(deftest ^:parallel col-info-for-fields-from-card-test
  (testing "when a nested query is from a saved question, there should be no `:join-alias` on the left side (#14787)"
    (let [card-1-query (lib.tu.macros/mbql-query orders
                         {:joins [{:fields       :all
                                   :source-table $$products
                                   :condition    [:= $product-id &Products.products.id]
                                   :alias        "Products"}]})]
      (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                        meta/metadata-provider
                                        [card-1-query
                                         (lib.tu.macros/mbql-query people)])
        (lib.tu.macros/$ids nil
          (let [base-query (lib/query
                            (qp.store/metadata-provider)
                            (qp.preprocess/preprocess
                             (lib.tu.macros/mbql-query nil
                               {:source-table "card__1"
                                :joins        [{:fields       :all
                                                :source-table "card__2"
                                                :condition    [:= $orders.user-id &Products.products.id]
                                                :alias        "Q"}]
                                :limit        1})))
                field-ids  #{%orders.discount %products.title %people.source}]
            (is (= [{:display_name "Discount"
                     :field_ref    [:field %orders.discount nil]}
                    {:display_name "Products → Title"
                     ;; this field comes from a join in the source card (previous stage) and thus SHOULD NOT include the
                     ;; join alias. TODO -- shouldn't we be referring to it by name and not ID? I think we're using ID
                     ;; for broken/legacy purposes -- Cam
                     :field_ref    [:field %products.title nil]}
                    {:display_name "Q → Source"
                     :field_ref    [:field %people.source {:join-alias "Q"}]}]
                   (->> (:cols (add-column-info base-query {:cols []}))
                        (filter #(field-ids (:id %)))
                        (map #(select-keys % [:display_name :field_ref])))))))))))

(deftest ^:parallel col-info-for-joined-fields-from-card-test
  (testing "Has the correct display names for joined fields from cards (#14787)"
    (letfn [(native [query] {:type     :native
                             :native   {:query query :template-tags {}}
                             :database (meta/id)})]
      (let [card1-eid (u/generate-nano-id)
            card2-eid (u/generate-nano-id)]
        (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                          meta/metadata-provider
                                          {:cards [{:id              1
                                                    :entity_id       card1-eid
                                                    :name            "Card 1"
                                                    :database-id     (meta/id)
                                                    :dataset-query   (native "select 'foo' as A_COLUMN")
                                                    :result-metadata [{:name         "A_COLUMN"
                                                                       :display_name "A Column"
                                                                       :base_type    :type/Text}]}
                                                   {:id              2
                                                    :entity_id       card2-eid
                                                    :name            "Card 2"
                                                    :database-id     (meta/id)
                                                    :dataset-query   (native "select 'foo' as B_COLUMN")
                                                    :result-metadata [{:name         "B_COLUMN"
                                                                       :display_name "B Column"
                                                                       :base_type    :type/Text}]}]})
          (let [query (lib.tu.macros/mbql-query nil
                        {:source-table "card__1"
                         :joins        [{:fields       "all"
                                         :source-table "card__2"
                                         :condition    [:=
                                                        [:field "A_COLUMN" {:base-type :type/Text}]
                                                        [:field "B_COLUMN" {:base-type  :type/Text
                                                                            :join-alias "alias"}]]
                                         :alias        "alias"}]})
                cols  (qp.preprocess/query->expected-cols query)]
            (is (=? [{}
                     {:display_name "alias → B Column"}]
                    cols)
                "cols has wrong display name")))))))

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
            (#'annotate/restore-original-join-aliases query)))))

(deftest ^:parallel preserve-original-join-alias-e2e-test
  (testing "The join alias for the `:field_ref` in results metadata should match the one originally specified (#27464)"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
      (let [join-alias "Products with a very long name - Product ID with a very long name"
            results    (mt/run-mbql-query orders
                         {:joins  [{:source-table $$products
                                    :condition    [:= $product_id [:field %products.id {:join-alias join-alias}]]
                                    :alias        join-alias
                                    :fields       [[:field %products.title {:join-alias join-alias}]]}]
                          :fields [$orders.id
                                   [:field %products.title {:join-alias join-alias}]]
                          :limit  4})]
        (doseq [[location metadata] {"data.cols"                     (mt/cols results)
                                     "data.results_metadata.columns" (get-in results [:data :results_metadata :columns])}]
          (testing location
            (is (=? (mt/$ids
                      [{:display_name "ID"
                        :field_ref    $orders.id}
                       {:display_name (str join-alias " → Title")
                        :field_ref    [:field %products.title {:join-alias join-alias}]}])
                    (map
                     #(select-keys % [:display_name :field_ref])
                     metadata)))))))))
