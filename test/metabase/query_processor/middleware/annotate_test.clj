(ns metabase.query-processor.middleware.annotate-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.models :refer [Field]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.annotate :as annotate]
            [metabase.query-processor.store :as qp.store]
            [metabase.test :as mt]
            [metabase.util :as u]
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
      (is (= [{:name "a", :display_name "a", :base_type :type/Integer, :source :native, :field_ref [:field "a" {:base-type :type/Integer}]}
              {:name "a", :display_name "a", :base_type :type/Integer, :source :native, :field_ref [:field "a_2" {:base-type :type/Integer}]}]
             (annotate/column-info
              {:type :native}
              {:cols [{:name "a" :base_type :type/Integer} {:name "a" :base_type :type/Integer}]
               :rows [[1 nil]]}))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       (MBQL) Col info for Field clauses                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- info-for-field
  ([field-id]
   (into {} (db/select-one (into [Field] (disj (set @#'qp.store/field-columns-to-fetch) :database_type)) :id field-id)))

  ([table-key field-key]
   (info-for-field (mt/id table-key field-key))))

(deftest col-info-field-ids-test
  (testing {:base-type "make sure columns are comming back the way we'd expect for :field clauses"}
    (mt/with-everything-store
      (mt/$ids venues
        (is (= [(merge (info-for-field :venues :price)
                       {:source    :fields
                        :field_ref $price})]
               (doall
                (annotate/column-info
                 {:type :query, :query {:fields [$price]}}
                 {:columns [:price]}))))))))

(deftest col-info-for-fks-and-joins-test
  (mt/with-everything-store
    (mt/$ids venues
      (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk_field_id` "
                    "info about the source Field")
        (is (= [(merge (info-for-field :categories :name)
                       {:fk_field_id %category_id
                        :source      :fields
                        :field_ref   $category_id->categories.name})]
               (doall
                (annotate/column-info
                 {:type :query, :query {:fields [$category_id->categories.name]}}
                 {:columns [:name]})))))

      (testing "joins"
        (testing (str "we should get `:fk_field_id` and information where possible when using joins; "
                      "display_name should include the display name of the FK field (for IMPLICIT JOINS)")
          (is (= [(merge (info-for-field :categories :name)
                         {:display_name "Category → Name"
                          :source       :fields
                          :field_ref    $category_id->categories.name
                          :fk_field_id  %category_id
                          :source_alias "CATEGORIES__via__CATEGORY_ID"})]
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
                      "`:field_ref` should be have only `:join-alias`, and no `:source-field`")
          (is (= [(merge (info-for-field :categories :name)
                         {:display_name "Categories → Name"
                          :source       :fields
                          :field_ref    &Categories.categories.name
                          :source_alias "Categories"})]
                 (doall
                  (annotate/column-info
                   {:type  :query
                    :query {:fields [&Categories.categories.name]
                            :joins  [{:alias        "Categories"
                                      :source-table $$venues
                                      :condition    [:= $category_id &Categories.categories.id]
                                      :strategy     :left-join}]}}
                   {:columns [:name]})))))))))

(deftest col-info-for-field-with-temporal-unit-test
  (mt/with-everything-store
    (mt/$ids venues
      (testing "when a `:field` with `:temporal-unit` is used, we should add in info about the `:unit`"
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
                 {:type :query, :query {:fields [[:field "price" {:base-type :type/Number, :temporal-unit :month}]]}}
                 {:columns [:price]}))))))

    (testing "should add the correct info if the Field originally comes from a nested query"
      (mt/$ids checkins
        (is (= [{:name "DATE", :unit :month, :field_ref [:field %date {:temporal-unit :default}]}
                {:name "LAST_LOGIN", :unit :month, :field_ref [:field
                                                               %users.last_login
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
                                                            %users.last_login
                                                            {:temporal-unit :month, :source-field %user_id}]]}
                          :source-metadata [{:name      "DATE"
                                             :id        %date
                                             :unit      :month
                                             :field_ref [:field %date {:temporal-unit :month}]}
                                            {:name      "LAST_LOGIN"
                                             :id        %users.last_login
                                             :unit      :month
                                             :field_ref [:field %users.last_login {:temporal-unit :month
                                                                                   :source-field  %user_id}]}]
                          :fields          [[:field %date {:temporal-unit :default}]
                                            [:field %users.last_login {:temporal-unit :default, :join-alias "USERS__via__USER_ID"}]]
                          :limit           1}}
                 nil))))))))

(deftest col-info-for-binning-strategy-test
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
           (doall
            (annotate/column-info
             {:type  :query
              :query {:fields [[:field "price" {:base-type     :type/Number
                                                :temporal-unit :month
                                                :binning       {:strategy  :num-bins
                                                                :num-bins  10
                                                                :bin-width 5
                                                                :min-value -100
                                                                :max-value 100}}]]}}
             {:columns [:price]}))))))

(deftest col-info-combine-parent-field-names-test
  (testing "For fields with parents we should return them with a combined name including parent's name"
    (tt/with-temp* [Field [parent {:name "parent", :table_id (mt/id :venues)}]
                    Field [child  {:name "child", :table_id (mt/id :venues), :parent_id (u/the-id parent)}]]
    (mt/with-everything-store
        (is (= {:description     nil
                :table_id        (mt/id :venues)
                :semantic_type   nil
                :effective_type  nil
                ;; these two are a gross symptom. there's some tension. sometimes it makes sense to have an effective
                ;; type: the db type is different and we have a way to convert. Othertimes, it doesn't make sense:
                ;; when the info is inferred. the solution to this might be quite extensive renaming
                :coercion_strategy nil
                :name            "parent.child"
                :settings        nil
                :field_ref       [:field (u/the-id child) nil]
                :parent_id       (u/the-id parent)
                :id              (u/the-id child)
                :visibility_type :normal
                :display_name    "Child"
                :fingerprint     nil
                :base_type       :type/Text}
               (into {} (#'annotate/col-info-for-field-clause {} [:field (u/the-id child) nil])))))))

  (testing "nested-nested fields should include grandparent name (etc)"
    (tt/with-temp* [Field [grandparent {:name "grandparent", :table_id (mt/id :venues)}]
                    Field [parent      {:name "parent", :table_id (mt/id :venues), :parent_id (u/the-id grandparent)}]
                    Field [child       {:name "child", :table_id (mt/id :venues), :parent_id (u/the-id parent)}]]
      (mt/with-everything-store
        (is (= {:description     nil
                :table_id        (mt/id :venues)
                :semantic_type   nil
                :effective_type  nil
                :coercion_strategy nil
                :name            "grandparent.parent.child"
                :settings        nil
                :field_ref       [:field (u/the-id child) nil]
                :parent_id       (u/the-id parent)
                :id              (u/the-id child)
                :visibility_type :normal
                :display_name    "Child"
                :fingerprint     nil
                :base_type       :type/Text}
               (into {} (#'annotate/col-info-for-field-clause {} [:field (u/the-id child) nil]))))))))

(deftest col-info-field-literals-test
  (testing "field literals should get the information from the matching `:source-metadata` if it was supplied"
    (mt/with-everything-store
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

(deftest col-info-expressions-test
  (mt/with-everything-store
    (testing "col info for an `expression` should work as expected"
      (is (= {:base_type       :type/Float
              :name            "double-price"
              :display_name    "double-price"
              :expression_name "double-price"
              :field_ref       [:expression "double-price"]}
             (mt/$ids venues
               (#'annotate/col-info-for-field-clause
                {:expressions {"double-price" [:* $price 2]}}
                [:expression "double-price"])))))

    (testing "if there is no matching expression it should give a meaningful error message"
      (is (= {:data    {:expression-name "double-price"
                        :tried           ["double-price" :double-price]
                        :found           #{"one-hundred"}
                        :type            :invalid-query}
              :message "No expression named 'double-price'"}
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
             (aggregation-names [:distinct [:field (mt/id :venues :id) nil]]))))

    (testing ":sum"
      (is (= {:name "sum", :display_name "Sum of ID"}
             (aggregation-names [:sum [:field (mt/id :venues :id) nil]])))))

  (testing "expressions"
    (testing "simple expression"
      (is (= {:name "expression", :display_name "Count + 1"}
             (aggregation-names [:+ [:count] 1]))))

    (testing "expression with nested expressions"
      (is (= {:name "expression", :display_name "Min of ID + (2 * Average of Price)"}
             (aggregation-names
              [:+
               [:min [:field (mt/id :venues :id) nil]]
               [:* 2 [:avg [:field (mt/id :venues :price) nil]]]]))))

    (testing "very complicated expression"
      (is (= {:name "expression", :display_name "Min of ID + (2 * Average of Price * 3 * (Max of Category ID - 4))"}
             (aggregation-names
              [:+
               [:min [:field (mt/id :venues :id) nil]]
               [:*
                2
                [:avg [:field (mt/id :venues :price) nil]]
                3
                [:- [:max [:field (mt/id :venues :category_id) nil]] 4]]])))))

  (testing "`aggregation-options`"
    (testing "`:name` and `:display-name`"
      (is (= {:name "generated_name", :display_name "User-specified Name"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (mt/id :venues :id) nil]] [:* 2 [:avg [:field (mt/id :venues :price) nil]]]]
               {:name "generated_name", :display-name "User-specified Name"}]))))

    (testing "`:name` only"
      (is (= {:name "generated_name", :display_name "Min of ID + (2 * Average of Price)"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (mt/id :venues :id) nil]] [:* 2 [:avg [:field (mt/id :venues :price) nil]]]]
               {:name "generated_name"}]))))

    (testing "`:display-name` only"
      (is (= {:name "expression", :display_name "User-specified Name"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (mt/id :venues :id) nil]] [:* 2 [:avg [:field (mt/id :venues :price) nil]]]]
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
        (is (= {:base_type :type/Float, :name "expression", :display_name "Count / 2"}
               (col-info-for-aggregation-clause [:/ [:count] 2]))))

      (testing "`:sum`"
        (is (= {:base_type :type/Float, :name "sum", :display_name "Sum of Price + 1"}
               (mt/$ids venues
                 (col-info-for-aggregation-clause [:sum [:+ $price 1]]))))))

    (testing "`:aggregation-options`"
      (testing "`:name` and `:display-name`"
        (is (= {:base_type     :type/Integer
                :semantic_type :type/Category
                :settings      nil
                :name          "sum_2"
                :display_name  "My custom name"}
               (mt/$ids venues
                 (col-info-for-aggregation-clause
                  [:aggregation-options [:sum $price] {:name "sum_2", :display-name "My custom name"}])))))

      (testing "`:name` only"
        (is (= {:base_type     :type/Integer
                :semantic_type :type/Category
                :settings      nil
                :name          "sum_2"
                :display_name  "Sum of Price"}
               (mt/$ids venues
                 (col-info-for-aggregation-clause [:aggregation-options [:sum $price] {:name "sum_2"}])))))

      (testing "`:display-name` only"
        (is (= {:base_type     :type/Integer
                :semantic_type :type/Category
                :settings      nil
                :name          "sum"
                :display_name  "My Custom Name"}
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
      (is (= {:base_type :type/Float, :name "sum", :display_name "Sum of double-price"}
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
      (select-keys [:base_type :semantic_type])))

(deftest test-string-extracts
  (is (= {:base_type :type/Text}
         (infered-col-type  [:trim "foo"])))
  (is (= {:base_type :type/Text}
         (infered-col-type  [:ltrim "foo"])))
  (is (= {:base_type :type/Text}
         (infered-col-type  [:rtrim "foo"])))
  (is (= {:base_type :type/BigInteger}
         (infered-col-type  [:length "foo"])))
  (is (= {:base_type :type/Text}
         (infered-col-type  [:upper "foo"])))
  (is (= {:base_type :type/Text}
         (infered-col-type  [:lower "foo"])))
  (is (= {:base_type :type/Text}
         (infered-col-type  [:substring "foo" 2])))
  (is (= {:base_type :type/Text}
         (infered-col-type  [:replace "foo" "f" "b"])))
  (is (= {:base_type :type/Text}
         (infered-col-type  [:regex-match-first "foo" "f"])))
  (is (= {:base_type :type/Text}
         (infered-col-type  [:concat "foo" "bar"])))
  (is (= {:base_type :type/Text}
         (infered-col-type  [:coalesce "foo" "bar"])))
  (is (= {:base_type     :type/Text
          :semantic_type :type/Name}
         (infered-col-type  [:coalesce [:field (mt/id :venues :name) nil] "bar"]))))

(deftest test-case
  (is (= {:base_type :type/Text}
         (infered-col-type [:case [[[:> [:field (mt/id :venues :price) nil] 2] "big"]]])))
  (is (= {:base_type :type/Float}
         (infered-col-type [:case [[[:> [:field (mt/id :venues :price) nil] 2]
                                    [:+ [:field (mt/id :venues :price) nil] 1]]]])))
  (testing "Make sure we skip nils when infering case return type"
    (is (= {:base_type :type/Number}
           (infered-col-type [:case [[[:< [:field (mt/id :venues :price) nil] 10] [:value nil {:base_type :type/Number}]]
                                     [[:> [:field (mt/id :venues :price) nil] 2] 10]]]))))
  (is (= {:base_type :type/Float}
         (infered-col-type [:case [[[:> [:field (mt/id :venues :price) nil] 2] [:+ [:field (mt/id :venues :price) nil] 1]]]]))))

(deftest unique-name-key-test
  (testing "Make sure `:cols` always come back with a unique `:name` key (#8759)"
    (is (= {:cols
            [{:base_type     :type/Number
              :semantic_type :type/Quantity
              :name          "count"
              :display_name  "count"
              :source        :aggregation
              :field_ref     [:aggregation 0]}
             {:source       :aggregation
              :name         "sum"
              :display_name "sum"
              :base_type    :type/Number
              :field_ref    [:aggregation 1]}
             {:base_type     :type/Number
              :semantic_type :type/Quantity
              :name          "count_2"
              :display_name  "count"
              :source        :aggregation
              :field_ref     [:aggregation 2]}
             {:base_type     :type/Number
              :semantic_type :type/Quantity
              :name          "count_3"
              :display_name  "count_2"
              :source        :aggregation
              :field_ref     [:aggregation 3]}]}
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
    (is (= {:name            "discount_price"
            :display_name    "discount_price"
            :base_type       :type/Float
            :expression_name "discount_price"
            :source          :fields
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
      (is (= [{:base_type :type/Float, :name "expression", :display_name "0.9 * Average of Price", :source :aggregation, :field_ref [:aggregation 0]}
              {:base_type :type/Float, :name "expression_2", :display_name "0.8 * Average of Price", :source :aggregation, :field_ref [:aggregation 1]}]
             (:cols (add-column-info
                     (mt/mbql-query venues
                                      {:aggregation [[:* 0.9 [:avg $price]] [:* 0.8 [:avg $price]]]
                                       :limit       10})
                     {})))))
    (testing "named :expressions"
      (is (= [{:name "prev_month", :display_name "prev_month", :base_type :type/DateTime, :expression_name "prev_month", :source :fields, :field_ref [:expression "prev_month"]}]
             (:cols (add-column-info
                     (mt/mbql-query users
                                      {:expressions {:prev_month [:+ $last_login [:interval -1 :month]]}
                                       :fields      [[:expression "prev_month"]], :limit 10})
                     {})))))))

(deftest mbql-cols-nested-queries-test
  (testing "Should be able to infer MBQL columns with nested queries"
    (let [base-query (qp/query->preprocessed
                      (mt/mbql-query venues
                        {:joins [{:fields       :all
                                  :source-table $$categories
                                  :condition    [:= $category_id &c.categories.id]
                                  :alias        "c"}]}))]
      (doseq [level [0 1 2 3]]
        (testing (format "%d level(s) of nesting" level)
          (let [nested-query (mt/nest-query base-query level)]
            (testing (format "\nQuery = %s" (u/pprint-to-str nested-query))
              (is (= (mt/$ids venues
                       [{:name "ID",          :id %id,              :field_ref $id}
                        {:name "NAME",        :id %name,            :field_ref $name}
                        {:name "CATEGORY_ID", :id %category_id,     :field_ref $category_id}
                        {:name "LATITUDE",    :id %latitude,        :field_ref $latitude}
                        {:name "LONGITUDE",   :id %longitude,       :field_ref $longitude}
                        {:name "PRICE",       :id %price,           :field_ref $price}
                        {:name "ID_2",        :id %categories.id,   :field_ref &c.categories.id}
                        {:name "NAME_2",      :id %categories.name, :field_ref &c.categories.name}])
                     (map #(select-keys % [:name :id :field_ref])
                          (:cols (add-column-info nested-query {}))))))))))))

(deftest inception-test
  (testing "Should return correct metadata for an 'inception-style' nesting of source > source > source with a join (#14745)"
    (mt/dataset sample-dataset
      ;; these tests look at the metadata for just one column so it's easier to spot the differences.
      (letfn [(ean-metadata [result]
                (as-> (:cols result) result
                  (u/key-by :name result)
                  (get result "EAN")
                  (select-keys result [:name :display_name :base_type :semantic_type :id :field_ref])))]
        (testing "Make sure metadata is correct for the 'EAN' column with"
          (let [base-query (qp/query->preprocessed
                            (mt/mbql-query orders
                              {:joins [{:fields       :all
                                        :source-table $$products
                                        :condition    [:= $product_id &Products.products.id]
                                        :alias        "Products"}]
                               :limit 10}))]
            (doseq [level (range 4)]
              (testing (format "%d level(s) of nesting" level)
                (let [nested-query (mt/nest-query base-query level)]
                  (testing (format "\nQuery = %s" (u/pprint-to-str nested-query))
                    (is (= (mt/$ids products
                             {:name         "EAN"
                              :display_name "Products → Ean"
                              :base_type    :type/Text
                              :semantic_type nil
                              :id           %ean
                              :field_ref    &Products.ean})
                           (ean-metadata (add-column-info nested-query {}))))))))))))))
