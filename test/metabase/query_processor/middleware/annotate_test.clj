(ns metabase.query-processor.middleware.annotate-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- add-column-info [query metadata]
  (letfn [(thunk []
            (driver/with-driver :h2
              ((annotate/add-column-info query identity) metadata)))]
    (if (qp.store/initialized?)
      (thunk)
      (qp.store/with-metadata-provider meta/metadata-provider
        (thunk)))))

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

(deftest ^:parallel native-column-info-test-4
  (testing "native column info"
    (testing "should disambiguate duplicate names"
      (qp.store/with-metadata-provider meta/metadata-provider
        (is (= [{:name "a", :display_name "a", :base_type :type/Integer, :source :native, :field_ref [:field "a" {:base-type :type/Integer}]}
                {:name "a", :display_name "a", :base_type :type/Integer, :source :native, :field_ref [:field "a_2" {:base-type :type/Integer}]}]
               (annotate/column-info
                {:type :native}
                {:cols [{:name "a" :base_type :type/Integer} {:name "a" :base_type :type/Integer}]
                 :rows [[1 nil]]})))))))

(deftest ^:parallel col-info-field-ids-test
  (testing {:base-type "make sure columns are comming back the way we'd expect for :field clauses"}
    (qp.store/with-metadata-provider meta/metadata-provider
      (lib.tu.macros/$ids venues
        (is (=? [{:source    :fields
                  :field_ref $price}]
                (annotate/column-info
                 {:type :query, :query {:fields [$price]}}
                 {:columns [:price]})))))))

(deftest ^:parallel col-info-for-implicit-joins-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (lib.tu.macros/$ids venues
      (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk_field_id` "
                    "info about the source Field")
        (is (=? [{:fk_field_id  %category-id
                  :source       :fields
                  :field_ref    $category-id->categories.name
                  ;; for whatever reason this is what the `annotate` middleware traditionally returns here, for
                  ;; some reason we use the `:long` style inside aggregations and the `:default` style elsewhere,
                  ;; who knows why. See notes
                  ;; on [[metabase.query-processor.middleware.annotate/col-info-for-aggregation-clause]]
                  :display_name "Name"}]
                (annotate/column-info
                 {:type :query, :query {:fields [$category-id->categories.name]}}
                 {:columns [:name]})))))))

(deftest ^:parallel col-info-for-implicit-joins-aggregation-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (lib.tu.macros/$ids venues
      (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk_field_id` "
                    "info about the source Field")
        (is (=? [{:source            :aggregation
                  :field_ref         [:aggregation 0]
                  :aggregation_index 0
                  :display_name      "Distinct values of Category → Name"}]
                (annotate/column-info
                 {:type  :query
                  :query {:source-table $$venues
                          :aggregation  [[:distinct $category-id->categories.name]]}}
                 {:columns [:name]})))))))

(deftest ^:parallel col-info-for-explicit-joins-with-fk-field-id-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (lib.tu.macros/$ids venues
      (testing (str "we should get `:fk_field_id` and information where possible when using joins; "
                    "display_name should include the display name of the FK field (for IMPLICIT JOINS)")
        (is (=? [{:display_name "Category → Name"
                  :source       :fields
                  :field_ref    $category-id->categories.name
                  :fk_field_id  %category-id
                  :source_alias "CATEGORIES__via__CATEGORY_ID"}]
                (annotate/column-info
                 {:type  :query
                  :query {:fields [&CATEGORIES__via__CATEGORY_ID.categories.name]
                          :joins  [{:alias        "CATEGORIES__via__CATEGORY_ID"
                                    :source-table $$venues
                                    :condition    [:= $category-id &CATEGORIES__via__CATEGORY_ID.categories.id]
                                    :strategy     :left-join
                                    :fk-field-id  %category-id}]}}
                 {:columns [:name]})))))))

