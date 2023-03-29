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
;;; make sure that given an existing query, the expected description was generated correctly.

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

(deftest ^:parallel describe-order-by-expression-reference-test
    ;;   it("should work with expressions", () => {
  ;;     const query = {
  ;;       "source-table": PRODUCTS.id,
  ;;       expressions: {
  ;;         Foo: ["concat", "Foo ", ["field", 4, null]],
  ;;       },
  ;;       "order-by": [["asc", ["expression", "Foo", null]]],
  ;;     };
  ;;     expect(base_question._getOrderByDescription(PRODUCTS, query)).toEqual([
  ;;       "Sorted by ",
  ;;       ["Foo ascending"],
  ;;     ]);
  ;;   });
  ;; });

  )

(deftest ^:parallel orderable-columns-breakouts-test
  (testing "If query has aggregations and/or breakouts, you can only order by those."
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
                  :source             :breakout
                  :fk_target_field_id (meta/id :categories :id)
                  :field_ref          [:field
                                       {:base-type :type/Integer, :lib/uuid string?}
                                       (meta/id :venues :category-id)]
                  :effective_type     :type/Integer
                  :id                 (meta/id :venues :category-id)
                  :display_name       "Category ID"
                  :base_type          :type/Integer}
                 {:lib/type     :metadata/field
                  :base_type    :type/Integer
                  :name         "sum_price"
                  :display_name "Sum of Price"
                  :field_ref    [:aggregation {:lib/uuid string?, :base-type :type/Integer} 0]
                  :source       :aggregation}
                 {:lib/type     :metadata/field
                  :base_type    :type/Float
                  :name         "avg_price_plus_1"
                  :display_name "Average of Price + 1"
                  :field_ref    [:aggregation {:lib/uuid string?, :base-type :type/Float} 1]
                  :source       :aggregation}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-columns-breakouts-with-expression-test
  (testing "If query has aggregations and/or breakouts, you can only order by those (with an expression)"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/expression "Category ID + 1"  (lib/+ (lib/field "VENUES" "CATEGORY_ID") 1))
                    (lib/breakout [:expression {:lib/uuid (str (random-uuid))} "Category ID + 1"]))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:lib/type     :metadata/field
                  :field_ref    [:expression {:lib/uuid string?} "Category ID + 1"]
                  :name         "Category ID + 1"
                  :display_name "Category ID + 1"
                  :base_type    :type/Integer
                  :source       :breakout}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-columns-test
  (let [query (lib/query-for-table-name meta/metadata-provider "VENUES")]
    (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
      (is (=? [{:lib/type     :metadata/field
                :name         "ID"
                :display_name "ID"
                :id           (meta/id :venues :id)
                :table_id     (meta/id :venues)
                :base_type    :type/BigInteger
                :field_ref    [:field {:lib/uuid string?, :base-type :type/BigInteger} (meta/id :venues :id)]}
               {:lib/type     :metadata/field
                :name         "NAME"
                :display_name "Name"
                :id           (meta/id :venues :name)
                :table_id     (meta/id :venues)
                :base_type    :type/Text
                :field_ref    [:field {:lib/uuid string?, :base-type :type/Text} (meta/id :venues :name)]}
               {:lib/type     :metadata/field
                :name         "CATEGORY_ID"
                :display_name "Category ID"
                :id           (meta/id :venues :category-id)
                :table_id     (meta/id :venues)
                :field_ref    [:field {:lib/uuid string?, :base-type :type/Integer} (meta/id :venues :category-id)]}
               {:lib/type     :metadata/field
                :name         "LATITUDE"
                :display_name "Latitude"
                :id           (meta/id :venues :latitude)
                :table_id     (meta/id :venues)
                :base_type    :type/Float
                :field_ref    [:field {:lib/uuid string?, :base-type :type/Float} (meta/id :venues :latitude)]}
               {:lib/type     :metadata/field
                :name         "LONGITUDE"
                :display_name "Longitude"
                :id           (meta/id :venues :longitude)
                :table_id     (meta/id :venues)
                :base_type    :type/Float
                :field_ref    [:field {:lib/uuid string?, :base-type :type/Float} (meta/id :venues :longitude)]}
               {:lib/type     :metadata/field
                :name         "PRICE"
                :display_name "Price"
                :id           (meta/id :venues :price)
                :table_id     (meta/id :venues)
                :base_type    :type/Integer
                :field_ref    [:field {:lib/uuid string?, :base-type :type/Integer} (meta/id :venues :price)]}
               {:lib/type     :metadata/field
                :name         "ID"
                :display_name "ID"
                :id           (meta/id :categories :id)
                :table_id     (meta/id :categories)
                :base_type    :type/BigInteger
                :field_ref    [:field
                               {:lib/uuid string?, :base-type :type/BigInteger, :source-field (meta/id :venues :category-id)}
                               (meta/id :categories :id)]}
               {:lib/type     :metadata/field
                :name         "NAME"
                :display_name "Name"
                :id           (meta/id :categories :name)
                :table_id     (meta/id :categories)
                :base_type    :type/Text
                :field_ref    [:field
                               {:lib/uuid string?, :base-type :type/Text, :source-field (meta/id :venues :category-id)}
                               (meta/id :categories :name)]}]
              (lib/orderable-columns query))))))

