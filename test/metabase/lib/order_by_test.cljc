(ns metabase.lib.order-by-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel order-by-test
  (is (=? {:database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :order-by     [[:asc
                                       {:lib/uuid string?}
                                       [:field {:lib/uuid string?} (meta/id :venues :id)]]]}]}
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/order-by (lib/field "VENUES" "ID"))))))

(deftest ^:parallel threading-test
  (is (=? {:database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :order-by     [[:asc
                                       {:lib/uuid string?}
                                       [:field {:lib/uuid string?} (meta/id :venues :id)]]]}]}
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/order-by (lib/field "VENUES" "ID"))
              (dissoc :lib/metadata)))))

(deftest ^:parallel threading-with-direction-test
  (is (=? {:database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :order-by     [[:desc
                                       {:lib/uuid string?}
                                       [:field {:lib/uuid string?} (meta/id :venues :id)]]]}]}
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/order-by (lib/field "VENUES" "ID") :desc)
              (dissoc :lib/metadata)))))

(deftest ^:parallel specific-stage-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid string?}
                       :source-table (meta/id :venues)}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid string?}
                       :order-by    [[:asc
                                      {:lib/uuid string?}
                                      [:field {:lib/uuid string?} (meta/id :venues :id)]]]}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid string?}}]}
          (-> (lib/query meta/metadata-provider {:database (meta/id)
                                                 :type     :query
                                                 :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}})
              (lib/order-by 1 (lib/field "VENUES" "ID") :asc)
              (dissoc :lib/metadata)))))

(deftest ^:parallel order-by-field-metadata-test
  (testing "Should be able to create an order by using raw Field metadata"
    (is (=? [:asc
             {:lib/uuid string?}
             [:field {:lib/uuid string?} (meta/id :venues :id)]]
            (lib/order-by-clause {} -1 (lib.metadata/field meta/metadata-provider nil "VENUES" "ID"))))))

(deftest ^:parallel append-order-by-field-metadata-test
  (testing "Should be able to add an order by using raw Field metadata"
    (let [query     (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
          venues-id (lib.metadata/field query (meta/id :venues :id))]
      (is (=? {:database (meta/id)
               :stages   [{:lib/type     :mbql.stage/mbql
                           :source-table (meta/id :categories)
                           :order-by     [[:asc
                                           {:lib/uuid string?}
                                           [:field {:lib/uuid string?} (meta/id :venues :id)]]]}]}
              (lib/order-by query venues-id))))))

(deftest ^:parallel order-bys-test
  (is (=? [[:asc
            {:lib/uuid string?}
            [:field {:lib/uuid string?} (meta/id :venues :id)]]]
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/order-by (lib/field "VENUES" "ID"))
              lib/order-bys))))

;;; the following tests use raw legacy MBQL because they're direct ports of JavaScript tests from MLv1 and I wanted to
;;; make sure that given an existing query the expected description was generated correctly.

(defn- describe-legacy-query-order-by [query]
  (-> (lib.query/query meta/metadata-provider (lib.convert/->pMBQL query))
      (lib.metadata.calculation/describe-top-level-key -1 :order-by)))

(deftest ^:parallel describe-order-by-test
  (let [query {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :venues)
                          :order-by     [[:asc [:field (meta/id :venues :category-id) nil]]]}}]
    (is (= "Sorted by Category ID ascending"
           (describe-legacy-query-order-by query)))))

(deftest ^:parallel describe-order-by-aggregation-reference-test
  (let [query {:database (meta/id)
               :type     :query
               :query    {:source-table (meta/id :venues)
                          :aggregation  [[:count]]
                          :breakout     [[:field (meta/id :venues :category-id) nil]]
                          :order-by     [[:asc [:aggregation 0]]]}}]
    (is (= "Sorted by Count ascending"
           (describe-legacy-query-order-by query)))))