(deftest ^:parallel col-info-for-explicit-joins-without-fk-field-id-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (lib.tu.macros/$ids venues
      (testing (str "for EXPLICIT JOINS (which do not include an `:fk-field-id` in the Join info) the returned "
                    "`:field_ref` should be have only `:join-alias`, and no `:source-field`")
        (is (=? [{:display_name "Categories → Name"
                  :source       :fields
                  :field_ref    &Categories.categories.name
                  :source_alias "Categories"}]
                (annotate/column-info
                 {:type  :query
                  :query {:fields [&Categories.categories.name]
                          :joins  [{:alias        "Categories"
                                    :source-table $$venues
                                    :condition    [:= $category-id &Categories.categories.id]
                                    :strategy     :left-join}]}}
                 {:columns [:name]})))))))

(deftest ^:parallel col-info-for-field-with-temporal-unit-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (lib.tu.macros/$ids venues
      (testing "when a `:field` with `:temporal-unit` is used, we should add in info about the `:unit`"
        (is (=? [{:unit      :month
                  :source    :fields
                  :field_ref !month.price}]
                (annotate/column-info
                 {:type :query, :query {:fields (lib.tu.macros/$ids venues [!month.price])}}
                 {:columns [:price]})))))))

(deftest ^:parallel col-info-for-field-literal-with-temporal-unit-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (lib.tu.macros/$ids venues
      (testing "datetime unit should work on field literals too"
        (is (= [{:name         "price"
                 :base_type    :type/Number
                 :display_name "Price"
                 :unit         :month
                 :source       :fields
                 :field_ref    !month.*price/Number}]
               (doall
                (annotate/column-info
                 {:type :query, :query {:fields [[:field "price" {:base-type :type/Number, :temporal-unit :month}]]}}
                 {:columns [:price]}))))))))

(deftest ^:parallel col-info-for-field-with-temporal-unit-from-nested-query-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing "should add the correct info if the Field originally comes from a nested query"
      (lib.tu.macros/$ids checkins
        (is (= [{:name "DATE", :unit :month, :field_ref [:field %date {:temporal-unit :default}]}
                {:name "LAST_LOGIN", :unit :month, :field_ref [:field
                                                               %users.last-login
                                                               {:temporal-unit :default
                                                                :join-alias    "USERS__via__USER_ID"}]}]
               (mapv
                (fn [col]
                  (select-keys col [:name :unit :field_ref]))
                (annotate/column-info
                 {:type  :query
                  :query {:source-query    {:source-table $$checkins
                                            :breakout     [[:field %date {:temporal-unit :month}]
                                                           [:field
                                                            %users.last-login
                                                            {:temporal-unit :month, :source-field %user-id}]]}
                          :source-metadata [{:name      "DATE"
                                             :id        %date
                                             :unit      :month
                                             :field_ref [:field %date {:temporal-unit :month}]}
                                            {:name      "LAST_LOGIN"
                                             :id        %users.last-login
                                             :unit      :month
                                             :field_ref [:field %users.last-login {:temporal-unit :month
                                                                                   :source-field  %user-id}]}]
                          :fields          [[:field %date {:temporal-unit :default}]
                                            [:field %users.last-login {:temporal-unit :default, :join-alias "USERS__via__USER_ID"}]]
                          :limit           1}}
                 nil))))))))

(deftest ^:parallel col-info-for-binning-strategy-test
  (testing "when binning strategy is used, include `:binning_info`"
    (is (= [{:name         "price"
             :base_type    :type/Number
             :display_name "Price"
             :unit         :month
             :source       :fields
             :binning_info {:num_bins 10, :bin_width 5, :min_value -100, :max_value 100, :binning_strategy :num-bins}
             :field_ref    [:field "price" {:base-type     :type/Number
                                            :temporal-unit :month
                                            :binning       {:strategy  :num-bins
                                                            :num-bins  10
                                                            :bin-width 5
                                                            :min-value -100
                                                            :max-value 100}}]}]
           (annotate/column-info
            {:type  :query
             :query {:fields [[:field "price" {:base-type     :type/Number
                                               :temporal-unit :month
                                               :binning       {:strategy  :num-bins
                                                               :num-bins  10
                                                               :bin-width 5
                                                               :min-value -100
                                                               :max-value 100}}]]}}
            {:columns [:price]})))))

