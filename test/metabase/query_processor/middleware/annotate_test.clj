(ns metabase.query-processor.middleware.annotate-test
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [models :refer [Field]]
             [test :as mt]
             [util :as u]]
            [metabase.query-processor.middleware.annotate :as annotate]
            [metabase.query-processor.store :as qp.store]
            [metabase.test.data :as data]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- add-column-info [query metadata]
  (mt/with-everything-store
    (driver/with-driver :h2
      (-> (mt/test-qp-middleware annotate/add-column-info query metadata []) :metadata :data))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             column-info (:native)                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest native-column-info-test
  (testing "native column info"
    (testing "should still infer types even if the initial value(s) are `nil` (#4256, #6924)"
      (is (= [:type/Integer]
             (transduce identity (#'annotate/base-type-inferer {:cols [{}]})
                        (concat (repeat 1000 [nil]) [[1] [2]])))))

    (testing "should use default `base_type` of `type/*` if there are no non-nil values in the sample"
      (is (= [:type/*]
             (transduce identity (#'annotate/base-type-inferer {:cols [{}]})
                        [[nil]]))))

    (testing "should attempt to infer better base type if driver returns :type/* (#12150)"
      ;; `merged-column-info` handles merging info returned by driver & inferred by annotate
      (is (= [:type/Integer]
             (transduce identity (#'annotate/base-type-inferer {:cols [{:base_type :type/*}]})
                        [[1] [2] [nil] [3]]))))

    (testing "should disambiguate duplicate names"
      (is (= [{:name "a", :display_name "a", :base_type :type/Integer, :source :native, :field_ref [:field-literal "a" :type/Integer]}
              {:name "a", :display_name "a", :base_type :type/Integer, :source :native, :field_ref [:field-literal "a_2" :type/Integer]}]
             (annotate/column-info
              {:type :native}
              {:cols [{:name "a" :base_type :type/Integer} {:name "a" :base_type :type/Integer}]
               :rows [[1 nil]]}))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       (MBQL) Col info for Field clauses                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- info-for-field
  ([field-id]
   (db/select-one (into [Field] (disj (set @#'qp.store/field-columns-to-fetch) :database_type)) :id field-id))

  ([table-key field-key]
   (info-for-field (mt/id table-key field-key))))

(deftest col-info-field-ids-test
  (testing "make sure columns are comming back the way we'd expect for :field-literal clauses"
    (mt/with-everything-store
      (mt/$ids venues
        (is (= [(merge (info-for-field :venues :price)
                       {:source    :fields
                        :field_ref $price})]
               (doall
                (annotate/column-info
                 {:type :query, :query {:fields [$price]}}
                 {:columns [:price]}))))))))

;; TODO - I think this can be removed, now that `fk->` forms are "sugar" and replaced with `:joined-field` clauses
;; before the query ever makes it to the 'annotate' stage
(deftest col-info-for-fks-and-joins-test
  (mt/with-everything-store
    (mt/$ids venues
      (testing "when an `fk->` form is used, we should add in `:fk_field_id` info about the source Field"
        (is (= [(merge (info-for-field :categories :name)
                       {:fk_field_id %category_id
                        :source      :fields
                        :field_ref   $category_id->categories.name})]
               (doall
                (annotate/column-info
                 {:type :query, :query {:fields [$category_id->categories.name]}}
                 {:columns [:name]})))))

      (testing "joins"
        (testing (str "we should get `:fk_field_id` and information where possible when using `:joined-field` clauses; "
                      "display_name should include the display name of the FK field  (for IMPLICIT JOINS)")
          (is (= [(merge (info-for-field :categories :name)
                         {:display_name "Category → Name"
                          :source       :fields
                          :field_ref    $category_id->categories.name
                          :fk_field_id  %category_id})]
                 (doall
                  (annotate/column-info
                   {:type  :query
                    :query {:fields [&CATEGORIES__via__CATEGORY_ID.categories.name]
                            :joins  [{:alias        "CATEGORIES__via__CATEGORY_ID"
                                      :source-table $$venues
                                      :condition    [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id]
                                      :strategy     :left-join
                                      :fk-field-id  %category_id}]}}
                   {:columns [:name]})))))

        (testing (str "for EXPLICIT JOINS (which do not include an `:fk-field-id` in the Join info) the returned "
                      "`:field_ref` should be a `joined-field` clause instead of an `fk->` clause")
          (is (= [(merge (info-for-field :categories :name)
                         {:display_name "Categories → Name"
                          :source       :fields
                          :field_ref    &Categories.categories.name})]
                 (doall
                  (annotate/column-info
                   {:type  :query
                    :query {:fields [&Categories.categories.name]
                            :joins  [{:alias        "Categories"
                                      :source-table $$venues
                                      :condition    [:= $category_id &Categories.categories.id]
                                      :strategy     :left-join}]}}
                   {:columns [:name]})))))))))

(deftest col-info-for-datetime-field-test
  (mt/with-everything-store
    (mt/$ids venues
      (testing "when a `:datetime-field` form is used, we should add in info about the `:unit`"
        (is (= [(merge (info-for-field :venues :price)
                       {:unit      :month
                        :source    :fields
                        :field_ref !month.price})]
               (doall
                (annotate/column-info
                 {:type :query, :query {:fields (mt/$ids venues [!month.price])}}
                 {:columns [:price]})))))

      (testing "datetime unit should work on field literals too"
        (is (= [{:name         "price"
                 :base_type    :type/Number
                 :display_name "Price"
                 :unit         :month
                 :source       :fields
                 :field_ref    !month.*price/Number}]
               (doall
                (annotate/column-info
                 {:type :query, :query {:fields [[:datetime-field [:field-literal "price" :type/Number] :month]]}}
                 {:columns [:price]}))))))))

(deftest col-info-for-binning-strategy-test
  (testing "when binning-strategy is used, include `:binning_info`"
    (is (= [{:name         "price"
             :base_type    :type/Number
             :display_name "Price"
             :unit         :month
             :source       :fields
             :binning_info {:num_bins 10, :bin_width 5, :min_value -100, :max_value 100, :binning_strategy :num-bins}
             :field_ref    [:binning-strategy
                            [:datetime-field [:field-literal "price" :type/Number] :month]
                            :num-bins 10
                            {:num-bins 10, :bin-width 5, :min-value -100, :max-value 100}]}]
           (doall
            (annotate/column-info
             {:type  :query
              :query {:fields [[:binning-strategy
                                [:datetime-field [:field-literal "price" :type/Number] :month]
                                :num-bins 10
                                {:num-bins 10, :bin-width 5, :min-value -100, :max-value 100}]]}}
             {:columns [:price]}))))))

(deftest col-info-combine-parent-field-names-test
  (testing "For fields with parents we should return them with a combined name including parent's name"
    (tt/with-temp* [Field [parent {:name "parent", :table_id (mt/id :venues)}]
                    Field [child  {:name "child", :table_id (mt/id :venues), :parent_id (u/get-id parent)}]]
      (mt/with-everything-store
        (is (= {:description     nil
                :table_id        (mt/id :venues)
                :special_type    nil
                :name            "parent.child"
                :settings        nil
                :field_ref       [:field-id (u/get-id child)]
                :parent_id       (u/get-id parent)
                :id              (u/get-id child)
                :visibility_type :normal
                :display_name    "Child"
                :fingerprint     nil
                :base_type       :type/Text}
               (into {} (#'annotate/col-info-for-field-clause {} [:field-id (u/get-id child)])))))))

  (testing "nested-nested fields should include grandparent name (etc)"
    (tt/with-temp* [Field [grandparent {:name "grandparent", :table_id (mt/id :venues)}]
                    Field [parent      {:name "parent", :table_id (mt/id :venues), :parent_id (u/get-id grandparent)}]
                    Field [child       {:name "child", :table_id (mt/id :venues), :parent_id (u/get-id parent)}]]
      (mt/with-everything-store
        (is (= {:description     nil
                :table_id        (mt/id :venues)
                :special_type    nil
                :name            "grandparent.parent.child"
                :settings        nil
                :field_ref       [:field-id (u/get-id child)]
                :parent_id       (u/get-id parent)
                :id              (u/get-id child)
                :visibility_type :normal
                :display_name    "Child"
                :fingerprint     nil
                :base_type       :type/Text}
               (into {} (#'annotate/col-info-for-field-clause {} [:field-id (u/get-id child)]))))))))

(deftest col-info-field-literals-test
  (testing "field literals should get the information from the matching `:source-metadata` if it was supplied"
    (mt/with-everything-store
      (is (= {:name         "sum"
              :display_name "sum of User ID"
              :base_type    :type/Integer
              :field_ref    [:field-literal "sum" :type/Integer]
              :special_type :type/FK}
             (#'annotate/col-info-for-field-clause
              {:source-metadata
               [{:name "abc", :display_name "another Field", :base_type :type/Integer, :special_type :type/FK}
                {:name "sum", :display_name "sum of User ID", :base_type :type/Integer, :special_type :type/FK}]}
              [:field-literal "sum" :type/Integer]))))))

(deftest col-info-expressions-test
  (mt/with-everything-store
    (testing "col info for an `expression` should work as expected"
      (is (= {:base_type       :type/Float
              :special_type    :type/Number
              :name            "double-price"
              :display_name    "double-price"
              :expression_name "double-price"
              :field_ref       [:expression "double-price"]}
             (mt/$ids venues
               (#'annotate/col-info-for-field-clause
                {:expressions {"double-price" [:* $price 2]}}
                [:expression "double-price"])))))

    (testing "if there is no matching expression it should give a meaningful error message"
      (is (= {:message "No expression named double-price found. Found: (\"one-hundred\")"
              :data    {:type :invalid-query, :clause [:expression "double-price"], :expressions {"one-hundred" 100}}}
             (try
               (mt/$ids venues
                 (#'annotate/col-info-for-field-clause {:expressions {"one-hundred" 100}} [:expression "double-price"]))
               (catch Throwable e {:message (.getMessage e), :data (ex-data e)})))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    (MBQL) Col info for Aggregation clauses                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; test that added information about aggregations looks the way we'd expect
(defn- aggregation-names
  ([ag-clause]
   (aggregation-names {} ag-clause))

  ([inner-query ag-clause]
   (binding [driver/*driver* :h2]
     (mt/with-everything-store
       {:name         (annotate/aggregation-name ag-clause)
        :display_name (annotate/aggregation-display-name inner-query ag-clause)}))))

(deftest aggregation-names-test
  (testing "basic aggregations"
    (testing ":count"
      (is (= {:name "count", :display_name "Count"}
             (aggregation-names [:count]))))

    (testing ":distinct"
      (is (= {:name "count", :display_name "Distinct values of ID"}
             (aggregation-names [:distinct [:field-id (mt/id :venues :id)]]))))

    (testing ":sum"
      (is (= {:name "sum", :display_name "Sum of ID"}
             (aggregation-names [:sum [:field-id (mt/id :venues :id)]])))))

  (testing "expressions"
    (testing "simple expression"
      (is (= {:name "expression", :display_name "Count + 1"}
             (aggregation-names [:+ [:count] 1]))))

    (testing "expression with nested expressions"
      (is (= {:name "expression", :display_name "Min of ID + (2 * Average of Price)"}
             (aggregation-names
              [:+
               [:min [:field-id (mt/id :venues :id)]]
               [:* 2 [:avg [:field-id (mt/id :venues :price)]]]]))))

    (testing "very complicated expression"
      (is (= {:name "expression", :display_name "Min of ID + (2 * Average of Price * 3 * (Max of Category ID - 4))"}
             (aggregation-names
              [:+
               [:min [:field-id (mt/id :venues :id)]]
               [:*
                2
                [:avg [:field-id (mt/id :venues :price)]]
                3
                [:- [:max [:field-id (mt/id :venues :category_id)]] 4]]])))))

  (testing "`aggregation-options`"
    (testing "`:name` and `:display-name`"
      (is (= {:name "generated_name", :display_name "User-specified Name"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field-id (mt/id :venues :id)]] [:* 2 [:avg [:field-id (mt/id :venues :price)]]]]
               {:name "generated_name", :display-name "User-specified Name"}]))))

    (testing "`:name` only"
      (is (= {:name "generated_name", :display_name "Min of ID + (2 * Average of Price)"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field-id (mt/id :venues :id)]] [:* 2 [:avg [:field-id (mt/id :venues :price)]]]]
               {:name "generated_name"}]))))

    (testing "`:display-name` only"
      (is (= {:name "expression", :display_name "User-specified Name"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field-id (mt/id :venues :id)]] [:* 2 [:avg [:field-id (mt/id :venues :price)]]]]
               {:display-name "User-specified Name"}]))))))

(defn- col-info-for-aggregation-clause
  ([clause]
   (col-info-for-aggregation-clause {} clause))

  ([inner-query clause]
   (binding [driver/*driver* :h2]
     (#'annotate/col-info-for-aggregation-clause inner-query clause))))

(deftest col-info-for-aggregation-clause-test
  (mt/with-everything-store
    (testing "basic aggregation clauses"
      (testing "`:count` (no field)"
        (is (= {:base_type :type/Float, :special_type :type/Number, :name "expression", :display_name "Count / 2"}
               (col-info-for-aggregation-clause [:/ [:count] 2]))))

      (testing "`:sum`"
        (is (= {:base_type :type/Float, :special_type :type/Number, :name "sum", :display_name "Sum of Price + 1"}
               (mt/$ids venues
                 (col-info-for-aggregation-clause [:sum [:+ $price 1]]))))))

    (testing "`:aggregation-options`"
      (testing "`:name` and `:display-name`"
        (is (= {:base_type    :type/Integer
                :special_type :type/Category
                :settings     nil
                :name         "sum_2"
                :display_name "My custom name"}
               (mt/$ids venues
                 (col-info-for-aggregation-clause
                  [:aggregation-options [:sum $price] {:name "sum_2", :display-name "My custom name"}])))))

      (testing "`:name` only"
        (is (= {:base_type    :type/Integer
                :special_type :type/Category
                :settings     nil
                :name         "sum_2"
                :display_name "Sum of Price"}
               (mt/$ids venues
                 (col-info-for-aggregation-clause [:aggregation-options [:sum $price] {:name "sum_2"}])))))

      (testing "`:display-name` only"
        (is (= {:base_type    :type/Integer
                :special_type :type/Category
                :settings     nil
                :name         "sum"
                :display_name "My Custom Name"}
               (mt/$ids venues
                 (col-info-for-aggregation-clause
                  [:aggregation-options [:sum $price] {:display-name "My Custom Name"}]))))))

    (testing (str "if a driver is kind enough to supply us with some information about the `:cols` that come back, we "
                  "should include that information in the results. Their information should be preferred over ours")
      (is (= {:cols [{:name         "metric"
                      :display_name "Total Events"
                      :base_type    :type/Text
                      :source       :aggregation
                      :field_ref    [:aggregation 0]}]}
             (add-column-info
              (mt/mbql-query venues {:aggregation [[:metric "ga:totalEvents"]]})
              {:cols [{:name "totalEvents", :display_name "Total Events", :base_type :type/Text}]}))))

    (testing "col info for an `expression` aggregation w/ a named expression should work as expected"
      (is (= {:base_type :type/Float, :special_type :type/Number, :name "sum", :display_name "Sum of double-price"}
             (mt/$ids venues
               (col-info-for-aggregation-clause {:expressions {"double-price" [:* $price 2]}} [:sum [:expression "double-price"]])))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Other MBQL col info tests                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- infered-col-type
  [expr]
  (-> (add-column-info (mt/mbql-query venues {:expressions {"expr" expr}
                                              :fields      [[:expression "expr"]]
                                              :limit       10})
                                      {})
      :cols
      first
      (select-keys [:base_type :special_type])))

(deftest test-string-extracts
  (is (= {:base_type    :type/Text
          :special_type nil}
         (infered-col-type  [:trim "foo"])))
  (is (= {:base_type    :type/Text
          :special_type nil}
         (infered-col-type  [:ltrim "foo"])))
  (is (= {:base_type    :type/Text
          :special_type nil}
         (infered-col-type  [:rtrim "foo"])))
  (is (= {:base_type    :type/BigInteger
          :special_type :type/Number}
         (infered-col-type  [:length "foo"])))
  (is (= {:base_type    :type/Text
          :special_type nil}
         (infered-col-type  [:upper "foo"])))
  (is (= {:base_type    :type/Text
          :special_type nil}
         (infered-col-type  [:lower "foo"])))
  (is (= {:base_type    :type/Text
          :special_type nil}
         (infered-col-type  [:substring "foo" 2])))
  (is (= {:base_type    :type/Text
          :special_type nil}
         (infered-col-type  [:replace "foo" "f" "b"])))
  (is (= {:base_type    :type/Text
          :special_type nil}
         (infered-col-type  [:regex-match-first "foo" "f"])))
  (is (= {:base_type    :type/Text
          :special_type nil}
         (infered-col-type  [:concat "foo" "bar"])))
  (is (= {:base_type    :type/Text
          :special_type nil}
         (infered-col-type  [:coalesce "foo" "bar"])))
  (is (= {:base_type    :type/Text
          :special_type :type/Name}
         (infered-col-type  [:coalesce [:field-id (data/id :venues :name)] "bar"]))))

(deftest test-case
  (is (= {:base_type    :type/Text
          :special_type nil}
         (infered-col-type [:case [[[:> (data/id :venues :price) 2] "big"]]])))
  (is (= {:base_type    :type/Float
          :special_type :type/Number}
         (infered-col-type [:case [[[:> (data/id :venues :price) 2] [:+ (data/id :venues :price) 1]]]])))
  (testing "Make sure we skip nils when infering case return type"
    (is (= {:base_type    :type/Number
            :special_type nil}
           (infered-col-type [:case [[[:< (data/id :venues :price) 10] nil]
                                     [[:> (data/id :venues :price) 2] 10]]]))))
  (is (= {:base_type    :type/Float
          :special_type :type/Number}
         (infered-col-type [:case [[[:> (data/id :venues :price) 2] [:+ (data/id :venues :price) 1]]]]))))

(deftest unique-name-key-test
  (testing "Make sure `:cols` always come back with a unique `:name` key (#8759)"
    (is (= {:cols
            [{:base_type    :type/Number
              :special_type :type/Number
              :name         "count"
              :display_name "count"
              :source       :aggregation
              :field_ref    [:aggregation 0]}
             {:source       :aggregation
              :name         "sum"
              :display_name "sum"
              :base_type    :type/Number
              :field_ref    [:aggregation 1]}
             {:base_type    :type/Number
              :special_type :type/Number
              :name         "count_2"
              :display_name "count"
              :source       :aggregation
              :field_ref    [:aggregation 2]}
             {:base_type    :type/Number
              :special_type :type/Number
              :name         "count_3"
              :display_name "count_2"
              :source       :aggregation
              :field_ref    [:aggregation 3]}]}
           (add-column-info
            (mt/mbql-query venues
              {:aggregation [[:count]
                             [:sum]
                             [:count]
                             [:aggregation-options [:count] {:display-name "count_2"}]]})
            {:cols [{:name "count", :display_name "count", :base_type :type/Number}
                    {:name "sum", :display_name "sum", :base_type :type/Number}
                    {:name "count", :display_name "count", :base_type :type/Number}
                    {:name "count_2", :display_name "count_2", :base_type :type/Number}]})))))

(deftest expressions-keys-test
  (testing "make sure expressions come back with the right set of keys, including `:expression_name` (#8854)"
    (is (= {:name            "discount_price",
            :display_name    "discount_price",
            :base_type       :type/Float,
            :special_type    :type/Number,
            :expression_name "discount_price",
            :source          :fields,
            :field_ref       [:expression "discount_price"]}
           (-> (add-column-info
                (mt/mbql-query venues
                  {:expressions {"discount_price" [:* 0.9 $price]}
                   :fields      [$name [:expression "discount_price"]]
                   :limit       10})
                {})
               :cols
               second)))))

(deftest deduplicate-expression-names-test
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "expressions in aggregations"
      (is (= [{:base_type :type/Float, :special_type :type/Number, :name "expression", :display_name "0.9 * Average of Price", :source :aggregation, :field_ref [:aggregation 0]}
              {:base_type :type/Float, :special_type :type/Number, :name "expression_2", :display_name "0.8 * Average of Price", :source :aggregation, :field_ref [:aggregation 1]}]
             (:cols (add-column-info
                     (mt/mbql-query venues
                                      {:aggregation [[:* 0.9 [:avg $price]] [:* 0.8 [:avg $price]]]
                                       :limit       10})
                     {})))))
    (testing "named :expressions"
      (is (= [{:name "prev_month", :display_name "prev_month", :base_type :type/DateTime, :special_type nil, :expression_name "prev_month", :source :fields, :field_ref [:expression "prev_month"]}]
             (:cols (add-column-info
                     (mt/mbql-query users
                                      {:expressions {:prev_month [:+ $last_login [:interval -1 :month]]}
                                       :fields      [[:expression "prev_month"]], :limit 10})
                     {})))))))