(deftest ^:parallel orderable-columns-breakouts-test
  (testing "If query has aggregations and/or breakouts you can only order by those."
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/aggregate (lib/sum (lib/field "VENUES" "PRICE")))
                    (lib/aggregate (lib/avg (lib/+ (lib/field "VENUES" "PRICE") 1)))
                    (lib/breakout (lib/field "VENUES" "CATEGORY_ID")))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:database_type      "INTEGER"
                  :semantic_type      :type/FK
                  :lib/type           :metadata/field
                  :table_id           (meta/id :venues)
                  :name               "CATEGORY_ID"
                  :has_field_values   :none
                  :lib/source         :source/breakouts
                  :fk_target_field_id (meta/id :categories :id)
                  :effective_type     :type/Integer
                  :id                 (meta/id :venues :category-id)
                  :display_name       "Category ID"
                  :base_type          :type/Integer}
                 {:lib/type     :metadata/field
                  :base_type    :type/Integer
                  :name         "sum_price"
                  :display_name "Sum of Price"
                  :lib/source   :source/aggregations}
                 {:lib/type     :metadata/field
                  :base_type    :type/Float
                  :name         "avg_price_plus_1"
                  :display_name "Average of Price + 1"
                  :lib/source   :source/aggregations}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-columns-breakouts-with-expression-test
  (testing "If query has aggregations and/or breakouts you can only order by those (with an expression)"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/expression "Category ID + 1"  (lib/+ (lib/field "VENUES" "CATEGORY_ID") 1))
                    (lib/breakout [:expression {:lib/uuid (str (random-uuid))} "Category ID + 1"]))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:lib/type     :metadata/field
                  :name         "Category ID + 1"
                  :display_name "Category ID + 1"
                  :base_type    :type/Integer
                  :lib/source   :source/breakouts}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-columns-test
  (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")]
    (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
      (is (=? [{:lib/type     :metadata/field
                :name         "ID"
                :display_name "ID"
                :id           (meta/id :venues :id)
                :table_id     (meta/id :venues)
                :base_type    :type/BigInteger}
               {:lib/type     :metadata/field
                :name         "NAME"
                :display_name "Name"
                :id           (meta/id :venues :name)
                :table_id     (meta/id :venues)
                :base_type    :type/Text}
               {:lib/type     :metadata/field
                :name         "CATEGORY_ID"
                :display_name "Category ID"
                :id           (meta/id :venues :category-id)
                :table_id     (meta/id :venues)}
               {:lib/type     :metadata/field
                :name         "LATITUDE"
                :display_name "Latitude"
                :id           (meta/id :venues :latitude)
                :table_id     (meta/id :venues)
                :base_type    :type/Float}
               {:lib/type     :metadata/field
                :name         "LONGITUDE"
                :display_name "Longitude"
                :id           (meta/id :venues :longitude)
                :table_id     (meta/id :venues)
                :base_type    :type/Float}
               {:lib/type     :metadata/field
                :name         "PRICE"
                :display_name "Price"
                :id           (meta/id :venues :price)
                :table_id     (meta/id :venues)
                :base_type    :type/Integer}
               {:lib/type     :metadata/field
                :name         "ID"
                :display_name "ID"
                :id           (meta/id :categories :id)
                :table_id     (meta/id :categories)
                :base_type    :type/BigInteger}
               {:lib/type     :metadata/field
                :name         "NAME"
                :display_name "Name"
                :id           (meta/id :categories :name)
                :table_id     (meta/id :categories)
                :base_type    :type/Text}]
              (lib/orderable-columns query))))))