(def ^:private child-parent-grandparent-metadata-provider
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:fields [(assoc (meta/field-metadata :venues :name)
                    :id            1
                    :name         "grandparent"
                    :display-name "Grandparent")
             (assoc (meta/field-metadata :venues :name)
                    :id            2
                    :name          "parent"
                    :display-name  "Parent"
                    :parent-id     1)
             (assoc (meta/field-metadata :venues :name)
                    :id           3
                    :name         "child"
                    :display-name "Child"
                    :parent-id    2)]}))

(deftest ^:parallel col-info-combine-parent-field-names-test
  (testing "For fields with parents we should return them with a combined name including parent's name"
    (qp.store/with-metadata-provider child-parent-grandparent-metadata-provider
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
               :id                2
               :visibility_type   :normal
               :display_name      "Parent"
               :base_type         :type/Text}
              (#'annotate/col-info-for-field-clause {} [:field 2 nil]))))))

(deftest ^:parallel col-info-combine-grandparent-field-names-test
  (testing "nested-nested fields should include grandparent name (etc)"
    (qp.store/with-metadata-provider child-parent-grandparent-metadata-provider
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
               :display_name      "Child"
               :base_type         :type/Text}
              (into {} (#'annotate/col-info-for-field-clause {} [:field 3 nil])))))))

(deftest ^:parallel col-info-field-literals-test
  (testing "field literals should get the information from the matching `:source-metadata` if it was supplied"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= {:name          "sum"
              :display_name  "sum of User ID"
              :base_type     :type/Integer
              :field_ref     [:field "sum" {:base-type :type/Integer}]
              :semantic_type :type/FK}
             (#'annotate/col-info-for-field-clause
              {:source-metadata
               [{:name "abc", :display_name "another Field", :base_type :type/Integer, :semantic_type :type/FK}
                {:name "sum", :display_name "sum of User ID", :base_type :type/Integer, :semantic_type :type/FK}]}
              [:field "sum" {:base-type :type/Integer}]))))))

(deftest ^:parallel col-info-expressions-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing "col info for an `expression` should work as expected"
      (is (= {:base_type       :type/Float
              :name            "double-price"
              :display_name    "double-price"
              :expression_name "double-price"
              :field_ref       [:expression "double-price"]}
             (lib.tu.macros/$ids venues
               (#'annotate/col-info-for-field-clause
                {:expressions {"double-price" [:* $price 2]}}
                [:expression "double-price"])))))))

(deftest ^:parallel col-info-expressions-test-2
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing "col-info for convert-timezone should have a `converted_timezone` property"
      (is (= {:converted_timezone "Asia/Ho_Chi_Minh",
              :base_type          :type/DateTime,
              :name               "last-login-converted",
              :display_name       "last-login-converted",
              :expression_name    "last-login-converted",
              :field_ref          [:expression "last-login-converted"]}
             (lib.tu.macros/$ids users
               (#'annotate/col-info-for-field-clause
                {:expressions {"last-login-converted" [:convert-timezone $last-login "Asia/Ho_Chi_Minh" "UTC"]}}
                [:expression "last-login-converted"]))))
      (is (= {:converted_timezone "Asia/Ho_Chi_Minh",
              :base_type          :type/DateTime,
              :name               "last-login-converted",
              :display_name       "last-login-converted",
              :expression_name    "last-login-converted",
              :field_ref          [:expression "last-login-converted"]}
             (lib.tu.macros/$ids users
               (#'annotate/col-info-for-field-clause
                {:expressions {"last-login-converted" [:datetime-add
                                                       [:convert-timezone $last-login "Asia/Ho_Chi_Minh" "UTC"] 2 :hour]}}
                [:expression "last-login-converted"])))))))

