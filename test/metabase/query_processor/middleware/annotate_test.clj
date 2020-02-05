(ns metabase.query-processor.middleware.annotate-test
  (:require [clojure.test :refer :all]
            [flatland.ordered.map :as ordered-map]
            [metabase
             [driver :as driver]
             [models :refer [Field]]
             [test :as mt]
             [util :as u]]
            [metabase.query-processor
             [store :as qp.store]
             [test-util :as qp.test-util]]
            [metabase.query-processor.middleware.annotate :as annotate]
            [metabase.test.data :as data]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- add-column-info [query metadata]
  (qp.test-util/with-everything-store
    (driver/with-driver :h2
      (:metadata (mt/test-qp-middleware annotate/add-column-info query metadata [])))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             column-info (:native)                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest native-column-info-test
  (testing "make sure that `column-info` for `:native` queries can still infer types even if the initial value(s) are `nil` (#4256)"
    (is (= [{:name "a", :display_name "a", :base_type :type/Integer, :source :native, :field_ref [:field-literal "a" :type/Integer]}
            {:name "b", :display_name "b", :base_type :type/Integer, :source :native, :field_ref [:field-literal "b" :type/Integer]}]
           (annotate/column-info
            {:type :native}
            {:cols [{:name "a"} {:name "b"}]
             :rows [[1 nil] [2 nil] [3 nil] [4 5] [6 7]]}))))

  (testing "make sure that `column-info` for `:native` queries defaults `base_type` to `type/*` if there are no non-nil values when we peek."
    (is (= [{:name "a", :display_name "a", :base_type :type/*, :source :native, :field_ref [:field-literal "a" :type/*]}]
           (annotate/column-info
            {:type :native}
            {:cols [{:name "a"}]
             :rows [[nil]]})))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       (MBQL) Col info for Field clauses                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- info-for-field
  ([field-id]
   (db/select-one (into [Field] (disj (set @#'qp.store/field-columns-to-fetch) :database_type)) :id field-id))

  ([table-key field-key]
   (info-for-field (data/id table-key field-key))))

;; make sure columns are comming back the way we'd expect
(deftest expect--2052672981
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--2052672981)))
    (is (= [(assoc (info-for-field :venues :price) :source :fields :field_ref [:field-id (data/id :venues :price)])]
                 (qp.test-util/with-everything-store (vec (annotate/column-info {:type :query, :query {:fields [[:field-id (data/id :venues :price)]]}} {:columns [:price]})))))))

;; when an `fk->` form is used, we should add in `:fk_field_id` info about the source Field
;;
;; TODO - this can be removed, now that `fk->` forms are "sugar" and replaced with `:joined-field` clauses before the
;; query ever makes it to the 'annotate' stage
(deftest expect-479991955
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-479991955)))
    (is (= [(data/$ids venues (assoc (info-for-field :categories :name) :fk_field_id %category_id :source :fields :field_ref $category_id->categories.name))]
                 (qp.test-util/with-everything-store (doall (annotate/column-info {:type :query, :query {:fields (data/$ids venues [$category_id->categories.name])}} {:columns [:name]})))))))

;; we should get `:fk_field_id` and information where possible when using `:joined-field` clauses; display_name should
;; include the display name of the FK field  (for IMPLICIT JOINS)
(deftest expect-1491452581
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-1491452581)))
    (is (= [(data/$ids venues (assoc (info-for-field :categories :name) :display_name "Category → Name" :source :fields :field_ref $category_id->categories.name :fk_field_id %category_id))]
                 (qp.test-util/with-everything-store
                   (data/$ids
                       venues
                       (doall
                        (annotate/column-info
                         {:type :query,
                          :query
                          {:fields [&CATEGORIES__via__CATEGORY_ID.categories.name],
                           :joins
                           [{:alias "CATEGORIES__via__CATEGORY_ID",
                             :source-table $$venues,
                             :condition [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id],
                             :strategy :left-join,
                             :fk-field-id %category_id}]}}
                         {:columns [:name]}))))))))

;; for EXPLICIT JOINS (which do not include an `:fk-field-id` in the Join info) the returned `:field_ref` should be a
;; `joined-field` clause instead of an `fk->` clause
(deftest expect-1444323149
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-1444323149)))
    (is (= [(data/$ids venues (assoc (info-for-field :categories :name) :display_name "Categories → Name" :source :fields :field_ref &Categories.categories.name))]
                 (qp.test-util/with-everything-store
                   (data/$ids
                       venues
                       (doall
                        (annotate/column-info
                         {:type :query,
                          :query {:fields [&Categories.categories.name], :joins [{:alias "Categories", :source-table $$venues, :condition [:= $category_id &Categories.categories.id], :strategy :left-join}]}}
                         {:columns [:name]}))))))))

;; when a `:datetime-field` form is used, we should add in info about the `:unit`
(deftest expect--581209562
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--581209562)))
    (is (= [(data/$ids venues (assoc (info-for-field :venues :price) :unit :month :source :fields :field_ref !month.price))]
                 (qp.test-util/with-everything-store (doall (annotate/column-info {:type :query, :query {:fields (data/$ids venues [!month.price])}} {:columns [:price]})))))))

;; datetime unit should work on field literals too
(deftest expect--1751930841
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--1751930841)))
    (is (= [(data/$ids venues {:name "price", :base_type :type/Number, :display_name "Price", :unit :month, :source :fields, :field_ref !month.*price/Number})]
                 (doall (annotate/column-info {:type :query, :query {:fields [[:datetime-field [:field-literal "price" :type/Number] :month]]}} {:columns [:price]}))))))

;; when binning-strategy is used, include `:binning_info`
(deftest expect--670793297
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--670793297)))
    (is (= [{:name "price",
                   :base_type :type/Number,
                   :display_name "Price",
                   :unit :month,
                   :source :fields,
                   :binning_info {:num_bins 10, :bin_width 5, :min_value -100, :max_value 100, :binning_strategy :num-bins},
                   :field_ref [:binning-strategy [:datetime-field [:field-literal "price" :type/Number] :month] :num-bins 10 {:num-bins 10, :bin-width 5, :min-value -100, :max-value 100}]}]
                 (doall
                  (annotate/column-info
                   {:type :query,
                    :query {:fields [[:binning-strategy [:datetime-field [:field-literal "price" :type/Number] :month] :num-bins 10 {:num-bins 10, :bin-width 5, :min-value -100, :max-value 100}]]}}
                   {:columns [:price]}))))))

(deftest combine-parent-field-names-test
  (testing "For fields with parents we should return them with a combined name including parent's name"
    (tt/with-temp* [Field [parent {:name "parent", :table_id (data/id :venues)}]
                    Field [child  {:name "child", :table_id (data/id :venues), :parent_id (u/get-id parent)}]]
      (qp.test-util/with-everything-store
        (is (= {:description     nil
                :table_id        (data/id :venues)
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
    (tt/with-temp* [Field [grandparent {:name "grandparent", :table_id (data/id :venues)}]
                    Field [parent      {:name "parent", :table_id (data/id :venues), :parent_id (u/get-id grandparent)}]
                    Field [child       {:name "child", :table_id (data/id :venues), :parent_id (u/get-id parent)}]]
      (qp.test-util/with-everything-store
        (is (= {:description     nil
                :table_id        (data/id :venues)
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

;; datetime literals should get the information from the matching `:source-metadata` if it was supplied
(deftest expect-1418170855
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-1418170855)))
    (is (= {:name "sum", :display_name "sum of User ID", :base_type :type/Integer, :field_ref [:field-literal "sum" :type/Integer], :special_type :type/FK}
                 (qp.test-util/with-everything-store
                   (#'annotate/col-info-for-field-clause
                    {:source-metadata
                     [{:name "abc", :display_name "another Field", :base_type :type/Integer, :special_type :type/FK}
                      {:name "sum", :display_name "sum of User ID", :base_type :type/Integer, :special_type :type/FK}]}
                    [:field-literal "sum" :type/Integer]))))))

;; col info for an `expression` should work as expected
(deftest expect-1566919127
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-1566919127)))
    (is (= {:base_type :type/Float, :special_type :type/Number, :name "double-price", :display_name "double-price", :expression_name "double-price", :field_ref [:expression "double-price"]}
                 (qp.test-util/with-everything-store (data/$ids venues (#'annotate/col-info-for-field-clause {:expressions {"double-price" [:* $price 2]}} [:expression "double-price"])))))))

;; if there is no matching expression it should give a meaningful error message
(deftest expect-1783284936
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-1783284936)))
    (is (= {:message "No expression named double-price found. Found: (\"one-hundred\")", :data {:type :invalid-query, :clause [:expression "double-price"], :expressions {"one-hundred" 100}}}
                 (try
                   (qp.test-util/with-everything-store (data/$ids venues (#'annotate/col-info-for-field-clause {:expressions {"one-hundred" 100}} [:expression "double-price"])))
                   (catch Throwable e {:message (.getMessage e), :data (ex-data e)}))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    (MBQL) Col info for Aggregation clauses                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; test that added information about aggregations looks the way we'd expect
(defn- aggregation-names
  ([ag-clause]
   (aggregation-names {} ag-clause))

  ([inner-query ag-clause]
   (binding [driver/*driver* :h2]
     (qp.test-util/with-everything-store
       {:name         (annotate/aggregation-name ag-clause)
        :display_name (annotate/aggregation-display-name inner-query ag-clause)}))))

(deftest expect--242073245
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--242073245)))
    (is (= {:name "count", :display_name "Count"}
                 (aggregation-names [:count])))))

(deftest expect--462870214
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--462870214)))
    (is (= {:name "count", :display_name "Distinct values of ID"}
                 (aggregation-names [:distinct [:field-id (data/id :venues :id)]])))))

(deftest expect-765776252
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-765776252)))
    (is (= {:name "sum", :display_name "Sum of ID"}
                 (aggregation-names [:sum [:field-id (data/id :venues :id)]])))))

(deftest expect--1802213894
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--1802213894)))
    (is (= {:name "expression", :display_name "Count + 1"}
                 (aggregation-names [:+ [:count] 1])))))

(deftest expect--531016665
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--531016665)))
    (is (= {:name "expression", :display_name "Min of ID + (2 * Average of Price)"}
                 (aggregation-names [:+ [:min [:field-id (data/id :venues :id)]] [:* 2 [:avg [:field-id (data/id :venues :price)]]]])))))

(deftest expect-1301347168
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-1301347168)))
    (is (= {:name "expression", :display_name "Min of ID + (2 * Average of Price * 3 * (Max of Category ID - 4))"}
                 (aggregation-names [:+ [:min [:field-id (data/id :venues :id)]] [:* 2 [:avg [:field-id (data/id :venues :price)]] 3 [:- [:max [:field-id (data/id :venues :category_id)]] 4]]])))))

;; `aggregation-options` (`:name` and `:display-name`)
(deftest expect-2067942453
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-2067942453)))
    (is (= {:name "generated_name", :display_name "User-specified Name"}
                 (aggregation-names
                  [:aggregation-options [:+ [:min [:field-id (data/id :venues :id)]] [:* 2 [:avg [:field-id (data/id :venues :price)]]]] {:name "generated_name", :display-name "User-specified Name"}])))))

;; `aggregation-options` (`:name` only)
(deftest expect--1008250415
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--1008250415)))
    (is (= {:name "generated_name", :display_name "Min of ID + (2 * Average of Price)"}
                 (aggregation-names [:aggregation-options [:+ [:min [:field-id (data/id :venues :id)]] [:* 2 [:avg [:field-id (data/id :venues :price)]]]] {:name "generated_name"}])))))

;; `aggregation-options` (`:display-name` only)
(deftest expect-537267899
  (testing (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-537267899)))
    (is (= {:name "expression", :display_name "User-specified Name"}
                 (aggregation-names [:aggregation-options [:+ [:min [:field-id (data/id :venues :id)]] [:* 2 [:avg [:field-id (data/id :venues :price)]]]] {:display-name "User-specified Name"}])))))

;; make sure custom aggregation names get included in the col info
(defn- col-info-for-aggregation-clause
  ([clause]
   (col-info-for-aggregation-clause {} clause))

  ([inner-query clause]
   (binding [driver/*driver* :h2]
     (#'annotate/col-info-for-aggregation-clause inner-query clause))))

(deftest expect-1077807188
  (testing
      (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-1077807188)))
      (is (= {:base_type :type/Float, :special_type :type/Number, :name "expression", :display_name "Count / 2"} (col-info-for-aggregation-clause [:/ [:count] 2])))))

(deftest
  expect--949617696
  (testing
      (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--949617696)))
      (is
       (=
        {:base_type :type/Float, :special_type :type/Number, :name "sum", :display_name "Sum of Price + 1"}
        (qp.test-util/with-everything-store (data/$ids venues (col-info-for-aggregation-clause [:sum [:+ $price 1]])))))))

;; col info for `:aggregation-options` (`:name` and `:display-name`)
(deftest
  expect--1336079763
  (testing
      (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--1336079763)))
      (is
       (=
        {:base_type :type/Integer, :special_type :type/Category, :settings nil, :name "sum_2", :display_name "My custom name"}
        (qp.test-util/with-everything-store (data/$ids venues (col-info-for-aggregation-clause [:aggregation-options [:sum $price] {:name "sum_2", :display-name "My custom name"}])))))))

;; col info for `:aggregation-options` (`:name` only)
(deftest
  expect--133386877
  (testing
      (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--133386877)))
      (is
       (=
        {:base_type :type/Integer, :special_type :type/Category, :settings nil, :name "sum_2", :display_name "Sum of Price"}
        (qp.test-util/with-everything-store (data/$ids venues (col-info-for-aggregation-clause [:aggregation-options [:sum $price] {:name "sum_2"}])))))))

;; col info for `:aggregation-options` (`:display-name` only)
(deftest
  expect--1201188449
  (testing
      (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--1201188449)))
      (is
       (=
        {:base_type :type/Integer, :special_type :type/Category, :settings nil, :name "sum", :display_name "My Custom Name"}
        (qp.test-util/with-everything-store (data/$ids venues (col-info-for-aggregation-clause [:aggregation-options [:sum $price] {:display-name "My Custom Name"}])))))))

(deftest merge-driver-metadata-test
  (testing (str "if a driver is kind enough to supply us with some information about the `:cols` that come back, we "
                "should include that information in the results. Their information should be preferred over ours")
    (is (= {:cols [{:name "totalEvents", :display_name "Total Events", :base_type :type/Text, :source :aggregation, :field_ref [:aggregation 0]}]}
           (add-column-info
            (data/mbql-query venues {:aggregation [[:metric "ga:totalEvents"]]})
            {:cols [{:name "totalEvents", :display_name "Total Events", :base_type :type/Text}]})))))

;; col info for an `expression` aggregation w/ a named expression should work as expected
(deftest
  expect--1874746252
  (testing
      (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--1874746252)))
      (is
       (=
        {:base_type :type/Float, :special_type :type/Number, :name "sum", :display_name "Sum of double-price"}
        (qp.test-util/with-everything-store (data/$ids venues (col-info-for-aggregation-clause {:expressions {"double-price" [:* $price 2]}} [:sum [:expression "double-price"]])))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Other MBQL col info tests                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Make sure `:cols` always come back with a unique `:name` key (#8759)
(deftest
  expect--1348197951
  (testing
      (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--1348197951)))
      (is
       (=
        {:cols
         [{:base_type :type/Number, :special_type :type/Number, :name "count", :display_name "count", :source :aggregation, :field_ref [:aggregation 0]}
          {:source :aggregation, :name "sum", :display_name "sum", :base_type :type/Number, :field_ref [:aggregation 1]}
          {:base_type :type/Number, :special_type :type/Number, :name "count_2", :display_name "count", :source :aggregation, :field_ref [:aggregation 2]}
          {:base_type :type/Number, :special_type :type/Number, :name "count_2_2", :display_name "count_2", :source :aggregation, :field_ref [:aggregation 3]}]}
        (add-column-info
         (data/mbql-query venues {:aggregation [[:count] [:sum] [:count] [:aggregation-options [:count] {:display-name "count_2"}]]})
         {:cols
          [{:name "count", :display_name "count", :base_type :type/Number}
           {:name "sum", :display_name "sum", :base_type :type/Number}
           {:name "count", :display_name "count", :base_type :type/Number}
           {:name "count_2", :display_name "count_2", :base_type :type/Number}]})))))

;; make sure expressions come back with the right set of keys, including `:expression_name` (#8854)
(deftest
  expect-1963133663
  (testing
      (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-1963133663)))
      (is
       (=
        {:name "discount_price",
         :display_name "discount_price",
         :base_type :type/Float,
         :special_type :type/Number,
         :expression_name "discount_price",
         :source :fields,
         :field_ref [:expression "discount_price"]}
        (-> (add-column-info (data/mbql-query venues {:expressions {"discount_price" [:* 0.9 $price]}, :fields [$name [:expression "discount_price"]], :limit 10}) {}) :cols second)))))


(deftest deduplicate-expression-names-test
  (testing "make sure multiple expressions come back with deduplicated names"
    (testing "expressions in aggregations"
      (is (= [{:base_type :type/Float, :special_type :type/Number, :name "expression", :display_name "0.9 * Average of Price", :source :aggregation, :field_ref [:aggregation 0]}
              {:base_type :type/Float, :special_type :type/Number, :name "expression_2", :display_name "0.8 * Average of Price", :source :aggregation, :field_ref [:aggregation 1]}]
             (:cols (add-column-info
                     (data/mbql-query venues
                       {:aggregation [[:* 0.9 [:avg $price]] [:* 0.8 [:avg $price]]]
                        :limit       10})
                     {})))))
    (testing "named :expressions"
      (is (= [{:name "prev_month", :display_name "prev_month", :base_type :type/DateTime, :special_type nil, :expression_name "prev_month", :source :fields, :field_ref [:expression "prev_month"]}]
             (:cols (add-column-info
                     (data/mbql-query users
                       {:expressions {:prev_month [:+ $last_login [:interval -1 :month]]}
                        :fields      [[:expression "prev_month"]], :limit 10})
                     {})))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           result-rows-maps->vectors                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; If a driver returns result rows as a sequence of maps, does the `result-rows-maps->vectors` convert them to a
;; sequence of vectors in the correct order?
(deftest
  expect--2110350788
  (testing
      (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--2110350788)))
      (is
       (=
        {:rows [[1 "Red Medicine" 4 10.0646 -165.374 3]], :columns ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"]}
        (qp.test-util/with-everything-store
          (driver/with-driver
              :h2
              (let [results {:rows [{:CATEGORY_ID 4, :ID 1, :LATITUDE 10.0646, :LONGITUDE -165.374, :NAME "Red Medicine", :PRICE 3}]}]
                ((annotate/result-rows-maps->vectors (constantly results))
                 (data/mbql-query venues {:source-table $$venues, :fields [$id $name $category_id $latitude $longitude $price], :limit 1})))))))))

;; if a driver would have returned result rows as a sequence of maps, but query returned no results, middleware should
;; still add `:columns` info
(deftest
  expect-1151836848
  (testing
      (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect-1151836848)))
      (is
       (=
        {:rows [], :columns ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"]}
        (qp.test-util/with-everything-store
          (driver/with-driver
              :h2
              (let [results {:rows []}]
                ((annotate/result-rows-maps->vectors (constantly results))
                 (data/mbql-query venues {:source-table $$venues, :fields [$id $name $category_id $latitude $longitude $price], :limit 1})))))))))

;; `result-rows-maps->vectors` should preserve sort order of columns in the first result row for native queries
;; (hopefully the driver is using Flatland `ordered-map` as suggested)
(deftest
  expect--810009133
  (testing
      (format "metabase.query-processor.middleware.annotate-test:%d" (:line (meta #'expect--810009133)))
      (is
       (=
        {:rows [[1 10.0646 -165.374 "Red Medicine" 3]], :columns ["ID" "LATITUDE" "LONGITUDE" "NAME" "PRICE"]}
        (qp.test-util/with-everything-store
          (driver/with-driver
              :h2
              (let [results {:rows [(ordered-map/ordered-map :ID 1 :LATITUDE 10.0646 :LONGITUDE -165.374 :NAME "Red Medicine" :PRICE 3)]}]
                ((annotate/result-rows-maps->vectors (constantly results)) {:database (data/id), :type :native}))))))))
