(ns metabase.lib.metadata.calculate-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.metadata.calculate :as calculate]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(defn- ^:deprecated column-info [query _results-metadata]
  (calculate/stage-metadata query -1))

(deftest ^:parallel col-info-field-ids-test
  (testing "make sure columns are comming back the way we'd expect for :field clauses"
    (is (= [(merge (meta/field-metadata :venues :price)
                   {:source    :fields
                    :field_ref [:field (meta/id :venues :price) nil]})]
           (column-info
            {:type  :query
             :query {:fields [[:field (meta/id :venues :price) nil]]}}
            {:columns [:price]})))))

(deftest ^:parallel col-info-implicit-join-test
  (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk_field_id` "
                "info about the source Field")
    (is (= [(merge (meta/field-metadata :categories :name)
                   {:fk_field_id (meta/id :venues :category-id)
                    :source      :fields
                    :field_ref   [:field (meta/id :categories :name) {:fk-field-id (meta/id :venues :category-id)}]})]
           (column-info
            {:type  :query
             :query {:fields [[:field (meta/id :categories :name) {:fk-field-id (meta/id :venues :category-id)}]]}}
            {:columns [:name]})))))

(deftest ^:parallel col-info-explicit-join-test
  (testing (str "we should get `:fk_field_id` and information where possible when using joins; "
                "display_name should include the display name of the FK field (for IMPLICIT JOINS)")
    (is (= [(merge (meta/field-metadata :categories :name)
                   {:display_name "Category → Name"
                    :source       :fields
                    :field_ref    [:field (meta/id :categories :name) {:fk-field-id (meta/id :venues :category-id)}]
                    :fk_field_id  (meta/id :venues :category-id)
                    :source_alias "CATEGORIES__via__CATEGORY_ID"})]
           (column-info
            {:type  :query
             :query {:fields [[:field (meta/id :categories :name) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                     :joins  [{:alias        "CATEGORIES__via__CATEGORY_ID"
                               :source-table (meta/id :venues)
                               :condition    [:=
                                              [:field (meta/id :venues :category-id)]
                                              [:field (meta/id :categories :id) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                               :strategy     :left-join
                               :fk-field-id  (meta/id :venues :category-id)}]}}
            {:columns [:name]})))))

(deftest ^:parallel col-info-explicit-join-without-fk-field-id-test
  (testing (str "for EXPLICIT JOINS (which do not include an `:fk-field-id` in the Join info) the returned "
                "`:field_ref` should be have only `:join-alias`, and no `:source-field`")
    (is (= [(merge (meta/field-metadata :categories :name)
                   {:display_name "Categories → Name"
                    :source       :fields
                    :field_ref    [:field (meta/id :categories :name) {:join-alias "Categories"}]
                    :source_alias "Categories"})]
           (column-info
            {:type  :query
             :query {:fields [[:field (meta/id :categories :name) {:join-alias "Categories"}]]
                     :joins  [{:alias        "Categories"
                               :source-table (meta/id :venues)
                               :condition    [:=
                                              [:field (meta/id :venues :category-id)]
                                              [:field (meta/id :categories :id) {:join-alias "Categories"}]]
                               :strategy     :left-join}]}}
            {:columns [:name]})))))

(deftest ^:parallel col-info-for-field-with-temporal-unit-test
  (testing "when a `:field` with `:temporal-unit` is used, we should add in info about the `:unit`"
    (is (= [(merge (meta/field-metadata :venues :price)
                   {:unit      :month
                    :source    :fields
                    :field_ref [:field (meta/id :venues :price) {:temporal-unit :month}]})]
           (column-info
            {:type  :query
             :query {:fields [[:field (meta/id :venues :price) {:temporal-unit :month}]]}}
            {:columns [:price]})))))

(deftest ^:parallel col-info-for-field-with-temporal-unit-literal-test
  (testing "datetime unit should work on field literals too"
    (is (= [{:name         "price"
             :base_type    :type/Number
             :display_name "Price"
             :unit         :month
             :source       :fields
             :field_ref    [:field "price" {:base-type :type/Number, :temporal-unit :month}]}]
           (column-info
            {:type :query, :query {:fields [[:field "price" {:base-type :type/Number, :temporal-unit :month}]]}}
            {:columns [:price]})))))

(deftest ^:parallel col-info-for-field-with-temporal-unit-correct-field-info-test
  (testing "should add the correct info if the Field originally comes from a nested query"
    (is (=? [{:name "DATE", :unit :month, :field_ref [:field (meta/id :checkins :date) {:temporal-unit :default}]}
             {:name "LAST_LOGIN", :unit :month, :field_ref [:field
                                                            (meta/id :users :last-login)
                                                            {:temporal-unit :default
                                                             :join-alias    "USERS__via__USER_ID"}]}]
            (column-info
             {:type  :query
              :query {:source-query    {:source-table (meta/id :checkins)
                                        :breakout     [[:field (meta/id :checkins :date) {:temporal-unit :month}]
                                                       [:field
                                                        (meta/id :users :last-login)
                                                        {:temporal-unit :month, :source-field (meta/id :checkins :user-id)}]]}
                      :source-metadata [{:name      "DATE"
                                         :id        (meta/id :checkins :date)
                                         :unit      :month
                                         :field_ref [:field (meta/id :checkins :date) {:temporal-unit :month}]}
                                        {:name      "LAST_LOGIN"
                                         :id        (meta/id :users :last-login)
                                         :unit      :month
                                         :field_ref [:field (meta/id :users :last-login) {:temporal-unit :month
                                                                                          :source-field  (meta/id :checkins :user-id)}]}]
                      :fields          [[:field (meta/id :checkins :date) {:temporal-unit :default}]
                                        [:field (meta/id :users :last-login) {:temporal-unit :default, :join-alias "USERS__via__USER_ID"}]]
                      :limit           1}}
             nil)))))

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
           (column-info
            {:type  :query
             :query {:fields [[:field "price" {:base-type     :type/Number
                                               :temporal-unit :month
                                               :binning       {:strategy  :num-bins
                                                               :num-bins  10
                                                               :bin-width 5
                                                               :min-value -100
                                                               :max-value 100}}]]}}
            {:columns [:price]})))))

(deftest ^:parallel col-info-combine-parent-field-names-test
  (testing "For fields with parents we should return them with a combined name including parent's name"
    (let [parent {:lib/type :metadata/field
                  :name     "parent"
                  :table_id (meta/id :venues)
                  :id       1000}
          child  {:name      "child"
                  :table_id  (meta/id :venues)
                  :parent_id 1000
                  :id        2000}]
      (is (= {:description       nil
              :table_id          (meta/id :venues)
              :semantic_type     nil
              :effective_type    nil
              ;; these two are a gross symptom. there's some tension. sometimes it makes sense to have an effective
              ;; type: the db type is different and we have a way to convert. Othertimes, it doesn't make sense:
              ;; when the info is inferred. the solution to this might be quite extensive renaming
              :coercion_strategy nil
              :name              "parent.child"
              :settings          nil
              :field_ref         [:field (:id child) nil]
              :nfc_path          nil
              :parent_id         (:id parent)
              :id                (:id child)
              :visibility_type   :normal
              :display_name      "Child"
              :fingerprint       nil
              :base_type         :type/Text}
             (into {} (#'calculate/col-info-for-field-clause {} [:field (:id child) nil]))))))

  (testing "nested-nested fields should include grandparent name (etc)"
    (let [grandparent {:name     "grandparent"
                       :table_id (meta/id :venues)
                       :id       1000}
          parent      {:name      "parent"
                       :table_id  (meta/id :venues)
                       :parent_id 1000
                       :id        2000}
          child       {:name      "child"
                       :table_id  (meta/id :venues)
                       :parent_id 2000
                       :id        3000}]
      (is (= {:description       nil
              :table_id          (meta/id :venues)
              :semantic_type     nil
              :effective_type    nil
              :coercion_strategy nil
              :name              "grandparent.parent.child"
              :settings          nil
              :field_ref         [:field (:id child) nil]
              :nfc_path          nil
              :parent_id         (:id parent)
              :id                (:id child)
              :visibility_type   :normal
              :display_name      "Child"
              :fingerprint       nil
              :base_type         :type/Text}
             (into {} (#'calculate/col-info-for-field-clause {} [:field (:id child) nil])))))))

(deftest ^:parallel col-info-field-literals-test
  (testing "field literals should get the information from the matching `:source-metadata` if it was supplied"
    (is (= {:name          "sum"
            :display_name  "sum of User ID"
            :base_type     :type/Integer
            :field_ref     [:field "sum" {:base-type :type/Integer}]
            :semantic_type :type/FK}
           (#'calculate/col-info-for-field-clause
            {:source-metadata
             [{:name "abc", :display_name "another Field", :base_type :type/Integer, :semantic_type :type/FK}
              {:name "sum", :display_name "sum of User ID", :base_type :type/Integer, :semantic_type :type/FK}]}
            [:field "sum" {:base-type :type/Integer}])))))

(deftest ^:parallel col-info-expressions-test
  (testing "col info for an `expression` should work as expected"
    (is (= {:base_type       :type/Float
            :name            "double-price"
            :display_name    "double-price"
            :expression_name "double-price"
            :field_ref       [:expression "double-price"]}
           (#'calculate/col-info-for-field-clause
            {:expressions {"double-price" [:* [:field (meta/id :venues :price) nil] 2]}}
            [:expression "double-price"])))))

(deftest ^:parallel col-info-for-convert-timezone-test
  (testing "col-info for convert-timezone should have a `converted_timezone` property"
    (is (= {:converted_timezone "Asia/Ho_Chi_Minh"
            :base_type          :type/DateTime
            :name               "last-login-converted"
            :display_name       "last-login-converted"
            :expression_name    "last-login-converted"
            :field_ref          [:expression "last-login-converted"]}
           (#'calculate/col-info-for-field-clause
            {:expressions {"last-login-converted" [:convert-timezone (meta/id :users :last-login) "Asia/Ho_Chi_Minh" "UTC"]}}
            [:expression "last-login-converted"])))
    (is (= {:converted_timezone "Asia/Ho_Chi_Minh"
            :base_type          :type/DateTime
            :name               "last-login-converted"
            :display_name       "last-login-converted"
            :expression_name    "last-login-converted"
            :field_ref          [:expression "last-login-converted"]}
           (#'calculate/col-info-for-field-clause
            {:expressions {"last-login-converted" [:datetime-add
                                                   [:convert-timezone (meta/id :users :last-login) "Asia/Ho_Chi_Minh" "UTC"] 2 :hour]}}
            [:expression "last-login-converted"])))))

(deftest ^:parallel col-info-for-expression-error-message-test
  (testing "if there is no matching expression it should give a meaningful error message"
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs js/Error)
         #"No expression named 'double-price'"
         (#'calculate/col-info-for-field-clause {:expressions {"one-hundred" 100}} [:expression "double-price"])))
    (try
      (#'calculate/col-info-for-field-clause {:expressions {"one-hundred" 100}} [:expression "double-price"])
      (catch #?(:clj Throwable :cljs js/Error) e
        (is (= {:expression-name "double-price"
                :tried           ["double-price" :double-price]
                :found           #{"one-hundred"}
                :type            :invalid-query}
               (ex-data e)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    (MBQL) Col info for Aggregation clauses                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; test that added information about aggregations looks the way we'd expect
(defn- aggregation-names
  ([ag-clause]
   (aggregation-names {} ag-clause))

  ([inner-query ag-clause]
   {:name         (calculate/aggregation-name ag-clause)
    :display_name (calculate/aggregation-display-name inner-query ag-clause)}))

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
      (is (= {:name "expression", :display_name "Min of ID + (2 * Average of Price)"}
             (aggregation-names
              [:+
               [:min [:field (meta/id :venues :id) nil]]
               [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]))))

    (testing "very complicated expression"
      (is (= {:name "expression", :display_name "Min of ID + (2 * Average of Price * 3 * (Max of Category ID - 4))"}
             (aggregation-names
              [:+
               [:min [:field (meta/id :venues :id) nil]]
               [:*
                2
                [:avg [:field (meta/id :venues :price) nil]]
                3
                [:- [:max [:field (meta/id :venues :category_id) nil]] 4]]])))))

  (testing "`aggregation-options`"
    (testing "`:name` and `:display-name`"
      (is (= {:name "generated_name", :display_name "User-specified Name"}
             (aggregation-names
              [:aggregation-options
               [:+ [:min [:field (meta/id :venues :id) nil]] [:* 2 [:avg [:field (meta/id :venues :price) nil]]]]
               {:name "generated_name", :display-name "User-specified Name"}]))))

    (testing "`:name` only"
      (is (= {:name "generated_name", :display_name "Min of ID + (2 * Average of Price)"}
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
   (col-info-for-aggregation-clause {} clause))

  ([inner-query clause]
   (#'calculate/col-info-for-aggregation-clause inner-query clause)))

(deftest ^:parallel col-info-for-aggregation-clause-test
  (testing "basic aggregation clauses"
    (testing "`:count` (no field)"
      (is (= {:base_type :type/Float, :name "expression", :display_name "Count / 2"}
             (col-info-for-aggregation-clause [:/ [:count] 2]))))

    (testing "`:sum`"
      (is (= {:base_type :type/Float, :name "sum", :display_name "Sum of Price + 1"}
             (col-info-for-aggregation-clause [:sum [:+ [:field (meta/id :venues :price) nil] 1]])))))

  (testing "`:aggregation-options`"
    (testing "`:name` and `:display-name`"
      (is (= {:base_type     :type/Integer
              :semantic_type :type/Category
              :settings      nil
              :name          "sum_2"
              :display_name  "My custom name"}
             (col-info-for-aggregation-clause
              [:aggregation-options [:sum [:field (meta/id :venues :price) nil]] {:name "sum_2", :display-name "My custom name"}]))))

    (testing "`:name` only"
      (is (= {:base_type     :type/Integer
              :semantic_type :type/Category
              :settings      nil
              :name          "sum_2"
              :display_name  "Sum of Price"}
             (col-info-for-aggregation-clause [:aggregation-options [:sum [:field (meta/id :venues :price) nil]] {:name "sum_2"}]))))

    (testing "`:display-name` only"
      (is (= {:base_type     :type/Integer
              :semantic_type :type/Category
              :settings      nil
              :name          "sum"
              :display_name  "My Custom Name"}
             (col-info-for-aggregation-clause
              [:aggregation-options [:sum [:field (meta/id :venues :price) nil]] {:display-name "My Custom Name"}]))))))

(deftest ^:parallel col-info-named-aggregation-test
  (testing "col info for an `expression` aggregation w/ a named expression should work as expected"
    (is (= {:base_type :type/Float, :name "sum", :display_name "Sum of double-price"}
           (col-info-for-aggregation-clause
            {:expressions {"double-price" [:* [:field (meta/id :venues :price) nil] 2]}}
            [:sum [:expression "double-price"]])))))

(defn- add-column-info [query metadata]
  'FIXME)

(deftest ^:parallel col-info-for-aggregation-clause-merge-driver-metadata-test
  (testing (str "if a driver is kind enough to supply us with some information about the `:cols` that come back, we "
                "should include that information in the results. Their information should be preferred over ours")
    (is (= {:cols [{:name           "metric"
                    :display_name   "Total Events"
                    :base_type      :type/Text
                    :effective_type :type/Text
                    :source         :aggregation
                    :field_ref      [:aggregation 0]}]}
           (add-column-info
            {:database (meta/id)
             :type     :query
             :query    {:source-table (meta/id :venues)
                        :aggregation  [[:metric "ga:totalEvents"]]}}
            {:cols [{:name "totalEvents", :display_name "Total Events", :base_type :type/Text}]})))))

(defn- infered-col-type
  [expr]
  (-> (add-column-info {:database (meta/id)
                        :type     :query
                        :query    {:source-table (meta/id :venues)
                                   :expressions  {"expr" expr}
                                   :fields       [[:expression "expr"]]
                                   :limit        10}}
                       {})
      :cols
      first
      (select-keys [:base_type :semantic_type])))

(defn- infer [expr] (-> {:database (meta/id)
                         :type     :query
                         :query    {:source-table (meta/id :venues)
                                    :expressions  {"expr" expr}
                                    :fields       [[:expression "expr"]]
                                    :limit        10}}
                        (add-column-info {})
                        :cols
                        first))

(deftest ^:parallel infer-coalesce-test
  (testing "Coalesce"
    (testing "Uses the first clause"
      (testing "Gets the type information from the field"
        (is (= {:semantic_type     :type/Name
                :coercion_strategy nil
                :name              "expr"
                :expression_name   "expr"
                :source            :fields
                :field_ref         [:expression "expr"]
                :effective_type    :type/Text
                :display_name      "expr"
                :base_type         :type/Text}
               (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])))
        (testing "Does not contain a field id in its analysis (#18513)"
          (is (false? (contains? (infer [:coalesce [:field (meta/id :venues :name) nil] "bar"])
                                 :id)))))
      (testing "Gets the type information from the literal"
        (is (= {:base_type       :type/Text
                :name            "expr"
                :display_name    "expr"
                :expression_name "expr"
                :field_ref       [:expression "expr"]
                :source          :fields}
               (infer [:coalesce "bar" [:field (meta/id :venues :name) nil]])))))))

(deftest ^:parallel infer-case-test
  (testing "Case"
    (testing "Uses first available type information"
      (testing "From a field"
        (is (= {:semantic_type     :type/Name
                :coercion_strategy nil
                :name              "expr"
                :expression_name   "expr"
                :source            :fields
                :field_ref         [:expression "expr"]
                :effective_type    :type/Text
                :display_name      "expr"
                :base_type         :type/Text}
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
             (infered-col-type [:case [[[:<
                                         [:field (meta/id :venues :price) nil]
                                         10]
                                        [:value nil {:base_type :type/Number}]]
                                       [[:> [:field (meta/id :venues :price) nil] 2] 10]]]))))
    (is (= {:base_type :type/Float}
           (infered-col-type [:case [[[:>
                                       [:field (meta/id :venues :price) nil]
                                       2]
                                      [:+
                                       [:field (meta/id :venues :price) nil]
                                       1]]]])))))

(deftest ^:parallel datetime-arithmetics?-test
  (are [x] (#'calculate/datetime-arithmetics? x)
    [:interval -1 :month]
    [:field (meta/id :checkins :date) {:temporal-unit :month}])
  (are [x] (not (#'calculate/datetime-arithmetics? x))
    [:+ 1 [:temporal-extract
           [:+ [:field (meta/id :checkins :date) nil] [:interval -1 :month]]
           :year]]
    [:+ [:field (meta/id :checkins :date) nil] 3]))

(deftest ^:parallel temporal-extract-test
  (are [clause] (= {:base_type :type/DateTime}
                   (infered-col-type clause))
    [:datetime-add [:field (meta/id :checkins :date) nil] 2 :month]
    [:datetime-add [:field (meta/id :checkins :date) nil] 2 :hour]
    [:datetime-add [:field (meta/id :users :last-login) nil] 2 :month]))

(deftest ^:parallel test-string-extracts
  (are [clause expected] (= expected
                            ((infered-col-type clause)))
    [:trim "foo"]                                        {:base_type :type/Text}
    [:ltrim "foo"]                                       {:base_type :type/Text}
    [:rtrim "foo"]                                       {:base_type :type/Text}
    [:length "foo"]                                      {:base_type :type/BigInteger}
    [:upper "foo"]                                       {:base_type :type/Text}
    [:lower "foo"]                                       {:base_type :type/Text}
    [:substring "foo" 2]                                 {:base_type :type/Text}
    [:replace "foo" "f" "b"]                             {:base_type :type/Text}
    [:regex-match-first "foo" "f"]                       {:base_type :type/Text}
    [:concat "foo" "bar"]                                {:base_type :type/Text}
    [:coalesce "foo" "bar"]                              {:base_type :type/Text}
    [:coalesce [:field (meta/id :venues :name) nil] "bar"] {:base_type :type/Text, :semantic_type :type/Name}))

(deftest ^:parallel unique-name-key-test
  (testing "Make sure `:cols` always come back with a unique `:name` key (#8759)"
    (is (= {:cols
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
            {:aggregation [[:count]
                           [:sum]
                           [:count]
                           [:aggregation-options [:count] {:display-name "count_2"}]]}
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
                {:expressions {"discount_price" [:* 0.9 [:field (meta/id :venues :price) nil]]}
                 :fields      [[:field (meta/id :venues :name) nil]
                               [:expression "discount_price"]]
                 :limit       10}
                {})
               :cols
               second)))))

(deftest ^:parallel deduplicate-expression-names-in-aggregations-test
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "expressions in aggregations"
      (is (= [{:base_type    :type/Float
               :name         "expression"
               :display_name "0.9 * Average of Price"
               :source       :aggregation
               :field_ref    [:aggregation 0]}
              {:base_type    :type/Float
               :name         "expression_2"
               :display_name "0.8 * Average of Price"
               :source       :aggregation
               :field_ref    [:aggregation 1]}]
             (:cols (add-column-info
                     {:aggregation [[:*
                                     0.9
                                     [:avg [:field (meta/id :venues :price) nil]]]
                                    [:*
                                     0.8
                                     [:avg [:field (meta/id :venues :price) nil]]]]
                      :limit       10}
                     {})))))))

(deftest ^:parallel deduplicate-named-expressions-test
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "named :expressions"
      (is (= [{:name            "prev_month"
               :display_name    "prev_month"
               :base_type       :type/DateTime
               :expression_name "prev_month"
               :source          :fields
               :field_ref       [:expression "prev_month"]}]
             (:cols (add-column-info
                     {:expressions {:prev_month [:+ (meta/id :users :last-login) [:interval -1 :month]]}
                      :fields      [[:expression "prev_month"]], :limit 10}
                     {})))))))