(deftest ^:parallel orderable-expressions-test
  (testing "orderable-columns should include expressions"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/expression "Category ID + 1"  (lib/+ (lib/field "VENUES" "CATEGORY_ID") 1)))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:lib/type     :metadata/field
                  :base_type    :type/Integer
                  :name         "category_id_plus_1"
                  :display_name "Category ID + 1"
                  :field_ref    [:expression
                                 {:lib/uuid string?, :base-type :type/Integer}
                                 "Category ID + 1"]
                  :source       :expressions}
                 {:id (meta/id :venues :id), :name "ID"}
                 {:id (meta/id :venues :name), :name "NAME"}
                 {:id (meta/id :venues :category-id), :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude), :name "LATITUDE"}
                 {:id (meta/id :venues :longitude), :name "LONGITUDE"}
                 {:id (meta/id :venues :price), :name "PRICE"}
                 {:id (meta/id :categories :id), :name "ID"}
                 {:id (meta/id :categories :name), :name "NAME"}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-expressions-exclude-boolean-expressions-test
  (testing "orderable-columns should filter out boolean expressions."
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/expression "Name is empty?"  (lib/is-empty (lib/field "VENUES" "NAME"))))]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:id (meta/id :venues :id), :name "ID"}
                 {:id (meta/id :venues :name), :name "NAME"}
                 {:id (meta/id :venues :category-id), :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude), :name "LATITUDE"}
                 {:id (meta/id :venues :longitude), :name "LONGITUDE"}
                 {:id (meta/id :venues :price), :name "PRICE"}
                 {:id (meta/id :categories :id), :name "ID"}
                 {:id (meta/id :categories :name), :name "NAME"}]
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
        (is (=? [{:id (meta/id :venues :id), :name "ID"}
                 {:id (meta/id :venues :name), :name "NAME"}
                 {:id (meta/id :venues :category-id), :name "CATEGORY_ID"}
                 {:id (meta/id :venues :latitude), :name "LATITUDE"}
                 {:id (meta/id :venues :longitude), :name "LONGITUDE"}
                 {:id (meta/id :venues :price), :name "PRICE"}
                 {:lib/type     :metadata/field
                  :name         "ID"
                  :display_name "Categories → ID" ; should we be using the explicit alias we gave this join?
                  :source_alias "Cat"
                  :id           (meta/id :categories :id)
                  :table_id     (meta/id :categories)
                  :base_type    :type/BigInteger
                  :field_ref    [:field
                                 {:lib/uuid string?, :base-type :type/BigInteger, :join-alias "Cat"}
                                 (meta/id :categories :id)]}
                 {:lib/type     :metadata/field
                  :name         "NAME"
                  :display_name "Categories → Name"
                  :source_alias "Cat"
                  :id           (meta/id :categories :name)
                  :table_id     (meta/id :categories)
                  :base_type    :type/Text
                  :field_ref    [:field
                                 {:lib/uuid string?, :base-type :type/Text, :join-alias "Cat"}
                                 (meta/id :categories :name)]}]
                (lib/orderable-columns query)))))))

(deftest ^:parallel orderable-columns-source-metadata-test
  (testing "orderable-columns should use metadata for source query."
    (let [query (lib.tu/query-with-card-source-table)]
      (testing (lib.util/format "Query =\n%s" (u/pprint-to-str query))
        (is (=? [{:name "ID"
                  :base_type :type/BigInteger
                  :field_ref [:field {:lib/uuid string?, :base-type :type/BigInteger} "ID"]}
                 {:name "NAME"
                  :base_type :type/Text
                  :field_ref [:field {:lib/uuid string?, :base-type :type/Text} "NAME"]}
                 {:name "CATEGORY_ID"
                  :base_type :type/Integer
                  :field_ref [:field {:lib/uuid string?, :base-type :type/Integer} "CATEGORY_ID"]}
                 {:name "LATITUDE"
                  :base_type :type/Float
                  :field_ref [:field {:lib/uuid string?, :base-type :type/Float} "LATITUDE"]}
                 {:name "LONGITUDE"
                  :base_type :type/Float
                  :field_ref [:field {:lib/uuid string?, :base-type :type/Float} "LONGITUDE"]}
                 {:name "PRICE"
                  :base_type :type/Integer
                  :field_ref [:field {:lib/uuid string?, :base-type :type/Integer} "PRICE"]}]
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
                                               [:field {:lib/uuid string?, :base-type :type/Text} (meta/id :venues :name)]]]}]}
                  query'))
          (is (=? [[:asc
                    {:lib/uuid string?}
                    [:field {:lib/uuid string?, :base-type :type/Text} (meta/id :venues :name)]]]
                  (lib/order-bys query'))))))))