(deftest ^:parallel col-info-expressions-test-3
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing "if there is no matching expression it should give a meaningful error message"
      (is (= {:data    {:expression-name "double-price"
                        :tried           ["double-price" :double-price]
                        :found           #{"one-hundred"}
                        :type            :invalid-query}
              :message "No expression named 'double-price'"}
             (try
               (lib.tu.macros/$ids venues
                 (#'annotate/col-info-for-field-clause {:expressions {"one-hundred" 100}} [:expression "double-price"]))
               (catch Throwable e {:message (.getMessage e), :data (ex-data e)})))))))

;; test that added information about aggregations looks the way we'd expect
(defn- aggregation-names
  ([ag-clause]
   (aggregation-names {:source-table (meta/id :venues)} ag-clause))

  ([inner-query ag-clause]
   (binding [driver/*driver* :h2]
     (qp.store/with-metadata-provider meta/metadata-provider
       (select-keys (#'annotate/col-info-for-aggregation-clause inner-query ag-clause) [:name :display_name])))))

(deftest ^:parallel aggregation-names-test
  (testing "basic aggregations"
    (testing ":count"
      (is (= {:name "count", :display_name "Count"}
             (aggregation-names [:count]))))

    (testing ":distinct"
      (is (= {:name "count", :display_name "Distinct values of ID"}
             (aggregation-names [:distinct [:field (meta/id :venues :id) nil]]))))

    (testing ":sum"
      (is (= {:name "sum", :display_name "Sum of ID"}
             (aggregation-names [:sum [:field (meta/id :venues :id) nil]])))))

  (testing "expressions"
    (testing "simple expression"
      (is (= {:name "expression", :display_name "Count + 1"}
             (aggregation-names [:+ [:count] 1]))))

    (testing "expression with nested expressions"
      (is (= {:name "expression", :display_name "Min of ID + (2 × Average of Price)"}
             (aggregation-names
              [:+
               [:min [:field (meta/id :venues :id) nil]]
               [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]))))

    (testing "very complicated expression"
      (is (= {:name "expression", :display_name "Min of ID + (2 × Average of Price × 3 × (Max of Category ID - 4))"}
             (aggregation-names
              [:+
               [:min [:field (meta/id :venues :id) nil]]
               [:*
                2
                [:avg [:field (meta/id :venues :price) nil]]
                3
                [:- [:max [:field (meta/id :venues :category-id) nil]] 4]]])))))

  (testing "`aggregation-options`"
    (testing "`:name` and `:display-name`"
      (is (= {:name "generated_name", :display_name "User-specified Name"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (meta/id :venues :id) nil]] [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]
               {:name "generated_name", :display-name "User-specified Name"}]))))

    (testing "`:name` only"
      (is (= {:name "generated_name", :display_name "Min of ID + (2 × Average of Price)"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (meta/id :venues :id) nil]] [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]
               {:name "generated_name"}]))))

    (testing "`:display-name` only"
      (is (= {:name "expression", :display_name "User-specified Name"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (meta/id :venues :id) nil]] [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]
               {:display-name "User-specified Name"}]))))))

(defn- col-info-for-aggregation-clause
  ([clause]
   (col-info-for-aggregation-clause {:source-table (meta/id :venues)} clause))

  ([inner-query clause]
   (binding [driver/*driver* :h2]
     (#'annotate/col-info-for-aggregation-clause inner-query clause))))

(deftest ^:parallel col-info-for-aggregation-clause-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing "basic aggregation clauses"
      (testing "`:count` (no field)"
        (is (=? {:base_type :type/Float, :name "expression", :display_name "Count ÷ 2"}
                (col-info-for-aggregation-clause [:/ [:count] 2]))))
      (testing "`:sum`"
        (is (=? {:base_type :type/Integer, :name "sum", :display_name "Sum of Price + 1"}
                (lib.tu.macros/$ids venues
                  (col-info-for-aggregation-clause [:sum [:+ $price 1]]))))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-2
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing "`:aggregation-options`"
      (testing "`:name` and `:display-name`"
        (is (=? {:base_type     :type/Integer
                 :settings      {:is_priceless true}
                 :name          "sum_2"
                 :display_name  "My custom name"}
                (lib.tu.macros/$ids venues
                  (col-info-for-aggregation-clause
                   [:aggregation-options [:sum $price] {:name "sum_2", :display-name "My custom name"}])))))
      (testing "`:name` only"
        (is (=? {:base_type     :type/Integer
                 :settings      {:is_priceless true}
                 :name          "sum_2"
                 :display_name  "Sum of Price"}
                (lib.tu.macros/$ids venues
                  (col-info-for-aggregation-clause [:aggregation-options [:sum $price] {:name "sum_2"}])))))
      (testing "`:display-name` only"
        (is (=? {:base_type     :type/Integer
                 :settings      {:is_priceless true}
                 :name          "sum"
                 :display_name  "My Custom Name"}
                (lib.tu.macros/$ids venues
                  (col-info-for-aggregation-clause
                   [:aggregation-options [:sum $price] {:display-name "My Custom Name"}]))))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-3
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing (str "if a driver is kind enough to supply us with some information about the `:cols` that come back, we "
                  "should include that information in the results. Their information should be preferred over ours")
      (is (=? {:cols [{:name           "metric"
                       :display_name   "Total Events"
                       :base_type      :type/Text
                       :effective_type :type/Text
                       :source         :aggregation
                       :field_ref      [:aggregation 0]}]}
              (add-column-info
               (lib.tu.macros/mbql-query venues {:aggregation [[:metric 1]]})
               {:cols [{:name "totalEvents", :display_name "Total Events", :base_type :type/Text}]}))))))

(deftest ^:parallel col-info-for-aggregation-clause-test-4
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing "col info for an `expression` aggregation w/ a named expression should work as expected"
      (is (=? {:base_type :type/Integer, :name "sum", :display_name "Sum of double-price"}
              (lib.tu.macros/$ids venues
                (col-info-for-aggregation-clause
                 {:source-table (meta/id :venues)
                  :expressions {"double-price" [:* $price 2]}}
                 [:sum [:expression "double-price"]])))))))

(defn- infered-col-type
  [expr]
  (-> (add-column-info (lib.tu.macros/mbql-query venues {:expressions {"expr" expr}
                                              :fields      [[:expression "expr"]]
                                              :limit       10})
                       {})
      :cols
      first
      (select-keys [:base_type :semantic_type])))

(deftest ^:parallel computed-columns-inference
  (letfn [(infer [expr] (-> (lib.tu.macros/mbql-query venues
                                           {:expressions {"expr" expr}
                                            :fields [[:expression "expr"]]
                                            :limit 10})
                            (add-column-info {})
                            :cols
                            first))]
    (testing "Coalesce"
      (testing "Uses the first clause"
        (testing "Gets the type information from the field"
          (is (= {:semantic_type :type/Name,
                  :coercion_strategy nil,
                  :name "expr",
                  :expression_name "expr",
                  :source :fields,
                  :field_ref [:expression "expr"],
                  :effective_type :type/Text,
                  :display_name "expr",
                  :base_type :type/Text}
                 (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])))
          (testing "Does not contain a field id in its analysis (#18513)"
            (is (false? (contains? (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])
                                   :id)))))
        (testing "Gets the type information from the literal"
          (is (= {:base_type :type/Text,
                  :name "expr",
                  :display_name "expr",
                  :expression_name "expr",
                  :field_ref [:expression "expr"],
                  :source :fields}
                 (infer [:coalesce "bar" [:field (meta/id :venues :name) nil]]))))))
    (testing "Case"
      (testing "Uses first available type information"
        (testing "From a field"
          (is (= {:semantic_type :type/Name,
                  :coercion_strategy nil,
                  :name "expr",
                  :expression_name "expr",
                  :source :fields,
                  :field_ref [:expression "expr"],
                  :effective_type :type/Text,
                  :display_name "expr",
                  :base_type :type/Text}
                 (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])))
          (testing "does not contain a field id in its analysis (#17512)"
            (is (false?
                 (contains? (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])
                            :id))))))
      (is (= {:base_type :type/Text}
             (infered-col-type [:case [[[:> [:field (meta/id :venues :price) nil] 2] "big"]]])))
      (is (= {:base_type :type/Float}
             (infered-col-type [:case [[[:> [:field (meta/id :venues :price) nil] 2]
                                        [:+ [:field (meta/id :venues :price) nil] 1]]]])))
      (testing "Make sure we skip nils when infering case return type"
        (is (= {:base_type :type/Number}
               (infered-col-type [:case [[[:< [:field (meta/id :venues :price) nil] 10] [:value nil {:base_type :type/Number}]]
                                         [[:> [:field (meta/id :venues :price) nil] 2] 10]]]))))
      (is (= {:base_type :type/Float}
             (infered-col-type [:case [[[:> [:field (meta/id :venues :price) nil] 2] [:+ [:field (meta/id :venues :price) nil] 1]]]]))))))

(deftest ^:parallel datetime-arithmetics?-test
  (is (#'annotate/datetime-arithmetics? [:+ [:field (meta/id :checkins :date) nil] [:interval -1 :month]]))
  (is (#'annotate/datetime-arithmetics? [:field (meta/id :checkins :date) {:temporal-unit :month}]))
  (is (not (#'annotate/datetime-arithmetics? [:+ 1 [:temporal-extract
                                                    [:+ [:field (meta/id :checkins :date) nil] [:interval -1 :month]]
                                                    :year]])))
  (is (not (#'annotate/datetime-arithmetics? [:+ [:field (meta/id :checkins :date) nil] 3]))))

(deftest ^:parallel temporal-extract-test
  (is (= {:base_type :type/DateTime}
         (infered-col-type [:datetime-add [:field (meta/id :checkins :date) nil] 2 :month])))
  (is (= {:base_type :type/DateTime}
         (infered-col-type [:datetime-add [:field (meta/id :checkins :date) nil] 2 :hour])))
  (is (= {:base_type :type/DateTime}
         (infered-col-type [:datetime-add [:field (meta/id :users :last-login) nil] 2 :month]))))

(deftest ^:parallel test-string-extracts
  (is (= {:base_type :type/Text}
         (infered-col-type [:trim "foo"])))
  (is (= {:base_type :type/Text}
         (infered-col-type [:ltrim "foo"])))
  (is (= {:base_type :type/Text}
         (infered-col-type [:rtrim "foo"])))
  (is (= {:base_type :type/BigInteger}
         (infered-col-type [:length "foo"])))
  (is (= {:base_type :type/Text}
         (infered-col-type [:upper "foo"])))
  (is (= {:base_type :type/Text}
         (infered-col-type [:lower "foo"])))
  (is (= {:base_type :type/Text}
         (infered-col-type [:substring "foo" 2])))
  (is (= {:base_type :type/Text}
         (infered-col-type [:replace "foo" "f" "b"])))
  (is (= {:base_type :type/Text}
         (infered-col-type [:regex-match-first "foo" "f"])))
  (is (= {:base_type :type/Text}
         (infered-col-type [:concat "foo" "bar"])))
  (is (= {:base_type :type/Text}
         (infered-col-type [:coalesce "foo" "bar"])))
  (is (= {:base_type     :type/Text
          :semantic_type :type/Name}
         (infered-col-type [:coalesce [:field (meta/id :venues :name) nil] "bar"]))))

(deftest ^:parallel unique-name-key-test
  (testing "Make sure `:cols` always come back with a unique `:name` key (#8759)"
    (is (=? {:cols
             [{:base_type     :type/Number
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
             (lib.tu.macros/mbql-query venues
               {:aggregation [[:count]
                              [:sum $price]
                              [:count]
                              [:aggregation-options [:count] {:display-name "count_2"}]]})
             {:cols [{:name "count", :display_name "count", :base_type :type/Number}
                     {:name "sum", :display_name "sum", :base_type :type/Number}
                     {:name "count", :display_name "count", :base_type :type/Number}
                     {:name "count_2", :display_name "count_2", :base_type :type/Number}]})))))

(deftest ^:parallel expressions-keys-test
  (testing "make sure expressions come back with the right set of keys, including `:expression_name` (#8854)"
    (is (= {:name            "discount_price"
            :display_name    "discount_price"
            :base_type       :type/Float
            :expression_name "discount_price"
            :source          :fields
            :field_ref       [:expression "discount_price"]}
           (-> (add-column-info
                (lib.tu.macros/mbql-query venues
                  {:expressions {"discount_price" [:* 0.9 $price]}
                   :fields      [$name [:expression "discount_price"]]
                   :limit       10})
                {})
               :cols
               second)))))

(deftest ^:parallel deduplicate-expression-names-test
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "expressions in aggregations"
      (is (=? [{:base_type :type/Float, :name "expression", :display_name "0.9 × Average of Price", :source :aggregation, :field_ref [:aggregation 0]}
               {:base_type :type/Float, :name "expression_2", :display_name "0.8 × Average of Price", :source :aggregation, :field_ref [:aggregation 1]}]
              (:cols (add-column-info
                      (lib.tu.macros/mbql-query venues
                        {:aggregation [[:* 0.9 [:avg $price]] [:* 0.8 [:avg $price]]]
                         :limit       10})
                      {})))))
    (testing "named :expressions"
      (is (=? [{:name "prev_month", :display_name "prev_month", :base_type :type/DateTime, :expression_name "prev_month", :source :fields, :field_ref [:expression "prev_month"]}]
              (:cols (add-column-info
                      (lib.tu.macros/mbql-query users
                        {:expressions {:prev_month [:+ $last-login [:interval -1 :month]]}
                         :fields      [[:expression "prev_month"]], :limit 10})
                      {})))))))

(deftest ^:parallel mbql-cols-nested-queries-test
  (testing "Should be able to infer MBQL columns with nested queries"
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [base-query (qp.preprocess/preprocess
                        (lib.tu.macros/mbql-query venues
                          {:joins [{:fields       :all
                                    :source-table $$categories
                                    :condition    [:= $category-id &c.categories.id]
                                    :alias        "c"}]}))]
        (doseq [level [0 1 2 3]]
          (testing (format "%d level(s) of nesting" level)
            (let [nested-query (mt/nest-query base-query level)]
              (testing (format "\nQuery = %s" (u/pprint-to-str nested-query))
                (is (= (lib.tu.macros/$ids venues
                         [{:name "ID", :id %id, :field_ref $id}
                          {:name "NAME", :id %name, :field_ref $name}
                          {:name "CATEGORY_ID", :id %category-id, :field_ref $category-id}
                          {:name "LATITUDE", :id %latitude, :field_ref $latitude}
                          {:name "LONGITUDE", :id %longitude, :field_ref $longitude}
                          {:name "PRICE", :id %price, :field_ref $price}
                          {:name "ID_2", :id %categories.id, :field_ref &c.categories.id}
                          {:name "NAME_2", :id %categories.name, :field_ref &c.categories.name}])
                       (map #(select-keys % [:name :id :field_ref])
                            (:cols (add-column-info nested-query {})))))))))))))

(deftest ^:parallel mbql-cols-nested-queries-test-2
  (testing "Aggregated question with source is an aggregated models should infer display_name correctly (#23248)"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [(lib.tu.macros/$ids products
                                         {:type     :query
                                          :database (meta/id)
                                          :query    {:source-table $$products
                                                     :aggregation
                                                     [[:aggregation-options
                                                       [:sum $price]
                                                       {:name "sum"}]
                                                      [:aggregation-options
                                                       [:max $rating]
                                                       {:name "max"}]]
                                                     :breakout     [$category]
                                                     :order-by     [[:asc $category]]}})])
      (let [query (qp.preprocess/preprocess
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
                      :limit        1}))]
        (is (= ["Sum of Sum of Price" "Count"]
               (->> (add-column-info query {})
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
                (let [nested-query (mt/nest-query base-query level)]
                  (testing (format "\nQuery = %s" (u/pprint-to-str nested-query))
                    (is (= (lib.tu.macros/$ids products
                             {:name          "EAN"
                              :display_name  "Products → Ean"
                              :base_type     :type/Text
                              :semantic_type nil
                              :id            %ean
                              :field_ref     &Products.ean})
                           (ean-metadata (add-column-info nested-query {}))))))))))))))

(deftest ^:parallel col-info-for-fields-from-card-test
  (testing "#14787"
    (let [card-1-query (lib.tu.macros/mbql-query orders
                         {:joins [{:fields       :all
                                   :source-table $$products
                                   :condition    [:= $product-id &Products.products.id]
                                   :alias        "Products"}]})]
      (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                        meta/metadata-provider
                                        [card-1-query
                                         (lib.tu.macros/mbql-query people)])
        (testing "when a nested query is from a saved question, there should be no `:join-alias` on the left side"
          (lib.tu.macros/$ids nil
            (let [base-query (qp.preprocess/preprocess
                              (lib.tu.macros/mbql-query nil
                                {:source-table "card__1"
                                 :joins        [{:fields       :all
                                                 :source-table "card__2"
                                                 :condition    [:= $orders.user-id &Products.products.id]
                                                 :alias        "Q"}]
                                 :limit        1}))
                  fields     #{%orders.discount %products.title %people.source}]
              (is (= [{:display_name "Discount" :field_ref [:field %orders.discount nil]}
                      {:display_name "Products → Title" :field_ref [:field %products.title nil]}
                      {:display_name "Q → Source" :field_ref [:field %people.source {:join-alias "Q"}]}]
                     (->> (:cols (add-column-info base-query {}))
                          (filter #(fields (:id %)))
                          (map #(select-keys % [:display_name :field_ref]))))))))))))

(deftest ^:parallel col-info-for-joined-fields-from-card-test
  (testing "Has the correct display names for joined fields from cards (#14787)"
    (letfn [(native [query] {:type     :native
                             :native   {:query query :template-tags {}}
                             :database (meta/id)})]
      (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                        meta/metadata-provider
                                        {:cards [{:id              1
                                                  :name            "Card 1"
                                                  :database-id     (meta/id)
                                                  :dataset-query   (native "select 'foo' as A_COLUMN")
                                                  :result-metadata [{:name         "A_COLUMN"
                                                                     :display_name "A Column"
                                                                     :base_type    :type/Text}]}
                                                 {:id              2
                                                  :name            "Card 2"
                                                  :database-id     (meta/id)
                                                  :dataset-query   (native "select 'foo' as B_COLUMN")
                                                  :result-metadata [{:name         "B_COLUMN"
                                                                     :display_name "B Column"
                                                                     :base_type    :type/Text}]}]})
        (let [query {:database (meta/id)
                     :type     :query
                     :query    {:source-table "card__1"
                                :joins        [{:fields       "all"
                                                :source-table "card__2"
                                                :condition    [:=
                                                               [:field "A_COLUMN" {:base-type :type/Text}]
                                                               [:field "B_COLUMN" {:base-type  :type/Text
                                                                                   :join-alias "alias"}]]
                                                :alias        "alias"}]}}
              cols  (qp.preprocess/query->expected-cols query)]
          (is (= "alias → B Column"
                 (-> cols second :display_name))
              "cols has wrong display name"))))))

(deftest ^:parallel preserve-original-join-alias-e2e-test
  (testing "The join alias for the `:field_ref` in results metadata should match the one originally specified (#27464)"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
      (mt/dataset test-data
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
              (is (= (mt/$ids
                       [{:display_name "ID"
                         :field_ref    $orders.id}
                        (merge
                         {:display_name (str join-alias " → Title")
                          :field_ref    [:field %products.title {:join-alias join-alias}]}
                         ;; `source_alias` is only included in `data.cols`, but not in `results_metadata`
                         (when (= location "data.cols")
                           {:source_alias join-alias}))])
                     (map
                      #(select-keys % [:display_name :field_ref :source_alias])
                      metadata))))))))))