(deftest ^:parallel orderable-expressions-test
  (testing "orderable-columns should include expressions"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/expression "Category ID + 1"  (lib/+ (lib/field "VENUES" "CATEGORY_ID") 1)))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:lib/type     :metadata/field
                  :base_type    :type/Integer
                  :name         "Category ID + 1"
                  :display_name "Category ID + 1"
                  :lib/source   :source/expressions}
                 {:id (meta/id :categories :id) :name "ID"}
                 {:id (meta/id :categories :name) :name "NAME"}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-expressions-exclude-boolean-expressions-test
  (testing "orderable-columns should filter out boolean expressions."
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/expression "Name is empty?"  (lib/is-empty (lib/field "VENUES" "NAME"))))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:id (meta/id :categories :id) :name "ID"}
                 {:id (meta/id :categories :name) :name "NAME"}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-explicit-joins-test
  (testing "orderable-columns should include columns from explicit joins"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :categories)
                                   (lib/=
                                    (lib/field "VENUES" "CATEGORY_ID")
                                    (lib/with-join-alias (lib/field "CATEGORIES" "ID") "Cat")))
                                  (lib/with-join-alias "Cat")
                                  (lib/with-join-fields :all))))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id) :name "ID"}
                 {:id (meta/id :venues :name) :name "NAME"}
                 {:id (meta/id :venues :category-id) :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude) :name "LATITUDE"}
                 {:id (meta/id :venues :longitude) :name "LONGITUDE"}
                 {:id (meta/id :venues :price) :name "PRICE"}
                 {:lib/type     :metadata/field
                  :name         "ID"
                  :display_name "Categories → ID" ; should we be using the explicit alias we gave this join?
                  :source_alias "Cat"
                  :id           (meta/id :categories :id)
                  :table_id     (meta/id :categories)
                  :base_type    :type/BigInteger}
                 {:lib/type     :metadata/field
                  :name         "NAME"
                  :display_name "Categories → Name"
                  :source_alias "Cat"
                  :id           (meta/id :categories :name)
                  :table_id     (meta/id :categories)
                  :base_type    :type/Text}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-columns-source-metadata-test
  (testing "orderable-columns should use metadata for source query."
    (let [query (lib.tu/query-with-card-source-table)]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:name "ID"
                  :base_type :type/BigInteger}
                 {:name "NAME"
                  :base_type :type/Text}
                 {:name "CATEGORY_ID"
                  :base_type :type/Integer}
                 {:name "LATITUDE"
                  :base_type :type/Float}
                 {:name "LONGITUDE"
                  :base_type :type/Float}
                 {:name "PRICE"
                  :base_type :type/Integer}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-columns-e2e-test
  (testing "Use the metadata returned by `orderable-columns` to add a new order-by to a query."
    (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")]
      (is (=? {:lib/type :mbql/query
               :database (meta/id)
               :stages   [{:lib/type     :mbql.stage/mbql
                           :source-table (meta/id :venues)
                           :lib/options  {:lib/uuid string?}}]}
              query))
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (let [orderable-columns (lib/orderable-columns query)
              col               (m/find-first #(= (:id %) (meta/id :venues :name)) orderable-columns)
              query'            (lib/order-by query col)]
          (is (=? {:lib/type :mbql/query
                   :database (meta/id)
                   :stages   [{:lib/type     :mbql.stage/mbql
                               :source-table (meta/id :venues)
                               :lib/options  {:lib/uuid string?}
                               :order-by     [[:asc
                                               {:lib/uuid string?}
                                               [:field {:lib/uuid string? :base-type :type/Text} (meta/id :venues :name)]]]}]}
                  query'))
          (is (=? [[:asc
                    {:lib/uuid string?}
                    [:field {:lib/uuid string? :base-type :type/Text} (meta/id :venues :name)]]]
                  (lib/order-bys query'))))))))

(deftest ^:parallel order-bys-with-duplicate-column-names-test
  (testing "Order by stuff should work with two different columns named ID (#29702)"
    (is (=? [{:id             (meta/id :venues :id)
              :name           "ID"
              :lib/source     :source/previous-stage
              :lib/type       :metadata/field
              :base_type      :type/BigInteger
              :effective_type :type/BigInteger
              :display_name   "ID"
              :table_id       (meta/id :venues)}
             {:id             (meta/id :categories :id)
              :name           "ID_2"
              :lib/source     :source/previous-stage
              :lib/type       :metadata/field
              :base_type      :type/BigInteger
              :effective_type :type/BigInteger
              :display_name   "ID"
              :table_id       (meta/id :categories)}]
            (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                (lib/join (-> (lib/join-clause
                               (meta/table-metadata :categories)
                               (lib/=
                                (lib/field "VENUES" "CATEGORY_ID")
                                (lib/field "CATEGORIES" "ID")))
                              (lib/with-join-fields :all)))
                (lib/fields [(lib/field "VENUES" "ID")  (lib/field "CATEGORIES" "ID")])
                (lib/append-stage)
                (lib/orderable-columns))))))

(deftest ^:parallel orderable-columns-include-expressions-test
  (testing "orderable-columns should include expressions"
    (is (=? [{:name "ID"}
             {:name "NAME"}
             {:name "CATEGORY_ID"}
             {:name "LATITUDE"}
             {:name "LONGITUDE"}
             {:name "PRICE"}
             {:lib/type     :metadata/field
              :name         "expr"
              :display_name "expr"
              :lib/source   :source/expressions}
             {:name "ID", :lib/source :source/implicitly-joinable}
             {:name "NAME", :lib/source :source/implicitly-joinable}]
            (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                (lib/fields [(lib/field "VENUES" "ID")])
                (lib/orderable-columns))))))

(deftest ^:parallel order-by-expression-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/expression "expr" (lib/absolute-datetime "2020" :month))
                  (lib/fields [(lib/field "VENUES" "ID")]))]
    (is (= [{:id (meta/id :venues :id),          :name "ID",          :display_name "ID",          :lib/source :source/table-defaults}
            {:id (meta/id :venues :name),        :name "NAME",        :display_name "Name",        :lib/source :source/table-defaults}
            {:id (meta/id :venues :category-id), :name "CATEGORY_ID", :display_name "Category ID", :lib/source :source/table-defaults}
            {:id (meta/id :venues :latitude),    :name "LATITUDE",    :display_name "Latitude",    :lib/source :source/table-defaults}
            {:id (meta/id :venues :longitude),   :name "LONGITUDE",   :display_name "Longitude",   :lib/source :source/table-defaults}
            {:id (meta/id :venues :price),       :name "PRICE",       :display_name "Price",       :lib/source :source/table-defaults}
            {:name "expr", :display_name "expr", :lib/source :source/expressions}
            {:id (meta/id :categories :id),   :name "ID",   :display_name "ID",   :lib/source :source/implicitly-joinable}
            {:id (meta/id :categories :name), :name "NAME", :display_name "Name", :lib/source :source/implicitly-joinable}]
           (map #(select-keys % [:id :name :display_name :lib/source])
                (lib/orderable-columns query))))
    (let [expr (m/find-first #(= (:name %) "expr") (lib/orderable-columns query))]
      (is (=? {:lib/type   :metadata/field
               :lib/source :source/expressions
               :name       "expr"}
              expr))
      (let [updated-query (lib/order-by query expr)]
        (is (=? {:stages [{:order-by [[:asc {} [:expression {} "expr"]]]}]}
                updated-query))
        (testing "description"
          (is (= "Venues, Sorted by expr ascending"
                 (lib/describe-query updated-query))))))))
